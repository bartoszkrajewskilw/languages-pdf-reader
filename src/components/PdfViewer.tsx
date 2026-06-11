import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
} from 'react';
import { Document, Page } from 'react-pdf';
import { findWordAndSentence, sentenceRange, type WordContext } from '../text/sentence';
import { buildPageText, type RawItem, type PageText } from '../text/pageText';
import { bookPosition } from '../align/bookText';

// Derive the document type from react-pdf's own callback so it always matches
// the pdfjs-dist copy react-pdf actually uses (avoids dual-package type clashes).
type PDFDoc = Parameters<NonNullable<ComponentProps<typeof Document>['onLoadSuccess']>>[0];

interface Props {
  blob: Blob;
  page: number; // current/desired page (drives the indicator + jump-to)
  scale: number;
  onNumPages: (n: number) => void;
  onPageChange: (page: number) => void;
  onCollect: (ctx: WordContext, position: number) => void;
  // A spot to briefly highlight (e.g. where the audio landed). `offset` is the
  // char offset within that page's reconstructed text; `nonce` retriggers it.
  highlight: { page: number; offset: number; nonce: number } | null;
}

const WORD_CHAR = /[\p{L}\p{N}'’\-]/u;
const GAP = 16; // vertical gap between pages, px
const WINDOW = 2; // how many pages to render on each side of the viewport
const DEFAULT_RATIO = 1.414; // page height / width fallback (A4-ish)

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

// Resolve the text node + character offset under a screen point, so we can find
// the exact clicked word from the natively-rendered text.
function caretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y);
    return r ? { node: r.startContainer, offset: r.startOffset } : null;
  }
  return null;
}

export default function PdfViewer({
  blob,
  page,
  scale,
  onNumPages,
  onPageChange,
  onCollect,
  highlight,
}: Props) {
  const [pdfDoc, setPdfDoc] = useState<PDFDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(800);
  // Per-page aspect ratios (height / width), measured once up front. Pages in a
  // single PDF can differ in size (front matter vs body), and virtualized
  // scrolling needs deterministic page heights so positions never drift.
  const [ratios, setRatios] = useState<number[]>([]);
  const [range, setRange] = useState({ start: 1, end: 1 });
  const [pageTexts, setPageTexts] = useState<Map<number, PageText>>(new Map());
  const pageTextsRef = useRef<Map<number, PageText>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef(page);
  const rafRef = useRef(0);
  // Transient "where the audio landed" highlight overlays + their timers.
  const hlRaf = useRef(0);
  const hlTimer = useRef(0);
  const hlEls = useRef<HTMLElement[]>([]);

  const file = useMemo(() => blob, [blob]);
  const renderWidth = Math.round(width * scale);
  const ready = ratios.length === numPages && numPages > 0;

  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  // Per-page heights and cumulative tops (for scroll math + jump-to-page).
  const heights = useMemo(
    () => ratios.map((r) => Math.round((r || DEFAULT_RATIO) * renderWidth)),
    [ratios, renderWidth],
  );
  const tops = useMemo(() => {
    const t = new Array(heights.length + 1);
    t[0] = 0;
    for (let i = 0; i < heights.length; i++) t[i + 1] = t[i] + heights[i] + GAP;
    return t;
  }, [heights]);

  const pageAt = useCallback(
    (y: number) => {
      if (!ready) return 1;
      let lo = 1;
      let hi = numPages;
      let ans = 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (tops[mid - 1] <= y) {
          ans = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return ans;
    },
    [ready, numPages, tops],
  );

  // Track container width so pages fit and zoom is relative to it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth - 32);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measure every page's aspect ratio once the document loads (fast: reads page
  // dimensions, does not render). This is what keeps scrolling exact.
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      const n = pdfDoc.numPages;
      const out = new Array<number>(n).fill(DEFAULT_RATIO);
      const CHUNK = 40;
      for (let s = 0; s < n && !cancelled; s += CHUNK) {
        await Promise.all(
          Array.from({ length: Math.min(CHUNK, n - s) }, (_, k) => s + k).map((i) =>
            pdfDoc
              .getPage(i + 1)
              .then((p) => {
                const v = p.getViewport({ scale: 1 });
                out[i] = v.height / v.width;
              })
              .catch(() => {}),
          ),
        );
      }
      if (!cancelled) setRatios(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc]);

  // Recompute the current page (by viewport center) and the render window.
  const recompute = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !ready) return;
    const cur = pageAt(el.scrollTop + el.clientHeight / 2);
    if (cur !== currentRef.current) {
      currentRef.current = cur;
      onPageChangeRef.current(cur);
    }
    const start = clamp(pageAt(el.scrollTop) - WINDOW, 1, numPages);
    const end = clamp(pageAt(el.scrollTop + el.clientHeight) + WINDOW, 1, numPages);
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [ready, pageAt, numPages]);

  function onScroll() {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      recompute();
    });
  }

  // Jump when the page is changed externally (the sidebar page box).
  useEffect(() => {
    if (page === currentRef.current) return;
    currentRef.current = page;
    const el = scrollRef.current;
    if (el && ready) el.scrollTop = tops[page - 1];
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Anchor the current page when the layout changes (zoom/width) or once the
  // page sizes resolve, and seed the initial window.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !ready) return;
    el.scrollTop = tops[currentRef.current - 1];
    recompute();
  }, [tops, ready, recompute]);

  // Lazily build text for pages entering the window (for click-to-collect).
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    const need: number[] = [];
    for (let n = range.start; n <= range.end; n++) if (!pageTextsRef.current.has(n)) need.push(n);
    if (!need.length) return;
    (async () => {
      for (const n of need) {
        const pg = await pdfDoc.getPage(n);
        const tc = await pg.getTextContent();
        if (cancelled) return;
        pageTextsRef.current.set(n, buildPageText(tc.items as RawItem[]));
        setPageTexts(new Map(pageTextsRef.current));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, range]);

  // A custom text renderer per page (stable unless that page's text changes).
  const renderers = useMemo(() => {
    const m = new Map<number, (item: { str: string; itemIndex: number }) => string>();
    for (const [n, pt] of pageTexts) {
      m.set(n, (item) => {
        if (!item.str) return '';
        const start = pt.offsets.get(item.itemIndex);
        if (start == null) return escapeHtml(item.str);
        return `<span class="lw-item" data-start="${start}">${escapeHtml(item.str)}</span>`;
      });
    }
    return m;
  }, [pageTexts]);

  function flashWord(node: Node, offset: number) {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent ?? '';
    let s = offset;
    let e = offset;
    while (s > 0 && WORD_CHAR.test(text[s - 1])) s--;
    while (e < text.length && WORD_CHAR.test(text[e])) e++;
    if (s === e) return;
    const r = document.createRange();
    r.setStart(node, s);
    r.setEnd(node, e);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(r);
    window.setTimeout(() => sel.removeAllRanges(), 700);
  }

  // Briefly mark where the audio landed: find the sentence containing the given
  // in-page offset, scroll it to the middle, and pulse a highlight over the whole
  // sentence (which may wrap across several rendered lines).
  useEffect(() => {
    if (!highlight || !ready) return;
    const { page: hp, offset } = highlight;

    const clear = () => {
      if (hlRaf.current) clearTimeout(hlRaf.current);
      if (hlTimer.current) clearTimeout(hlTimer.current);
      hlRaf.current = 0;
      hlTimer.current = 0;
      hlEls.current.forEach((el) => el.remove());
      hlEls.current = [];
    };
    clear();

    let attempts = 0;
    const tick = () => {
      attempts++;
      const scroller = scrollRef.current;
      const slot = scroller?.querySelector(
        `.pdf-page-slot[data-page="${hp}"]`,
      ) as HTMLElement | null;
      const pt = pageTextsRef.current.get(hp);
      const spans = slot
        ? (Array.from(slot.querySelectorAll('.lw-item[data-start]')) as HTMLElement[])
        : [];

      if (scroller && slot && pt && spans.length) {
        // Span text nodes in reading order, with their char offset into pt.full.
        const infos = spans
          .map((el) => ({
            start: Number(el.dataset.start),
            node: el.firstChild,
            len: el.firstChild?.textContent?.length ?? 0,
          }))
          .filter(
            (s) => s.node != null && s.node.nodeType === Node.TEXT_NODE && !Number.isNaN(s.start),
          )
          .sort((a, b) => a.start - b.start) as {
          start: number;
          node: Node;
          len: number;
        }[];

        // The sentence containing the landed word, as a char range in pt.full.
        const sr = sentenceRange(pt.full, offset) ?? { start: offset, end: offset + 1 };

        // Map a char position to (text node, local offset). `atEnd` resolves the
        // exclusive end boundary (the point just after char `pos - 1`).
        const point = (pos: number, atEnd: boolean) => {
          const c = atEnd ? pos - 1 : pos;
          for (let i = 0; i < infos.length; i++) {
            const sp = infos[i];
            if (c < sp.start) {
              if (atEnd) {
                const prev = infos[i - 1] ?? sp;
                return { node: prev.node, local: i === 0 ? 0 : prev.len };
              }
              return { node: sp.node, local: 0 };
            }
            if (c < sp.start + sp.len) {
              return { node: sp.node, local: c - sp.start + (atEnd ? 1 : 0) };
            }
          }
          const last = infos[infos.length - 1];
          return { node: last.node, local: last.len };
        };

        if (infos.length) {
          const a = point(sr.start, false);
          const b = point(sr.end, true);
          const range = document.createRange();
          range.setStart(a.node, clamp(a.local, 0, a.node.textContent?.length ?? 0));
          range.setEnd(b.node, clamp(b.local, 0, b.node.textContent?.length ?? 0));
          if (range.collapsed) range.selectNode(a.node);

          // Center the viewport on the actual landed WORD (not the sentence's
          // bounding box) — the audio is at that word, and centering the whole
          // sentence would sit a line or two off for a multi-line sentence.
          const scRect = scroller.getBoundingClientRect();
          const wp = point(offset, false);
          const wtext = wp.node.textContent ?? '';
          let ws = clamp(wp.local, 0, wtext.length);
          let we = ws;
          while (ws > 0 && WORD_CHAR.test(wtext[ws - 1])) ws--;
          while (we < wtext.length && WORD_CHAR.test(wtext[we])) we++;
          if (ws === we) we = Math.min(wtext.length, ws + 1);
          const wordRange = document.createRange();
          wordRange.setStart(wp.node, ws);
          wordRange.setEnd(wp.node, we);
          const wbr = wordRange.getBoundingClientRect();
          const top =
            wbr.top + wbr.height / 2 - scRect.top + scroller.scrollTop - scroller.clientHeight / 2;
          // Instant, not smooth: a smooth animation here gets interrupted by the
          // viewer's own scroll/recompute cycle during a page jump and lands short.
          scroller.scrollTop = Math.max(0, top);

          // One pulse rect per line of the sentence, anchored to the page slot.
          const slotRect = slot.getBoundingClientRect();
          for (const rc of Array.from(range.getClientRects())) {
            if (rc.width < 1 || rc.height < 1) continue;
            const d = document.createElement('div');
            d.className = 'lw-flash';
            d.style.left = `${rc.left - slotRect.left}px`;
            d.style.top = `${rc.top - slotRect.top}px`;
            d.style.width = `${rc.width}px`;
            d.style.height = `${rc.height}px`;
            slot.appendChild(d);
            hlEls.current.push(d);
          }
          hlTimer.current = window.setTimeout(clear, 2600);
          return; // done
        }
      }
      // setTimeout (not rAF) so the marker still renders if the tab was
      // backgrounded while the transcription ran.
      if (attempts < 250) hlRaf.current = window.setTimeout(tick, 50);
    };
    hlRaf.current = window.setTimeout(tick, 50);
    return clear;
  }, [highlight, ready]);

  function handleClick(e: MouseEvent) {
    const caret = caretFromPoint(e.clientX, e.clientY);
    if (!caret) return;
    const el =
      caret.node.nodeType === Node.TEXT_NODE
        ? caret.node.parentElement
        : (caret.node as HTMLElement);
    const span = el?.closest('.lw-item') as HTMLElement | null;
    const slot = el?.closest('.pdf-page-slot') as HTMLElement | null;
    if (!span || !slot) return;
    const pageNum = Number(slot.dataset.page);
    const pt = pageTextsRef.current.get(pageNum);
    if (!pt) return;
    const start = Number(span.dataset.start);
    if (Number.isNaN(start)) return;
    // Stitch the previous and next page (when available) around this one so a
    // sentence that begins/ends on an adjacent page is captured whole.
    const prev = pageTextsRef.current.get(pageNum - 1)?.full ?? '';
    const next = pageTextsRef.current.get(pageNum + 1)?.full ?? '';
    const prefix = prev ? prev + ' ' : '';
    const combined = prefix + pt.full + (next ? ' ' + next : '');
    const ctx = findWordAndSentence(combined, prefix.length + start + caret.offset);
    if (!ctx) return;
    flashWord(caret.node, caret.offset);
    // Record where in the book this word sits, so it can be sorted "in book" order
    // later with no matching cost (we know the exact spot at click time).
    onCollect(ctx, bookPosition(pageNum, start + caret.offset));
  }

  const slots = ready ? Array.from({ length: numPages }, (_, i) => i + 1) : [];

  return (
    <div className="pdf-scroll" ref={scrollRef} onScroll={onScroll} onClick={handleClick}>
      <Document
        file={file}
        onLoadSuccess={(doc) => {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          onNumPages(doc.numPages);
        }}
        loading={<div className="muted center">Loading PDF…</div>}
        error={<div className="muted center">Could not load this PDF.</div>}
      >
        {!ready && pdfDoc && <div className="muted center">Preparing pages…</div>}
        {slots.map((n) => {
          const visible = n >= range.start && n <= range.end;
          return (
            <div
              key={n}
              className="pdf-page-slot"
              data-page={n}
              // Deterministic per-page height (exact, so scroll never drifts).
              // overflow is visible, so a page is never clipped even if its
              // rendered height differs from the estimate by a pixel.
              style={{ width: renderWidth, height: heights[n - 1], marginBottom: GAP }}
            >
              {visible ? (
                <Page
                  pageNumber={n}
                  width={renderWidth}
                  customTextRenderer={renderers.get(n)}
                  renderAnnotationLayer={false}
                  loading=""
                />
              ) : (
                <div className="pdf-page-placeholder">{n}</div>
              )}
            </div>
          );
        })}
      </Document>
    </div>
  );
}

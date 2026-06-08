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
import { findWordAndSentence, type WordContext } from '../text/sentence';

// Derive the document type from react-pdf's own callback so it always matches
// the pdfjs-dist copy react-pdf actually uses (avoids dual-package type clashes).
type PDFDoc = Parameters<NonNullable<ComponentProps<typeof Document>['onLoadSuccess']>>[0];

interface PageText {
  full: string;
  offsets: Map<number, number>; // text-item index -> start char offset in `full`
}

interface Props {
  blob: Blob;
  page: number; // current/desired page (drives the indicator + jump-to)
  scale: number;
  onNumPages: (n: number) => void;
  onPageChange: (page: number) => void;
  onCollect: (ctx: WordContext) => void;
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

type RawItem = { str?: string; transform?: number[]; height?: number };

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Reconstruct a page's text + per-item offsets, with two refinements:
//  - the running header/footer (chapter title + page number bands, set off from
//    the body by extra whitespace) is dropped, so it never leaks into a sentence;
//  - wrapped lines join with a space (sentences flow across them) while a large
//    vertical gap (paragraph/heading break) becomes a newline.
function buildPageText(items: RawItem[]): PageText {
  type It = { i: number; str: string; y: number; h: number };
  const its: It[] = [];
  items.forEach((item, i) => {
    if (typeof item.str === 'string' && item.transform) {
      its.push({ i, str: item.str, y: item.transform[5], h: item.height ?? 0 });
    }
  });
  if (!its.length) return { full: '', offsets: new Map() };

  // Cluster items into lines by their y position (top → bottom).
  const medH = median(its.map((t) => t.h).filter((h) => h > 0)) || 12;
  const tol = Math.max(2, medH * 0.6);
  const lineYs: number[] = [];
  for (const t of [...its].sort((a, b) => b.y - a.y)) {
    const last = lineYs[lineYs.length - 1];
    if (last == null || Math.abs(last - t.y) > tol) lineYs.push(t.y);
  }
  const lineOf = (y: number) => {
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < lineYs.length; k++) {
      const d = Math.abs(lineYs[k] - y);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  };

  const lineGaps: number[] = [];
  for (let k = 1; k < lineYs.length; k++) lineGaps.push(lineYs[k - 1] - lineYs[k]);
  const medGap = median(lineGaps);
  const headFootThr = medGap > 0 ? medGap * 1.5 : Infinity;
  const paraThr = medGap > 0 ? medGap * 1.6 : Infinity;

  // Drop the top line as a header and/or the bottom line as a footer when it is
  // detached from the body by a clearly larger-than-normal gap.
  const drop = new Set<number>();
  const n = lineYs.length;
  if (n >= 3) {
    if (lineYs[0] - lineYs[1] > headFootThr) drop.add(0);
    if (lineYs[n - 2] - lineYs[n - 1] > headFootThr) drop.add(n - 1);
  }

  let full = '';
  let prevY: number | null = null;
  const offsets = new Map<number, number>();
  for (const t of its) {
    if (drop.has(lineOf(t.y))) continue;
    if (full.length > 0) {
      const dy = prevY == null ? 0 : prevY - t.y;
      full += dy > paraThr ? '\n' : ' ';
    }
    offsets.set(t.i, full.length);
    full += t.str;
    prevY = t.y;
  }
  return { full, offsets };
}

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
    onCollect(ctx);
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

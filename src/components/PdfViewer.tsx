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
  page: number;
  full: string;
  offsets: Map<number, number>; // text-item index -> start char offset in `full`
}

interface Props {
  blob: Blob;
  initialPage: number;
  onPageChange: (page: number) => void;
  onCollect: (ctx: WordContext) => void;
}

const WORD_CHAR = /[\p{L}\p{N}'’\-]/u;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Resolve the text node + character offset under a screen point. Lets us find
// the exact clicked word from the natively-rendered text, instead of overlaying
// our own per-word boxes (which PDF.js's per-item scaling transforms misalign).
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

export default function PdfViewer({ blob, initialPage, onPageChange, onCollect }: Props) {
  const [pdfDoc, setPdfDoc] = useState<PDFDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(Math.max(1, initialPage));
  const [scale, setScale] = useState(1);
  const [pageText, setPageText] = useState<PageText | null>(null);
  const [width, setWidth] = useState(800);
  const scrollRef = useRef<HTMLDivElement>(null);

  // react-pdf warns if `file` changes identity every render — memoize it.
  const file = useMemo(() => blob, [blob]);

  // Track container width so the page fits nicely and zoom is relative to it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth - 32);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Report page changes without depending on the callback's identity (the
  // parent recreates it each render, which would otherwise loop).
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  useEffect(() => {
    onPageChangeRef.current(page);
  }, [page]);

  // Reconstruct the active page's text + per-item offsets for sentence extraction.
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      const p = await pdfDoc.getPage(page);
      const tc = await p.getTextContent();
      let full = '';
      const offsets = new Map<number, number>();
      tc.items.forEach((item, i) => {
        if (!('str' in item)) return;
        offsets.set(i, full.length);
        full += item.str;
        full += item.hasEOL ? '\n' : ' ';
      });
      if (!cancelled) setPageText({ page, full, offsets });
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, page]);

  // Wrap each text item in a single span carrying its start offset. One span per
  // item (not per word) preserves PDF.js's exact glyph positioning; the clicked
  // word is resolved from the caret position at click time.
  const renderItem = useCallback(
    (item: { str: string; itemIndex: number }) => {
      const { str, itemIndex } = item;
      if (!str) return '';
      if (!pageText || pageText.page !== page) return escapeHtml(str);
      const start = pageText.offsets.get(itemIndex);
      if (start == null) return escapeHtml(str);
      return `<span class="lw-item" data-start="${start}">${escapeHtml(str)}</span>`;
    },
    [pageText, page],
  );

  // Briefly select the clicked word so the user sees exactly what was captured.
  function flashWord(node: Node, offset: number) {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent ?? '';
    let s = offset;
    let e = offset;
    while (s > 0 && WORD_CHAR.test(text[s - 1])) s--;
    while (e < text.length && WORD_CHAR.test(text[e])) e++;
    if (s === e) return;
    const range = document.createRange();
    range.setStart(node, s);
    range.setEnd(node, e);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
    window.setTimeout(() => sel.removeAllRanges(), 700);
  }

  function handleClick(e: MouseEvent) {
    if (!pageText || pageText.page !== page) return;
    const caret = caretFromPoint(e.clientX, e.clientY);
    if (!caret) return;
    const el =
      caret.node.nodeType === Node.TEXT_NODE
        ? caret.node.parentElement
        : (caret.node as HTMLElement);
    const span = el?.closest('.lw-item') as HTMLElement | null;
    if (!span) return;
    const start = Number(span.dataset.start);
    if (Number.isNaN(start)) return;
    const ctx = findWordAndSentence(pageText.full, start + caret.offset);
    if (!ctx) return;
    flashWord(caret.node, caret.offset);
    onCollect(ctx);
  }

  function goto(p: number) {
    setPage(Math.min(Math.max(1, p), numPages || 1));
  }

  return (
    <div className="pdf">
      <div className="pdf-toolbar">
        <div className="row">
          <button onClick={() => goto(page - 1)} disabled={page <= 1}>
            ◀
          </button>
          <input
            className="page-input"
            type="number"
            min={1}
            max={numPages || 1}
            value={page}
            onChange={(e) => goto(Number(e.target.value))}
          />
          <span className="muted">/ {numPages || '…'}</span>
          <button onClick={() => goto(page + 1)} disabled={page >= numPages}>
            ▶
          </button>
        </div>
        <div className="row">
          <button onClick={() => setScale((s) => Math.max(0.5, +(s - 0.1).toFixed(2)))}>−</button>
          <span className="muted">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(3, +(s + 0.1).toFixed(2)))}>+</button>
        </div>
        <span className="hint muted">Click any word to collect it with its sentence</span>
      </div>

      <div className="pdf-scroll" ref={scrollRef} onClick={handleClick}>
        <Document
          file={file}
          onLoadSuccess={(doc) => {
            setPdfDoc(doc);
            setNumPages(doc.numPages);
            setPage((p) => Math.min(Math.max(1, p), doc.numPages));
          }}
          loading={<div className="muted center">Loading PDF…</div>}
          error={<div className="muted center">Could not load this PDF.</div>}
        >
          <Page
            pageNumber={page}
            width={Math.round(width * scale)}
            customTextRenderer={renderItem}
            renderAnnotationLayer={false}
          />
        </Document>
      </div>
    </div>
  );
}

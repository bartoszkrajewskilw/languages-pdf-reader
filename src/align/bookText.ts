import { pdfjs } from 'react-pdf';
import { buildPageText, type RawItem } from '../text/pageText';

export interface BookText {
  text: string; // whole book, header/footer stripped, pages concatenated
  pageStarts: number[]; // char offset where each (1-based) page's text begins
}

// A single sortable number encoding a position in the book: page-major, then char
// offset within that page. Pages hold a few thousand chars, so 1e6 keeps offsets
// from ever colliding into the next page. Used for "in book" word ordering, so the
// same formula must be used whether the position is recorded at collection time
// (page + click offset) or backfilled from a matched whole-book offset.
export const PAGE_SCALE = 1_000_000;
export function bookPosition(page: number, offsetInPage: number): number {
  return page * PAGE_SCALE + Math.max(0, Math.min(offsetInPage, PAGE_SCALE - 1));
}

// Extract the whole book's text from the PDF (no rendering), reusing the same
// page-text reconstruction as the reader. Used to anchor audio transcripts.
export async function extractBookText(pdf: Blob): Promise<BookText> {
  const data = await pdf.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  let text = '';
  const pageStarts: number[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      pageStarts.push(text.length);
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      text += buildPageText(tc.items as RawItem[]).full + '\n';
    }
  } finally {
    void doc.destroy();
  }
  return { text, pageStarts };
}

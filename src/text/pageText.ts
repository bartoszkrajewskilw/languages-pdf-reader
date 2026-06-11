// Reconstructing readable text from a PDF page's raw text items. Shared by the
// viewer (click-to-collect) and the audio-alignment book-text builder.

export interface PageText {
  full: string;
  offsets: Map<number, number>; // text-item index -> start char offset in `full`
}

export type RawItem = { str?: string; transform?: number[]; height?: number };

export function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Reconstruct a page's text + per-item offsets, with two refinements:
//  - the running header/footer (chapter title + page number bands, set off from
//    the body by extra whitespace) is dropped, so it never leaks into a sentence;
//  - wrapped lines join with a space (sentences flow across them) while a large
//    vertical gap (paragraph/heading break) becomes a newline.
export function buildPageText(items: RawItem[]): PageText {
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

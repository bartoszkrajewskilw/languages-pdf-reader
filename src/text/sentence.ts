// Pure logic for turning a click offset inside a page's reconstructed text
// into the clicked word plus the full sentence that contains it.
//
// This is the heart of the "copy the word together with its context sentence"
// feature, so it is unit-tested in sentence.test.ts.

export interface WordContext {
  word: string;
  sentence: string;
}

// A character that can be part of a word: any Unicode letter or digit, plus the
// internal joiners apostrophe and hyphen (e.g. "well-known", "it's", "qu'il").
const WORD_CHAR = /[\p{L}\p{N}]/u;
const WORD_JOINER = /['’\-]/u;

// Sentence-ending punctuation (kept as part of the sentence).
const TERMINATORS = new Set(['.', '!', '?', '…']);

// Characters that bound a sentence/clause but are NOT kept: clause separators
// and quotation marks. Clicking inside quoted speech should yield just the
// quoted sentence, which is the meaningful context for a learner.
const SOFT_BOUNDARY = new Set([
  ':', ';', '\n',
  '"', '“', '”', '«', '»', '„', '‚',
]);

function isWordChar(ch: string): boolean {
  return WORD_CHAR.test(ch);
}

function isWordPart(ch: string, text: string, i: number): boolean {
  if (isWordChar(ch)) return true;
  // A joiner only counts as part of the word when flanked by word chars.
  if (WORD_JOINER.test(ch)) {
    const prev = text[i - 1];
    const next = text[i + 1];
    return !!prev && !!next && isWordChar(prev) && isWordChar(next);
  }
  return false;
}

/**
 * Given the full text of a page and a character offset (where the user clicked),
 * return the word at that offset and the sentence containing it. Returns null if
 * the offset does not land on a word (e.g. whitespace or punctuation).
 */
export function findWordAndSentence(text: string, offset: number): WordContext | null {
  if (offset < 0 || offset >= text.length) return null;
  if (!isWordPart(text[offset], text, offset)) return null;

  // Expand to word boundaries.
  let wStart = offset;
  while (wStart > 0 && isWordPart(text[wStart - 1], text, wStart - 1)) wStart--;
  let wEnd = offset;
  while (wEnd < text.length - 1 && isWordPart(text[wEnd + 1], text, wEnd + 1)) wEnd++;
  const word = text.slice(wStart, wEnd + 1);

  // Expand left until we pass a terminator or a soft boundary.
  let sStart = wStart;
  while (sStart > 0) {
    const ch = text[sStart - 1];
    if (TERMINATORS.has(ch) || SOFT_BOUNDARY.has(ch)) break;
    sStart--;
  }
  // Expand right: stop *before* a soft boundary, stop *after* a terminator.
  let sEnd = wEnd;
  while (sEnd < text.length - 1) {
    const next = text[sEnd + 1];
    if (SOFT_BOUNDARY.has(next)) break;
    sEnd++;
    if (TERMINATORS.has(next)) break;
  }

  const sentence = trimSentence(text.slice(sStart, sEnd + 1));
  return { word, sentence };
}

// The [start, end) char range of the sentence containing `offset` within `text`,
// trimmed of bracketing whitespace/quotes. Used to highlight the whole sentence the
// audio landed on. Returns null if no word is near the offset.
const TRIM_CHAR = /[\s"“”«»„‚]/u;
export function sentenceRange(
  text: string,
  offset: number,
): { start: number; end: number } | null {
  if (text.length === 0) return null;
  let o = Math.max(0, Math.min(offset, text.length - 1));
  // If the offset isn't on a word, snap to the nearest word character.
  if (!isWordPart(text[o], text, o)) {
    let f = o;
    while (f < text.length && !isWordPart(text[f], text, f)) f++;
    let b = o;
    while (b >= 0 && !isWordPart(text[b], text, b)) b--;
    if (f < text.length && (b < 0 || f - o <= o - b)) o = f;
    else if (b >= 0) o = b;
    else return null;
  }

  let wStart = o;
  while (wStart > 0 && isWordPart(text[wStart - 1], text, wStart - 1)) wStart--;
  let wEnd = o;
  while (wEnd < text.length - 1 && isWordPart(text[wEnd + 1], text, wEnd + 1)) wEnd++;

  let sStart = wStart;
  while (sStart > 0) {
    const ch = text[sStart - 1];
    if (TERMINATORS.has(ch) || SOFT_BOUNDARY.has(ch)) break;
    sStart--;
  }
  let sEnd = wEnd;
  while (sEnd < text.length - 1) {
    const next = text[sEnd + 1];
    if (SOFT_BOUNDARY.has(next)) break;
    sEnd++;
    if (TERMINATORS.has(next)) break;
  }

  while (sStart < sEnd && TRIM_CHAR.test(text[sStart])) sStart++;
  while (sEnd > sStart && TRIM_CHAR.test(text[sEnd])) sEnd--;
  return { start: sStart, end: sEnd + 1 };
}

// Trim whitespace and stray quote characters that bracket a sentence. Terminators
// are letters/punctuation that are kept; only quotes and whitespace are stripped.
function trimSentence(s: string): string {
  return s
    .replace(/\s+/g, ' ') // collapse runs of whitespace (justified text / page joins)
    .trim()
    .replace(/^["“”«»„‚\s]+/u, '')
    .replace(/["“”«»„‚\s]+$/u, '')
    .trim();
}

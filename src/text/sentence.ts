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

// Trim whitespace and stray quote characters that bracket a sentence. Terminators
// are letters/punctuation that are kept; only quotes and whitespace are stripped.
function trimSentence(s: string): string {
  return s
    .trim()
    .replace(/^["“”«»„‚\s]+/u, '')
    .replace(/["“”«»„‚\s]+$/u, '')
    .trim();
}

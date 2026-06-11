// Locate a short transcribed phrase (the audio the listener just heard) in the
// known book text. We don't trust the transcription verbatim — we anchor it to
// the real book text by fuzzy, in-order word matching on distinctive (content)
// words, searching the whole book so a chapter localizes itself (e.g. past front
// matter) without drifting.

export interface Segment {
  start: number;
  text: string;
}

interface BookWord {
  w: string; // normalized (lowercase letters/digits)
  off: number; // char offset in book text
}

const ANCHOR = 6; // how many words (from the first content word) to anchor on
const SLACK = 2; // allowed skips between matched words
const MIN_SCORE = 3; // minimum in-order matches to trust an anchor

// Very common words make poor anchors (they match everywhere).
const STOP = new Set(
  ('the a an and or of to in on at it is was were that this these those he she they we you i ' +
    'his her him them their our your my me as for with but had have has be been by not so no ' +
    'from out up down then there here did do does are will would could should can may might')
    .split(' '),
);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) as string[];
}

function tokenizeWithOffsets(text: string): BookWord[] {
  const out: BookWord[] = [];
  const re = /[\p{L}\p{N}]+/gu;
  let m: RegExpExecArray | null;
  const lower = text.toLowerCase();
  while ((m = re.exec(lower)) !== null) out.push({ w: m[0], off: m.index });
  return out;
}

// An anchor starting at the segment's first distinctive (content) word.
function chooseAnchor(words: string[]): string[] {
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i].length >= 3 && !STOP.has(words[i])) {
      start = i;
      break;
    }
  }
  return words.slice(start, start + ANCHOR);
}

// 1-based page containing `offset`, given each page's start offset (ascending).
export function pageOf(pageStarts: number[], offset: number): number {
  let lo = 0;
  let hi = pageStarts.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pageStarts[mid] <= offset) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans + 1;
}

// How many of the anchor's words match the book in order, starting at index i.
function scoreAt(book: BookWord[], i: number, anchor: string[]): number {
  let bi = i;
  let matched = 0;
  for (const sw of anchor) {
    let found = -1;
    for (let j = bi; j < Math.min(bi + 1 + SLACK, book.length); j++) {
      if (book[j].w === sw) {
        found = j;
        break;
      }
    }
    if (found >= 0) {
      matched++;
      bi = found + 1;
    } else {
      bi += 1;
    }
  }
  return matched;
}


// Walk the phrase's content words in order through the book starting at `from`,
// tolerating small gaps (transcription noise / missing words), and return the
// book index of the LAST word that matched. This is how we land on the end of the
// spoken phrase (the last word actually heard) rather than its beginning.
const TAIL_SKIP = 6; // how far ahead to look for each next content word
function alignTail(book: BookWord[], from: number, content: string[]): number {
  let bi = from;
  let last = from;
  for (const cw of content) {
    let found = -1;
    for (let j = bi; j < Math.min(bi + 1 + TAIL_SKIP, book.length); j++) {
      if (book[j].w === cw) {
        found = j;
        break;
      }
    }
    if (found >= 0) {
      last = found;
      bi = found + 1;
    } else {
      bi += 1; // tolerate a word the book doesn't have (or a transcription error)
    }
  }
  return last;
}

// Core matcher, operating on a pre-tokenized book (so callers that match many
// phrases — e.g. sorting collected words by book position — tokenize the book
// once). We (1) localize the region with a sliding word-overlap window (robust to
// noise/reordering), (2) anchor on the phrase's first distinctive words to find
// where it starts, then (3) align forward to the phrase's END and return that.
// Returns the page (1-based) + char offset, or null if it can't be placed.
function locateInTokens(
  book: BookWord[],
  pageStarts: number[],
  phrase: string,
): { page: number; offset: number } | null {
  const content = tokenize(phrase).filter((w) => w.length >= 3 && !STOP.has(w));
  const wanted = new Set(content);
  if (wanted.size < 3 || book.length === 0) return null;

  // Slide a window over the book and track how many DISTINCT phrase words land in
  // it. Counting distinct (not total) matters: a short sentence's common words —
  // "said", a character's name — repeat heavily in dialogue elsewhere, and counting
  // every occurrence would let such a region outscore the real spot. Distinct
  // counting rewards the place where the phrase's varied words actually co-occur.
  const win = Math.max(20, Math.min(60, wanted.size * 2));
  const inWindow = new Map<string, number>(); // wanted word -> occurrences in window
  let distinct = 0;
  let best = 0;
  let bestEnd = -1;
  for (let i = 0; i < book.length; i++) {
    const wi = book[i].w;
    if (wanted.has(wi)) {
      const c = inWindow.get(wi) ?? 0;
      if (c === 0) distinct++;
      inWindow.set(wi, c + 1);
    }
    const j = i - win;
    if (j >= 0) {
      const wj = book[j].w;
      if (wanted.has(wj)) {
        const c = inWindow.get(wj) ?? 0;
        inWindow.set(wj, c - 1);
        if (c - 1 === 0) distinct--;
      }
    }
    if (distinct > best) {
      best = distinct;
      bestEnd = i;
    }
  }
  // Need a reasonable share of the phrase's distinctive words to land together —
  // but never more than the phrase actually has (short phrases are still placeable
  // when all their distinctive words line up).
  const need = Math.min(wanted.size, Math.max(3, Math.ceil(wanted.size * 0.3)));
  if (bestEnd < 0 || best < need) return null;
  const winStart = Math.max(0, bestEnd - win + 1);

  // Find where the phrase STARTS in the book by anchoring on its first distinctive
  // words (in order), bounded to the matched window — cheap, and avoids matching a
  // repeated phrase elsewhere in the book.
  const anchor = chooseAnchor(tokenize(phrase));
  let startIdx = -1;
  if (anchor.length >= 2) {
    const lo = Math.max(0, winStart - 6);
    let bestScore = 0;
    for (let i = lo; i <= bestEnd; i++) {
      if (book[i].w !== anchor[0]) continue;
      const sc = scoreAt(book, i, anchor);
      if (sc > bestScore) {
        bestScore = sc;
        startIdx = i;
      }
    }
    if (bestScore < Math.min(MIN_SCORE, anchor.length)) startIdx = -1;
  }

  let idx: number;
  if (startIdx >= 0) {
    // Align to the end of the phrase → the last word the listener heard.
    idx = alignTail(book, startIdx, content);
  } else {
    // Fallback: the first matched distinctive word inside the window.
    idx = winStart;
    for (let k = winStart; k <= bestEnd; k++) {
      if (wanted.has(book[k].w)) {
        idx = k;
        break;
      }
    }
  }
  const off = book[idx].off;
  return { page: pageOf(pageStarts, off), offset: off };
}

// Find where a single phrase best matches in the book (tokenizes the book).
export function locate(
  bookText: string,
  pageStarts: number[],
  phrase: string,
): { page: number; offset: number } | null {
  return locateInTokens(tokenizeWithOffsets(bookText), pageStarts, phrase);
}

// Normalize text to lowercase alphanumeric runs separated by single spaces, and
// record the original char offset of each output character. This lets us match a
// sentence against the book ignoring whitespace/punctuation/quote differences (the
// reconstructed page text collapses justified-line and page-break whitespace) and
// still map the hit back to a real book offset.
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  const alnum = /[\p{L}\p{N}]/u;
  let prevSpace = true; // suppress a leading space
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (alnum.test(ch)) {
      out.push(ch.toLowerCase());
      map.push(i);
      prevSpace = false;
    } else if (!prevSpace) {
      out.push(' ');
      map.push(i);
      prevSpace = true;
    }
  }
  return { norm: out.join(''), map };
}

function normalizePhrase(s: string): string {
  return (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');
}

// Locate many sentences that came verbatim from the book (e.g. a collected word's
// context sentence), to order them by where they appear. Unlike audio transcripts,
// these are exact text, so we first do a plain normalized substring search — like
// Ctrl+F — which places even short phrases ("Flocks of owls") that the fuzzy
// content-word matcher rejects. Falls back to the fuzzy matcher only if the exact
// search misses. The book is processed once for the whole batch.
export function locateSentences(
  bookText: string,
  pageStarts: number[],
  sentences: string[],
): ({ page: number; offset: number } | null)[] {
  const { norm, map } = normalizeWithMap(bookText);
  let book: BookWord[] | null = null; // tokenized lazily, only if a fallback is needed
  return sentences.map((s) => {
    const q = normalizePhrase(s);
    if (q.length >= 2) {
      const pos = norm.indexOf(q);
      if (pos >= 0) {
        const off = map[pos];
        return { page: pageOf(pageStarts, off), offset: off };
      }
    }
    if (!book) book = tokenizeWithOffsets(bookText);
    return locateInTokens(book, pageStarts, s);
  });
}

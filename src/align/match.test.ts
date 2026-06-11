import { describe, it, expect } from 'vitest';
import { pageOf, locate, locateSentences } from './match';

// Two "pages" of book text.
const page1 = 'The dog ran quickly across the green field near the old house. ';
const page2 = 'Later that evening the cat slept soundly on the warm windowsill upstairs.';
const book = page1 + page2;
const pageStarts = [0, page1.length];

describe('pageOf', () => {
  it('maps offsets to 1-based pages', () => {
    expect(pageOf(pageStarts, 0)).toBe(1);
    expect(pageOf(pageStarts, page1.length - 1)).toBe(1);
    expect(pageOf(pageStarts, page1.length)).toBe(2);
    expect(pageOf(pageStarts, book.length - 1)).toBe(2);
  });
});

describe('locate', () => {
  const p1 = 'Title page. Copyright notice. Table of contents listed below. ';
  const p2 = 'The dog ran quickly across the green field chasing a red ball near the old oak tree. ';
  const p3 = 'Later the cat slept soundly on the warm windowsill upstairs beside the open window.';
  const lbook = p1 + p2 + p3;
  const lpages = [0, p1.length, p1.length + p2.length];

  it('places a noisy, reordered phrase on the right page', () => {
    const phrase = 'uh the green field dog ran chasing red ball oak tree umm';
    const r = locate(lbook, lpages, phrase);
    expect(r).not.toBeNull();
    expect(r!.page).toBe(2);
  });

  it('places a phrase from the last page correctly', () => {
    const r = locate(lbook, lpages, 'cat slept warm windowsill upstairs window');
    expect(r!.page).toBe(3);
  });

  it('returns null when nothing matches', () => {
    expect(locate(lbook, lpages, 'zzz qqq vvv xxx wwww')).toBeNull();
  });

  it('is not fooled by repeated common words elsewhere (counts distinct words)', () => {
    // "flatter" is rare and marks the true spot (page 1); "said"/"Dumbledore"/
    // "calmly" repeat heavily in a later dialogue page that must NOT win just by
    // sheer occurrence count.
    const a = 'Dumbledore smiled warmly. You flatter me, said Dumbledore calmly to her there. ';
    const b = 'Nothing much of note happened on this quiet little page at all over here today. ';
    const c =
      'Dumbledore said this, Dumbledore said that, said calmly, said calmly again, ' +
      'Dumbledore said calmly indeed once more clearly.';
    const bk = a + b + c;
    const ps = [0, a.length, a.length + b.length];
    const r = locate(bk, ps, 'You flatter me, said Dumbledore calmly');
    expect(r).not.toBeNull();
    expect(r!.page).toBe(1);
  });

  it('lands on the LAST word heard, not the next sentence', () => {
    // The listener heard up to "…like a bolt of lightning" and paused. The phrase
    // is that heard text; the highlight must land on "lightning" (its last word),
    // not skip forward into "He had had it as long as…" (which would pick "long").
    const p =
      'a very thin scar on his forehead which was shaped like a bolt of lightning. ' +
      'He had had it as long as he could remember.';
    const phrase = 'scar on his forehead which was shaped like a bolt of lightning';
    const r = locate(p, [0], phrase);
    expect(r).not.toBeNull();
    expect(p.slice(r!.offset).toLowerCase().startsWith('lightning')).toBe(true);
  });
});

describe('locateSentences', () => {
  const p1 = 'Title page. Copyright notice here. ';
  const p2 = 'Flocks of owls flew\npast the window\nthat day, and people pointed. ';
  const p3 = 'Later it winked at him.';
  const book = p1 + p2 + p3;
  const pages = [0, p1.length, p1.length + p2.length];

  it('places a short, verbatim phrase the fuzzy matcher would reject', () => {
    // Only two content words ("flocks", "owls") — below the fuzzy threshold — but
    // an exact substring search finds it, even across the reconstructed line breaks.
    const [r] = locateSentences(book, pages, ['Flocks of owls …']);
    expect(r).not.toBeNull();
    expect(r!.page).toBe(2);
    expect(book.slice(r!.offset).startsWith('Flocks')).toBe(true);
  });

  it('places a tiny sentence with quote/whitespace noise', () => {
    const [r] = locateSentences(book, pages, ['’ ‘It winked.']);
    expect(r!.page).toBe(3);
  });

  it('returns null for a phrase not in the book', () => {
    const [r] = locateSentences(book, pages, ['dragons soared over the castle']);
    expect(r).toBeNull();
  });
});

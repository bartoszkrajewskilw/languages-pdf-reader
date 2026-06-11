import { describe, it, expect } from 'vitest';
import { findWordAndSentence, sentenceRange } from './sentence';

describe('findWordAndSentence', () => {
  it('extracts a word in the middle of a sentence', () => {
    const text = 'Der Hund läuft schnell. Die Katze schläft.';
    const offset = text.indexOf('läuft');
    const res = findWordAndSentence(text, offset);
    expect(res).not.toBeNull();
    expect(res!.word).toBe('läuft');
    expect(res!.sentence).toBe('Der Hund läuft schnell.');
  });

  it('extracts the second sentence, not the first', () => {
    const text = 'Der Hund läuft schnell. Die Katze schläft hier.';
    const offset = text.indexOf('Katze');
    const res = findWordAndSentence(text, offset);
    expect(res!.word).toBe('Katze');
    expect(res!.sentence).toBe('Die Katze schläft hier.');
  });

  it('handles a word clicked at the very start of the text', () => {
    const text = 'Hello world. Goodbye.';
    const res = findWordAndSentence(text, 0);
    expect(res!.word).toBe('Hello');
    expect(res!.sentence).toBe('Hello world.');
  });

  it('handles a word in the last sentence with no trailing terminator', () => {
    const text = 'First one. The unfinished tail';
    const offset = text.indexOf('tail');
    const res = findWordAndSentence(text, offset);
    expect(res!.word).toBe('tail');
    expect(res!.sentence).toBe('The unfinished tail');
  });

  it('treats question and exclamation marks as boundaries', () => {
    const text = 'Are you sure? Yes! Absolutely.';
    const offset = text.indexOf('Yes');
    const res = findWordAndSentence(text, offset);
    expect(res!.word).toBe('Yes');
    expect(res!.sentence).toBe('Yes!');
  });

  it('treats a newline / paragraph break as a boundary', () => {
    const text = 'Title line\nDer Satz beginnt hier und endet dort.';
    const offset = text.indexOf('Satz');
    const res = findWordAndSentence(text, offset);
    expect(res!.word).toBe('Satz');
    expect(res!.sentence).toBe('Der Satz beginnt hier und endet dort.');
  });

  it('keeps hyphenated and apostrophed words intact', () => {
    const text = "It's a well-known fact.";
    const offset = text.indexOf('well-known');
    const res = findWordAndSentence(text, offset);
    expect(res!.word).toBe('well-known');
    expect(res!.sentence).toBe("It's a well-known fact.");
  });

  it('returns null when clicking on whitespace or punctuation', () => {
    const text = 'Hello world.';
    const spaceOffset = text.indexOf(' ');
    expect(findWordAndSentence(text, spaceOffset)).toBeNull();
  });

  it('strips surrounding quotes and whitespace from the sentence', () => {
    const text = 'He said: "Das ist gut." Then left.';
    const offset = text.indexOf('gut');
    const res = findWordAndSentence(text, offset);
    expect(res!.word).toBe('gut');
    // Leading quote trimmed; sentence ends at the period.
    expect(res!.sentence).toBe('Das ist gut.');
  });

  it('finds the word when the offset points to its middle', () => {
    const text = 'Ein wunderbares Beispiel hier.';
    const offset = text.indexOf('wunderbares') + 4;
    const res = findWordAndSentence(text, offset);
    expect(res!.word).toBe('wunderbares');
  });
});

describe('sentenceRange', () => {
  const text = 'First sentence here. The dog ran across the field. Last one now.';

  it('returns the whole sentence containing the offset', () => {
    const r = sentenceRange(text, text.indexOf('ran'))!;
    expect(text.slice(r.start, r.end)).toBe('The dog ran across the field.');
  });

  it('works when the landed word is the last word of the sentence', () => {
    const r = sentenceRange(text, text.indexOf('field'))!;
    expect(text.slice(r.start, r.end)).toBe('The dog ran across the field.');
  });

  it('trims leading quotes and whitespace from the range', () => {
    const q = 'He said, “Get the wand now.” Then he left.';
    const r = sentenceRange(q, q.indexOf('wand'))!;
    expect(q.slice(r.start, r.end)).toBe('Get the wand now.');
  });

  it('snaps to the nearest word when the offset is on whitespace', () => {
    const r = sentenceRange(text, text.indexOf(' ran') )!;
    expect(text.slice(r.start, r.end)).toBe('The dog ran across the field.');
  });
});

// Render a sentence with the collected word highlighted, so it's easy to spot.
const WORD_CHAR = /[\p{L}\p{N}'’\-]/u;
const isWordChar = (c?: string) => !!c && WORD_CHAR.test(c);

export default function HighlightedSentence({ text, word }: { text: string; word: string }) {
  if (!word) return <>{text}</>;
  // Find the first standalone (whole-word) occurrence and wrap it.
  let from = 0;
  while (from <= text.length) {
    const idx = text.indexOf(word, from);
    if (idx === -1) break;
    if (!isWordChar(text[idx - 1]) && !isWordChar(text[idx + word.length])) {
      return (
        <>
          {text.slice(0, idx)}
          <strong className="hl">{word}</strong>
          {text.slice(idx + word.length)}
        </>
      );
    }
    from = idx + 1;
  }
  return <>{text}</>;
}

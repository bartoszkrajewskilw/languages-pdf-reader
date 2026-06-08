import { useMemo } from 'react';
import { useWords, removeWord } from '../words';
import HighlightedSentence from './HighlightedSentence';

interface Props {
  bookId: number;
  onRetry: (entryId: number) => void;
}

// The live list of words collected from the current book.
export default function WordPanel({ bookId, onRetry }: Props) {
  const all = useWords();
  const entries = useMemo(
    () =>
      all.filter((e) => e.bookId === bookId).sort((a, b) => a.createdAt - b.createdAt),
    [all, bookId],
  );

  return (
    <div className="word-panel">
      <h3>Collected words ({entries.length})</h3>
      {entries.length === 0 && (
        <p className="muted small">Click a word in the PDF to collect it with its sentence.</p>
      )}
      <ul className="word-list">
        {entries.map((e) => (
          <li key={e.id} className={`word-item status-${e.status}`}>
            <div className="word-item-head">
              <span className="word">{e.word}</span>
              <button
                className="link tiny"
                title="Remove"
                onClick={() => removeWord(e.id!)}
              >
                ✕
              </button>
            </div>
            {e.status === 'pending' && <div className="muted small">Translating…</div>}
            {e.status === 'error' && (
              <div className="error small">
                {e.error}{' '}
                <button className="link tiny" onClick={() => onRetry(e.id!)}>
                  retry
                </button>
              </div>
            )}
            {e.meaning && <div className="meaning">{e.meaning}</div>}
            <div className="sentence small">
              “<HighlightedSentence text={e.sentence} word={e.word} />”
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

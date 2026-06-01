import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteEntry } from '../db';

interface Props {
  bookId: number;
  onRetry: (entryId: number) => void;
}

// The live list of words collected from the current book.
export default function WordPanel({ bookId, onRetry }: Props) {
  const entries = useLiveQuery(
    () => db.entries.where('bookId').equals(bookId).reverse().sortBy('createdAt'),
    [bookId],
  );

  return (
    <div className="word-panel">
      <h3>Collected words ({entries?.length ?? 0})</h3>
      {entries?.length === 0 && (
        <p className="muted small">Click a word in the PDF to collect it with its sentence.</p>
      )}
      <ul className="word-list">
        {entries?.map((e) => (
          <li key={e.id} className={`word-item status-${e.status}`}>
            <div className="word-item-head">
              <span className="word">{e.word}</span>
              {e.partOfSpeech && <span className="pos">{e.partOfSpeech}</span>}
              <button
                className="link tiny"
                title="Remove"
                onClick={() => deleteEntry(e.id!)}
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
            {e.baseForm && e.baseForm !== e.word && (
              <div className="muted small">base: {e.baseForm}</div>
            )}
            <div className="sentence small">“{e.sentence}”</div>
            {e.sentenceTranslation && (
              <div className="sentence-trans small muted">{e.sentenceTranslation}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

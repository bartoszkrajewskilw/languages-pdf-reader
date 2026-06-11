import { useEffect, useMemo, useState } from 'react';
import { useWords, removeWord, updateWords } from '../words';
import { locateSentences } from '../align/match';
import { bookPosition, type BookText } from '../align/bookText';
import type { Entry } from '../types';
import HighlightedSentence from './HighlightedSentence';

type SortMode = 'added' | 'alpha' | 'book';
const SORT_KEY = 'wordSort';
// Stored on words that couldn't be located in the book, so we don't keep retrying
// them on every "in book" sort. They sort to the end.
const UNPLACED = Number.MAX_SAFE_INTEGER;

interface Props {
  bookId: number;
  onRetry: (entryId: number) => void;
  // Lazily provides the book's text + page index (cached), for backfilling the
  // book position of words collected before positions were recorded.
  getBookText: () => Promise<BookText | null>;
}

// The live list of words collected from the current book, sortable by when they
// were added, alphabetically, or by where they appear in the book. The book
// position is stored on each word at collection time, so sorting is a plain
// numeric compare — no per-word matching at sort time.
export default function WordPanel({ bookId, onRetry, getBookText }: Props) {
  const all = useWords();
  const [sortMode, setSortMode] = useState<SortMode>(
    () => (localStorage.getItem(SORT_KEY) as SortMode) || 'added',
  );
  const [backfilling, setBackfilling] = useState(false);

  const bookEntries = useMemo(() => all.filter((e) => e.bookId === bookId), [all, bookId]);

  // Words still missing a stored position (collected before positions existed).
  const unplaced = useMemo(
    () => bookEntries.filter((e) => e.position == null),
    [bookEntries],
  );
  const unplacedKey = unplaced.map((e) => e.id).join(',');

  useEffect(() => {
    localStorage.setItem(SORT_KEY, sortMode);
  }, [sortMode]);

  // One-time backfill: when "in book" is first used, locate the sentence of any
  // word missing a position and persist it. Afterwards every word has a stored
  // position, so this never runs again for them.
  useEffect(() => {
    if (sortMode !== 'book' || unplaced.length === 0) return;
    let cancelled = false;
    setBackfilling(true);
    (async () => {
      const bt = await getBookText();
      if (cancelled) return;
      const patches = new Map<number, Partial<Entry>>();
      if (bt) {
        const hits = locateSentences(
          bt.text,
          bt.pageStarts,
          unplaced.map((e) => e.sentence),
        );
        unplaced.forEach((e, i) => {
          if (e.id == null) return;
          const h = hits[i];
          const pos = h
            ? bookPosition(h.page, h.offset - (bt.pageStarts[h.page - 1] ?? 0))
            : UNPLACED;
          patches.set(e.id, { position: pos });
        });
      }
      if (cancelled) return;
      updateWords(patches);
      setBackfilling(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode, unplacedKey, getBookText]);

  const entries = useMemo(() => {
    const list = [...bookEntries];
    if (sortMode === 'alpha') {
      list.sort(
        (a, b) =>
          a.word.localeCompare(b.word, undefined, { sensitivity: 'base' }) ||
          a.createdAt - b.createdAt,
      );
    } else if (sortMode === 'book') {
      list.sort(
        (a, b) => (a.position ?? UNPLACED) - (b.position ?? UNPLACED) || a.createdAt - b.createdAt,
      );
    } else {
      list.sort((a, b) => a.createdAt - b.createdAt);
    }
    return list;
  }, [bookEntries, sortMode]);

  return (
    <div className="word-panel">
      <div className="word-panel-head">
        <h3>Collected words ({entries.length})</h3>
        <select
          className="word-sort"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          title="Sort words"
        >
          <option value="added">Added</option>
          <option value="alpha">A–Z</option>
          <option value="book">In book</option>
        </select>
      </div>
      {backfilling && <p className="muted small">Locating earlier words in the book…</p>}
      {entries.length === 0 && (
        <p className="muted small">Click a word in the PDF to collect it with its sentence.</p>
      )}
      <ul className="word-list">
        {entries.map((e) => (
          <li key={e.id} className={`word-item status-${e.status}`}>
            <div className="word-item-head">
              <span className="word">{e.word}</span>
              <button className="link tiny" title="Remove" onClick={() => removeWord(e.id!)}>
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

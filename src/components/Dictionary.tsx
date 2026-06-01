import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteEntry, updateEntry } from '../db';
import { translateWord } from '../ai';
import type { Settings } from '../settings';

// The global dictionary: every word collected across all books, filterable by
// book and searchable, with CSV export for use in flashcard apps like Anki.
export default function Dictionary({ settings }: { settings: Settings }) {
  const [bookFilter, setBookFilter] = useState<number | 'all'>('all');
  const [query, setQuery] = useState('');

  const books = useLiveQuery(() => db.books.toArray(), []);
  const entries = useLiveQuery(
    () => db.entries.orderBy('createdAt').reverse().toArray(),
    [],
  );

  const bookTitles = useMemo(() => {
    const map = new Map<number, string>();
    books?.forEach((b) => map.set(b.id!, b.title));
    return map;
  }, [books]);

  const filtered = useMemo(() => {
    let list = entries ?? [];
    if (bookFilter !== 'all') list = list.filter((e) => e.bookId === bookFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.word.toLowerCase().includes(q) ||
          e.meaning.toLowerCase().includes(q) ||
          e.sentence.toLowerCase().includes(q),
      );
    }
    return list;
  }, [entries, bookFilter, query]);

  async function retranslate(id: number) {
    const e = await db.entries.get(id);
    if (!e) return;
    const book = await db.books.get(e.bookId);
    await updateEntry(id, { status: 'pending', error: undefined });
    try {
      const t = await translateWord(e.word, e.sentence, book?.sourceLang ?? '', settings);
      await updateEntry(id, { ...t, status: 'done', error: undefined });
    } catch (err) {
      await updateEntry(id, { status: 'error', error: (err as Error).message });
    }
  }

  function exportCsv() {
    const rows = [
      ['word', 'baseForm', 'partOfSpeech', 'meaning', 'sentence', 'sentenceTranslation', 'book'],
      ...filtered.map((e) => [
        e.word,
        e.baseForm,
        e.partOfSpeech,
        e.meaning,
        e.sentence,
        e.sentenceTranslation,
        bookTitles.get(e.bookId) ?? '',
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dictionary.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="dictionary">
      <div className="dict-head">
        <h1>Dictionary</h1>
        <div className="row">
          <select
            value={bookFilter}
            onChange={(e) =>
              setBookFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
            }
          >
            <option value="all">All books</option>
            {books?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
          <input
            placeholder="Search word, meaning, sentence…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={exportCsv} disabled={filtered.length === 0}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="muted small">{filtered.length} words</div>

      <table className="dict-table">
        <thead>
          <tr>
            <th>Word</th>
            <th>Meaning (in context)</th>
            <th>Sentence</th>
            <th>Book</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e) => (
            <tr key={e.id} className={`status-${e.status}`}>
              <td>
                <strong>{e.word}</strong>
                {e.partOfSpeech && <div className="pos">{e.partOfSpeech}</div>}
                {e.baseForm && e.baseForm !== e.word && (
                  <div className="muted tiny">{e.baseForm}</div>
                )}
              </td>
              <td>
                {e.status === 'pending' && <span className="muted">Translating…</span>}
                {e.status === 'error' && <span className="error">{e.error}</span>}
                {e.meaning}
              </td>
              <td className="sentence-cell">
                “{e.sentence}”
                {e.sentenceTranslation && (
                  <div className="muted small">{e.sentenceTranslation}</div>
                )}
              </td>
              <td className="muted small">{bookTitles.get(e.bookId) ?? '—'}</td>
              <td className="actions">
                <button className="link tiny" onClick={() => retranslate(e.id!)}>
                  ⟳
                </button>
                <button className="link tiny" onClick={() => deleteEntry(e.id!)}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

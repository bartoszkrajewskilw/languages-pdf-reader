import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, createBook, deleteBook, addFile, replacePdf } from '../db';
import { loadSettings } from '../settings';

export default function Library({ onOpenBook }: { onOpenBook: (bookId: number) => void }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [sourceLang, setSourceLang] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [audios, setAudios] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const books = useLiveQuery(() => db.books.orderBy('createdAt').reverse().toArray(), []);
  const fileCounts = useLiveQuery(async () => {
    const all = await db.files.toArray();
    const counts: Record<number, { audio: number; pdf: number }> = {};
    for (const f of all) {
      counts[f.bookId] ??= { audio: 0, pdf: 0 };
      counts[f.bookId][f.kind]++;
    }
    return counts;
  }, []);
  const wordCounts = useLiveQuery(async () => {
    const all = await db.entries.toArray();
    const counts: Record<number, number> = {};
    for (const e of all) counts[e.bookId] = (counts[e.bookId] ?? 0) + 1;
    return counts;
  }, []);

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const bookId = await createBook(title, sourceLang, loadSettings().defaultTargetLang);
      if (pdf) await replacePdf(bookId, pdf);
      for (const a of audios) await addFile(bookId, 'audio', a);
      resetForm();
      onOpenBook(bookId);
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setAdding(false);
    setTitle('');
    setSourceLang('');
    setPdf(null);
    setAudios([]);
  }

  async function remove(bookId: number, bookTitle: string) {
    if (!confirm(`Delete "${bookTitle}" and all its files and collected words?`)) return;
    await deleteBook(bookId);
  }

  return (
    <div className="library">
      <div className="library-head">
        <h1>Your books</h1>
        {!adding && (
          <button className="primary" onClick={() => setAdding(true)}>
            + Add book
          </button>
        )}
      </div>

      {adding && (
        <div className="add-book card">
          <h2>New book</h2>
          <label>
            Title
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Harry Potter — German"
            />
          </label>
          <label>
            Language being learned (optional — left empty = auto-detect)
            <input
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              placeholder="e.g. German, Deutsch, fr…"
            />
          </label>
          <label>
            PDF (the book)
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            Audio files (chapters — you can add more later)
            <input
              type="file"
              accept="audio/*"
              multiple
              onChange={(e) => setAudios(Array.from(e.target.files ?? []))}
            />
          </label>
          <div className="row">
            <button className="primary" disabled={busy} onClick={submit}>
              {busy ? 'Saving…' : 'Create & open'}
            </button>
            <button onClick={resetForm} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="book-grid">
        {books?.length === 0 && !adding && (
          <p className="muted">No books yet. Click “Add book” to get started.</p>
        )}
        {books?.map((b) => (
          <div key={b.id} className="book-card card" onClick={() => onOpenBook(b.id!)}>
            <div className="book-card-title">{b.title}</div>
            <div className="book-card-meta">
              {b.sourceLang && <span className="tag">{b.sourceLang}</span>}
              <span>{fileCounts?.[b.id!]?.audio ?? 0} audio</span>
              <span>{fileCounts?.[b.id!]?.pdf ? 'PDF ✓' : 'no PDF'}</span>
              <span>{wordCounts?.[b.id!] ?? 0} words</span>
            </div>
            <button
              className="danger small"
              onClick={(e) => {
                e.stopPropagation();
                remove(b.id!, b.title);
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

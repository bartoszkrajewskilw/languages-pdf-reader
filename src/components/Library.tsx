import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, createBook, deleteBook, addFile, replacePdf } from '../db';
import { useWords, removeWordsForBook } from '../words';
import { loadSettings } from '../settings';
import type { Book } from '../types';
import { HeadphonesIcon, FileTextIcon, BookIcon, TrashIcon, PlusIcon } from './icons';

export default function Library({ onOpenBook }: { onOpenBook: (bookId: number) => void }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [audios, setAudios] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmBook, setConfirmBook] = useState<Book | null>(null);

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
  const words = useWords();
  const wordCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const e of words) counts[e.bookId] = (counts[e.bookId] ?? 0) + 1;
    return counts;
  }, [words]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const bookId = await createBook(title, '', loadSettings().defaultTargetLang);
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
    setPdf(null);
    setAudios([]);
  }

  return (
    <div className="library">
      <div className="library-head">
        <h1>Your books</h1>
        {!adding && (
          <button className="primary" onClick={() => setAdding(true)}>
            <PlusIcon size={16} />
            Add book
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
              placeholder="e.g. Harry Potter"
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

      {books?.length === 0 && !adding && (
        <div className="library-empty">
          <BookIcon size={32} />
          <p className="muted">No books yet. Click “Add book” to get started.</p>
        </div>
      )}

      <div className="book-grid">
        {books?.map((b) => {
          const audio = fileCounts?.[b.id!]?.audio ?? 0;
          const hasPdf = !!fileCounts?.[b.id!]?.pdf;
          const words = wordCounts?.[b.id!] ?? 0;
          return (
            <div key={b.id} className="book-card" onClick={() => onOpenBook(b.id!)}>
              <button
                className="book-delete"
                title="Delete book"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmBook(b);
                }}
              >
                <TrashIcon size={16} />
              </button>
              <div className="book-card-title">{b.title}</div>
              <div className="book-card-meta">
                <span>
                  <HeadphonesIcon size={14} />
                  {audio} {audio === 1 ? 'chapter' : 'chapters'}
                </span>
                <span>
                  <BookIcon size={14} />
                  {words} {words === 1 ? 'word' : 'words'}
                </span>
                <span className={hasPdf ? 'ok' : 'muted'}>
                  <FileTextIcon size={14} />
                  {hasPdf ? 'PDF' : 'No PDF'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {confirmBook && (
        <div className="modal-overlay" onClick={() => setConfirmBook(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete book?</h3>
            <p className="muted">
              “{confirmBook.title}” and all its files and collected words will be permanently
              deleted.
            </p>
            <div className="row modal-actions">
              <button
                className="danger"
                onClick={async () => {
                  await deleteBook(confirmBook.id!);
                  removeWordsForBook(confirmBook.id!);
                  setConfirmBook(null);
                }}
              >
                Delete
              </button>
              <button onClick={() => setConfirmBook(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

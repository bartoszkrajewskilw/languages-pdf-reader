import Dexie, { type Table } from 'dexie';
import type { Book, StoredFile, Progress, Entry } from './types';

// All data — books, the actual PDF/audio bytes, progress, and the dictionary —
// lives in IndexedDB so everything persists across sessions with no backend and
// no re-importing files.
class LanguagesDB extends Dexie {
  books!: Table<Book, number>;
  files!: Table<StoredFile, number>;
  progress!: Table<Progress, number>;
  entries!: Table<Entry, number>;

  constructor() {
    super('languages-pdf-reader');
    this.version(1).stores({
      books: '++id, createdAt',
      files: '++id, bookId, kind, order, [bookId+kind]',
      progress: 'bookId',
      entries: '++id, bookId, word, createdAt',
    });
  }
}

export const db = new LanguagesDB();

// ---- Books ----------------------------------------------------------------

export async function createBook(
  title: string,
  sourceLang: string,
  targetLang: string,
): Promise<number> {
  return db.books.add({
    title: title.trim() || 'Untitled book',
    sourceLang: sourceLang.trim(),
    targetLang: targetLang.trim() || 'Polski',
    createdAt: Date.now(),
  });
}

export async function deleteBook(bookId: number): Promise<void> {
  // Collected words live in data/words.json (see src/words.ts), removed separately.
  await db.transaction('rw', db.books, db.files, db.progress, async () => {
    await db.files.where('bookId').equals(bookId).delete();
    await db.progress.where('bookId').equals(bookId).delete();
    await db.books.delete(bookId);
  });
}

// ---- Files ----------------------------------------------------------------

export async function addFile(
  bookId: number,
  kind: StoredFile['kind'],
  file: File,
): Promise<number> {
  const existing = await db.files.where({ bookId, kind }).count();
  return db.files.add({
    bookId,
    kind,
    name: file.name,
    blob: file,
    order: existing,
    addedAt: Date.now(),
  });
}

export async function replacePdf(bookId: number, file: File): Promise<number> {
  await db.files.where({ bookId, kind: 'pdf' }).delete();
  return addFile(bookId, 'pdf', file);
}

export async function deleteFile(fileId: number): Promise<void> {
  await db.files.delete(fileId);
}

export function filesForBook(bookId: number, kind: StoredFile['kind']) {
  return db.files.where({ bookId, kind }).sortBy('order');
}

// ---- Progress -------------------------------------------------------------

export async function getProgress(bookId: number): Promise<Progress> {
  const existing = await db.progress.get(bookId);
  if (existing) return existing;
  return {
    bookId,
    pdfPage: 1,
    lastAudioFileId: null,
    audioPositions: {},
    updatedAt: Date.now(),
  };
}

export async function saveProgress(progress: Progress): Promise<void> {
  await db.progress.put({ ...progress, updatedAt: Date.now() });
}

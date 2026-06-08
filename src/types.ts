export interface Book {
  id?: number;
  title: string;
  // Language being learned (source) and the learner's language (target).
  // Empty sourceLang = let the AI auto-detect.
  sourceLang: string;
  targetLang: string;
  createdAt: number;
}

export type StoredFileKind = 'pdf' | 'audio';

export interface StoredFile {
  id?: number;
  bookId: number;
  kind: StoredFileKind;
  name: string;
  blob: Blob;
  // Ordering within a book (used to sort audio chapters).
  order: number;
  addedAt: number;
}

// Per-book reading/listening progress, so reopening a book resumes where you
// left off — including the per-chapter audio positions.
export interface Progress {
  bookId: number;
  pdfPage: number;
  lastAudioFileId: number | null;
  // Map of audio file id -> playback position in seconds.
  audioPositions: Record<number, number>;
  updatedAt: number;
}

// A collected vocabulary item: the word, the sentence it came from (context),
// and the AI's one-word translation of the word in that context.
export interface Entry {
  id?: number;
  bookId: number;
  word: string;
  sentence: string;
  // The translation (filled in asynchronously; empty until translated).
  meaning: string;
  status: 'pending' | 'done' | 'error';
  error?: string;
  createdAt: number;
}

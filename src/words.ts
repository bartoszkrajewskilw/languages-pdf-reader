import { useSyncExternalStore } from 'react';
import type { Entry } from './types';

// The collected words live in a plain JSON file on disk (data/words.json),
// read/written through the dev server's /api/words endpoint. We keep an
// in-memory copy here and expose it to React via useSyncExternalStore, so all
// views update reactively — and writes are synchronous (no IndexedDB race).

const API = '/api/words';

let entries: Entry[] = [];
let loaded = false;
let nextId = 1;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function emit() {
  for (const l of listeners) l();
}

async function save() {
  try {
    await fetch(API, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(entries, null, 2),
    });
  } catch (err) {
    console.error('Could not save words to disk', err);
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

export async function loadWords(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const res = await fetch(API);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) entries = data as Entry[];
    }
  } catch {
    /* no API (e.g. not running under the dev server) — start empty */
  }
  nextId = entries.reduce((m, e) => Math.max(m, e.id ?? 0), 0) + 1;
  emit();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSnapshot(): Entry[] {
  return entries;
}

export function useWords(): Entry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getWord(id: number): Entry | undefined {
  return entries.find((e) => e.id === id);
}

export function hasWord(bookId: number, word: string, sentence: string): boolean {
  return entries.some((e) => e.bookId === bookId && e.word === word && e.sentence === sentence);
}

export function addWord(entry: Omit<Entry, 'id'>): number {
  const id = nextId++;
  entries = [...entries, { ...entry, id }];
  emit();
  scheduleSave();
  return id;
}

export function updateWord(id: number, patch: Partial<Entry>): void {
  entries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
  emit();
  scheduleSave();
}

export function removeWord(id: number): void {
  entries = entries.filter((e) => e.id !== id);
  emit();
  scheduleSave();
}

export function removeWordsForBook(bookId: number): void {
  const before = entries.length;
  entries = entries.filter((e) => e.bookId !== bookId);
  if (entries.length !== before) {
    emit();
    scheduleSave();
  }
}

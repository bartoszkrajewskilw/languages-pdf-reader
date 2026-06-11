# Languages — PDF + Audio Reader

A single-screen app for learning a foreign language from a book: read the PDF and
listen to its audio **in the same window**, click any word to collect it **together
with the sentence it appears in**, and let an AI explain what the word means *in that
specific context* (not a generic dictionary entry). Everything you collect lands in a
global, searchable dictionary.

Built from the design conversation in the project brief. The pain point it solves:
no more juggling a PDF in one app, audio in another, and notes in a third — clicking a
word never interrupts your audio or hides your page.

> **Architecture, storage, and the path to a real product** are documented in
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — read it before bigger changes.

## Features

- **Library** of books. Each book has one PDF and any number of audio files (chapters).
- **In-app PDF reader** (PDF.js): page navigation, zoom, real text (selectable).
- **In-app audio player**: play/pause, −5s / +5s, scrub, playback speed (0.75×–2×).
  - Keyboard while reading: **Space** = play/pause, **←/→** = skip 5s.
- **Click a word → collect it with its sentence.** The sentence is extracted live from
  the page text (no need to pre-process the whole book).
- **AI translation in context** via the Claude API — explains the word as used in *that*
  sentence, plus the lemma, part of speech, and a translation of the whole sentence.
- **Global dictionary**: every collected word across all books. Filter by book, search,
  retranslate, delete, and **export to CSV** (Anki-friendly).
- **Resume where you left off**: per-book PDF page, selected chapter, and per-chapter
  audio position are saved continuously.
- **Fully local**: books, audio bytes, progress, and the dictionary all live in your
  browser (IndexedDB). No backend. The only network call is to the Claude API for
  translations.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests for the sentence extractor
npm run build        # typecheck + production build
```

To enable translations, open **Settings** and paste a Claude API key from
console.anthropic.com. The key is stored only in your browser (localStorage) and is
sent only to `api.anthropic.com`. Without a key, words are still collected with their
sentences — you can translate them later with the **retry** button.

There are sample files in `test-assets/` (a 2-page German PDF and an audio chapter) if
you want something to try immediately.

## Key decisions (made autonomously per the brief — easy to revisit)

- **Local web app (Vite + React + TS).** PDF.js is browser-native and no backend is
  needed. Can be wrapped in Tauri/Electron later for a true desktop app.
- **Files are stored as bytes in IndexedDB, not linked by path.** Browsers can't keep a
  filesystem path reference across sessions, so storing the bytes is what makes
  "reopen the book next week and it's exactly where you left it" actually work.
- **Sentence context is extracted on click**, not by pre-chopping the book. A 1000-page
  book never needs a giant in-memory sentence array — we reconstruct only the current
  page's text and find the sentence boundaries around the clicked word.
- **AI = Claude, called directly from the browser** (with the
  `anthropic-dangerous-direct-browser-access` header). Default model is Haiku for fast,
  cheap contextual lookups; switchable to Sonnet/Opus in Settings.
- **Native language defaults to Polish**; each book has its own "language being learned"
  (or auto-detect). Change the default in Settings.

## How the word-in-context extraction works

`src/text/sentence.ts` is the heart of the app and is unit-tested
(`src/text/sentence.test.ts`, 10 cases). On click we know the character offset of the
word within the page's reconstructed text; from there we expand outward to word
boundaries (Unicode-aware, keeps `well-known` / `it's` intact) and then to sentence
boundaries (`.!?…`, newlines, and quote/clause separators so quoted speech yields just
the quoted sentence).

The PDF text layer wraps each word in a span tagged with its offset
(`src/components/PdfViewer.tsx`), so a click maps straight back into that text.

## Project layout

```
src/
  text/sentence.ts        # word + sentence extraction (pure, tested)
  db.ts                   # IndexedDB schema + helpers (Dexie)
  ai.ts                   # Claude API call for contextual translation
  settings.ts             # API key / model / native language (localStorage)
  components/
    Library.tsx           # home: list/add/delete books
    BookReader.tsx        # ties PDF + audio + collection + progress together
    PdfViewer.tsx         # PDF.js rendering, word wrapping, click-to-collect
    AudioPlayer.tsx       # audio controls, resume, keyboard shortcuts
    WordPanel.tsx         # words collected from the current book (live)
    Dictionary.tsx        # global dictionary: filter, search, CSV export
    Settings.tsx          # API key, model, native language
```

## Verified

Driven in a real browser end-to-end:

- ✅ Build, typecheck, and the 10 sentence-extraction unit tests pass.
- ✅ Add a book with a PDF + audio; it persists in IndexedDB.
- ✅ PDF renders; page nav, zoom, and the live word/​sentence panel work.
- ✅ **Clicking a word collects it with exactly its containing sentence** (verified:
  clicking "Fuchs" captured "Der kleine Fuchs lebte tief im Wald.").
- ✅ No console errors.

Not fully verified in the automated test browser (standard code; please confirm in your
own Chrome):

- ⚠️ **Audio playback** — the headless test browser's media pipeline is stubbed (no
  file loads, not even WAV), so I couldn't watch it play. It's a plain HTML5 `<audio>`
  element with a blob URL and will play normally in your browser.
- ❓ **AI translation** — needs your API key, which I won't enter. The request path and
  the no-key error handling are wired up; add a key in Settings and click a word to try.

## Known follow-ups (for iteration)

- IndexedDB schema changes need Dexie version bumps before there's real data to migrate.
- The ~640 kB JS bundle could be code-split (PDF.js dominates it).
- Optional niceties: highlight already-collected words in the PDF, dark/light toggle,
  multiple PDFs per book, drag-and-drop import.

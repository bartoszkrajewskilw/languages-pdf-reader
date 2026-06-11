# Architecture & product direction

This is the "why" and "where we're heading" doc. The current app is a fast, local,
personal tool; the notes below capture decisions and the path to a real product so
we don't have to re-derive them later.

---

## 1. What it is today (local personal tool)

- **Frontend:** Vite + React + TypeScript single-page app, run with `npm run dev`.
- **PDF rendering:** `react-pdf` / pdfjs, virtualized continuous scroll. Clicking a
  word captures the word + its sentence (`src/text/sentence.ts`, unit-tested), with
  running header/footer stripping and cross-page sentence stitching done in
  `src/components/PdfViewer.tsx`.
- **AI translation:** OpenAI Chat Completions, called **directly from the browser**.
  Returns a one-word translation of the clicked word in context (sentence is context
  only, not translated). Model is configurable (`gpt-5.5` default), `reasoning_effort`
  low for speed.

### Where data lives today (this is the important part)

Data is split across two places — a known inconsistency we plan to unify:

| Data | Location | How |
| --- | --- | --- |
| Books metadata, **PDF bytes, audio bytes**, reading progress | **IndexedDB** (Dexie, db `languages-pdf-reader`: stores `books`, `files`, `progress`) | in-browser, opaque |
| Collected words (dictionary) | **`data/words.json`** on disk | dev-server endpoint `/api/words` |
| OpenAI API key | **`.env`** (`VITE_OPENAI_API_KEY`, gitignored) | read via `import.meta.env` |
| Settings (model, native language) | `localStorage` | — |

Audio↔text alignment is computed **on demand** and **not persisted** (see §2), so
there's nothing on disk for it. The dev server's file I/O + process spawning lives in
`vite.config.ts` as small plugins (`/api/words`, `/api/transcribe`). `data/` is gitignored.

---

## 2. Audio → text sync (the "jump to where the audiobook is" feature)

Goal: a button that scrolls the PDF to the spot the audio is currently at, and briefly
highlights the word the listener just heard.

- **On demand, not precomputed.** An earlier version transcribed whole chapters in the
  background and saved alignment maps to disk. For a 30 h audiobook that's ~10 h of CPU
  and cooks the machine — unsustainable. We pivoted to transcribing only a **~15 s
  window** at the press of the button. Nothing is precomputed; nothing is persisted.
- **Engine (dev):** **faster-whisper** locally — free, offline. Run via
  `scripts/transcribe.py`, invoked by the dev server at `/api/transcribe` (POST audio
  bytes + `?start=&dur=` → ffmpeg slices that window → whisper transcribes just it →
  timestamped segments **and per-word timestamps**). One press ≈ a few seconds of CPU.
- **Why Whisper (not aeneas):** audio is per-chapter but the text is the *whole* book
  with no chapter→file mapping. Whisper transcribes the window, then we fuzzy-match it
  into the book text, which **auto-localizes** it. aeneas would need the chapter's text
  isolated up front (chicken-and-egg) and is painful to install. Accuracy isn't critical
  (we match to known text), so the small model is fine.
- **Flow when the button is pressed** (`src/align/run.ts` → `src/align/match.ts`):
  1. Slice a 15 s window sitting mostly *before* the cursor (≈10 s lead-in) and
     transcribe it with per-word timestamps.
  2. Using those timestamps, take the run of words **ending at the last word actually
     heard** (the cursor position) — the text the listener just finished.
  3. `locate()` that phrase in the whole-book text (built once, cached): a sliding
     word-overlap window finds the region, then it aligns the phrase and returns the
     **last** word's page + char offset — i.e. the last word heard.
  4. Jump the PDF to that page and pulse a highlight over that exact word
     (`PdfViewer` maps the offset back to the rendered text-layer span).
- **Granularity:** word-level, bounded by whisper's word-timestamp precision
  (~0.2–0.5 s) and where exactly the user paused — so it can land on a neighbouring
  word, but stays on what was just heard.

---

## 3. Where this becomes a real product

If this grows into a product (users sign up, add their own books): **local-first is the
right model**, and the *decisive* reason is **copyright** — users add their own PDFs and
audiobooks (copyrighted). We must **never** host that content. Local-only also means no
storage/bandwidth cost for big audio, plus privacy, plus the local whisper compute is
free to us.

### What an "account" is for (not media)
- License / payment.
- Optional **sync of small metadata only**: dictionary words, progress, settings — a few
  KB of JSON. **Media never syncs**; on a new device the user re-points the app at their
  files. The cloud stores identity + license + tiny metadata, nothing copyrighted.

### Form factor: desktop app
- **Tauri** (recommended end-state): small, Rust core, reuse the React frontend, native
  file access, can run/bundle whisper.
- **Electron** (shortest path from today): bundles Node, so our `/api/*` endpoints port
  almost 1:1.
- Pure browser (PWA + File System Access + OPFS) is tempting for "no install" but local
  whisper in-browser is weak (WASM only) — not great for this product.

### Whisper for shipping
Swap dev's faster-whisper (Python) for **whisper.cpp** (C, Metal on Apple Silicon — very
fast, tiny binary, **no Python dependency**, easy to package).

### On-disk layout in the product
A per-user app-data folder (e.g. macOS `~/Library/Application Support/<app>/`):

```
library.json        # books + progress + file manifest (or a small SQLite db)
words.json          # collected words
media/<book>/book.pdf, ch01.mp3, ...
```

(No alignment files — sync is computed on demand at the press of the button.)

Backup = copy the folder. This is exactly the shape we're already drifting toward.

---

## 4. Migration path (current → product)

1. **(Deferred for now — doing the quick version first.)** Move PDF + audio out of
   IndexedDB into files under `data/media/...`; move book metadata + progress into
   `data/library.json`. Result: everything in one inspectable `data/` folder, the
   aligner can read files directly (no more POSTing blobs), and IndexedDB/Dexie can be
   dropped. This unifies storage and is the foundation for desktop.
2. Package as a desktop app (Tauri or Electron); `data/` becomes the app-data folder.
3. Swap faster-whisper → whisper.cpp for bundling.
4. (Optional) Add accounts: license + sync of `words.json`/progress/settings only.

### Decision log
- **Local-first, files on disk** over cloud — copyright + cost + privacy.
- **Whisper (faster-whisper now, whisper.cpp later)** over aeneas — localization +
  install pain; accuracy not critical because we match to known text.
- **Words as plain JSON on disk** over IndexedDB — inspectable, backup-able,
  product-shaped. (PDF/audio still in IndexedDB for now — step 1 above moves them.)
- **On-demand windowed transcription** over background whole-book alignment — the
  background approach was unsustainable (a 30 h book ≈ 10 h of CPU, machine overheats).
  A manual button transcribing one ~15 s window costs a few seconds and scales to any
  audiobook length.

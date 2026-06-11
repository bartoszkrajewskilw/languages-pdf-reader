import { locate, type Segment } from './match';
import type { BookText } from './bookText';

interface Word {
  start: number; // seconds, relative to the transcribed window
  end: number;
  w: string;
}

// How many words of heard context (ending at the current word) to match against
// the book. Enough to be distinctive, short enough to stay on the current spot.
const CONTEXT_WORDS = 12;

// On-demand "jump to the audio's current position": transcribe ONLY a short
// window of the audio around the current time, then find that phrase in the book.
// Nothing is precomputed — whisper runs ~a few seconds per press, so it scales to
// audiobooks of any length without cooking the machine.
//
// The window starts slightly *before* the cursor (lead-in) so whisper transcribes
// the boundary word cleanly. We then use the per-word timestamps to start matching
// from the word actually playing at `seconds`, so the highlight lands there rather
// than at the (earlier) start of the window.
export async function locateInBook(
  audio: Blob,
  seconds: number,
  book: BookText,
  windowSec = 15,
): Promise<{ page: number; offset: number } | null> {
  // Seconds of *heard* context before the cursor. Needs to be generous so the
  // phrase ending at the current word has enough distinctive words to match the
  // book reliably (a 2s lead only yields ~5 words — too few). The window stays
  // 15s total, just shifted to sit mostly before the cursor (same compute cost).
  const lead = 10;
  const start = Math.max(0, Math.floor(seconds - lead));
  const res = await fetch(`/api/transcribe?start=${start}&dur=${windowSec}`, {
    method: 'POST',
    body: audio,
  });
  const data = (await res.json()) as { segments?: Segment[]; words?: Word[]; error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error || `locate failed (${res.status})`);
  }

  const words = data.words ?? [];
  let phrase: string;
  if (words.length) {
    // Cursor position within the window. Find the LAST word fully heard (it ended
    // at or before the cursor) — that's where the listener stopped — and match the
    // run of words ending there. locate() then returns that last word's position.
    const cursor = seconds - start;
    let last = -1;
    for (let k = 0; k < words.length; k++) {
      if (words[k].end <= cursor) last = k;
      else break;
    }
    if (last < 0) last = 0;
    const from = Math.max(0, last - (CONTEXT_WORDS - 1));
    phrase = words
      .slice(from, last + 1)
      .map((w) => w.w)
      .join(' ');
  } else {
    // Fallback if word timestamps are unavailable: whole-window text.
    phrase = (data.segments ?? []).map((s) => s.text).join(' ').trim();
  }

  if (!phrase) return null;
  const hit = locate(book.text, book.pageStarts, phrase);
  console.log('[jump] ' + JSON.stringify({ seconds, start, phrase, hit }));
  return hit;
}

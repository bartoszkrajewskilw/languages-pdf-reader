#!/usr/bin/env python3
"""Transcribe an audio file to timestamped segments using faster-whisper.

Streams newline-delimited JSON to stdout so the app can show live progress:
  {"p": 0.42}            # fraction of the file transcribed so far
  ...
  {"segments": [...]}    # final result: list of {start, end, text}
Errors (and whisper's own logs) go to stderr.

Usage:  python3 scripts/transcribe.py <audio-file> [model]
Env:    WHISPER_THREADS (CPU threads; lower = cooler/slower; 0 = auto)
"""
import json
import os
import sys


def emit(obj) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: transcribe.py <audio-file> [model]", file=sys.stderr)
        return 2

    audio = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "tiny"
    threads = int(os.environ.get("WHISPER_THREADS", "4") or "0")

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "faster-whisper is not installed. Run: python3 -m pip install -r requirements.txt",
            file=sys.stderr,
        )
        return 3

    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=threads)
    # word_timestamps lets the caller find the exact word at a given audio time
    # (used to highlight the word being played, not just the start of the window).
    segments, info = model.transcribe(audio, vad_filter=True, word_timestamps=True)
    duration = getattr(info, "duration", 0) or 0

    out = []
    words = []
    for s in segments:  # generator → drives transcription as we iterate
        text = s.text.strip()
        if text:
            out.append({"start": round(s.start, 2), "end": round(s.end, 2), "text": text})
        for w in (s.words or []):
            wt = w.word.strip()
            if wt:
                words.append({"start": round(w.start, 2), "end": round(w.end, 2), "w": wt})
        if duration:
            emit({"p": min(1.0, round(s.end / duration, 3))})

    emit({"segments": out, "words": words})
    return 0


if __name__ == "__main__":
    sys.exit(main())

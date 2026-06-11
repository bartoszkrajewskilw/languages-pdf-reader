import { useEffect, useRef, useState } from 'react';
import type { StoredFile } from '../types';
import { JumpIcon } from './icons';

interface Props {
  files: StoredFile[];
  selectedFileId: number | null;
  initialPosition: number;
  onPosition: (fileId: number, seconds: number) => void;
  onLocate: (seconds: number) => void;
  locating: boolean;
}

function fmt(t: number): string {
  if (!isFinite(t)) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({
  files,
  selectedFileId,
  initialPosition,
  onPosition,
  onLocate,
  locating,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const restoredRef = useRef(false);
  const lastSavedSecond = useRef(-1);

  const selected = files.find((f) => f.id === selectedFileId) ?? null;
  const pct = duration > 0 ? (time / duration) * 100 : 0;

  // Build an object URL for the selected audio blob.
  useEffect(() => {
    if (!selected) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(selected.blob);
    setUrl(u);
    restoredRef.current = false;
    lastSavedSecond.current = -1;
    return () => URL.revokeObjectURL(u);
  }, [selected?.id]);

  function onLoadedMetadata() {
    const a = audioRef.current;
    if (!a) return;
    setDuration(a.duration);
    if (!restoredRef.current && initialPosition > 0 && initialPosition < a.duration) {
      a.currentTime = initialPosition;
    }
    restoredRef.current = true;
  }

  function onTimeUpdate() {
    const a = audioRef.current;
    if (!a) return;
    setTime(a.currentTime);
    const sec = Math.floor(a.currentTime);
    if (restoredRef.current && selectedFileId != null && sec !== lastSavedSecond.current) {
      lastSavedSecond.current = sec;
      onPosition(selectedFileId, a.currentTime);
    }
  }

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play();
    else a.pause();
  }

  function skip(delta: number) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.min(Math.max(0, a.currentTime + delta), a.duration || Infinity);
  }

  // Keyboard: space = play/pause, ← / → = skip 5s. Ignored while typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
      } else if (e.code === 'ArrowLeft') {
        skip(-5);
      } else if (e.code === 'ArrowRight') {
        skip(5);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function jumpToAudio() {
    const a = audioRef.current;
    if (a) onLocate(a.currentTime);
  }

  return (
    <div className="audio">
      <div className="audio-now">
        <span className="audio-now-name" title={selected?.name}>
          {selected ? selected.name : 'No chapter selected — choose one in the sidebar'}
        </span>
        {url && (
          <button
            className="audio-jump"
            onClick={jumpToAudio}
            disabled={locating}
            title="Jump PDF to where the audio is now"
          >
            {locating ? <span className="spinner" /> : <JumpIcon size={17} />}
          </button>
        )}
      </div>

      {url && (
        <>
          <audio
            ref={audioRef}
            src={url}
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
          <div className="audio-seekrow">
            <span className="time">{fmt(time)}</span>
            <input
              className="seek"
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={time}
              style={{
                background: `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%) no-repeat center / 100% 6px`,
              }}
              onChange={(e) => {
                const a = audioRef.current;
                if (a) a.currentTime = Number(e.target.value);
              }}
            />
            <span className="time">{fmt(duration)}</span>
          </div>
          <div className="audio-controls">
            <button className="skip" onClick={() => skip(-5)} title="Back 5 seconds">
              <svg viewBox="0 0 18 14" width="17" height="13" aria-hidden="true">
                <path d="M8 1 1 7l7 6z" fill="currentColor" />
                <path d="M16 1 9 7l7 6z" fill="currentColor" />
              </svg>
              5s
            </button>
            <button className="play" onClick={toggle} title={playing ? 'Pause' : 'Play'}>
              {playing ? (
                <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
                  <rect x="4" y="2.5" width="3.2" height="11" rx="1.2" fill="currentColor" />
                  <rect x="8.8" y="2.5" width="3.2" height="11" rx="1.2" fill="currentColor" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 16 16"
                  width="18"
                  height="18"
                  aria-hidden="true"
                  style={{ marginLeft: 2 }}
                >
                  <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
                </svg>
              )}
            </button>
            <button className="skip" onClick={() => skip(5)} title="Forward 5 seconds">
              5s
              <svg viewBox="0 0 18 14" width="17" height="13" aria-hidden="true">
                <path d="M2 1 9 7 2 13z" fill="currentColor" />
                <path d="M10 1l7 6-7 6z" fill="currentColor" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

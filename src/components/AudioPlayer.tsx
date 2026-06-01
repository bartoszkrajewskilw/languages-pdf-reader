import { useEffect, useRef, useState } from 'react';
import type { StoredFile } from '../types';

interface Props {
  files: StoredFile[];
  selectedFileId: number | null;
  initialPosition: number;
  onSelect: (fileId: number) => void;
  onPosition: (fileId: number, seconds: number) => void;
  onAddAudio: (files: File[]) => void;
  onDeleteAudio: (fileId: number) => void;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

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
  onSelect,
  onPosition,
  onAddAudio,
  onDeleteAudio,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const restoredRef = useRef(false);
  const lastSavedSecond = useRef(-1);

  const selected = files.find((f) => f.id === selectedFileId) ?? null;

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

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate, url]);

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

  return (
    <div className="audio">
      <div className="audio-row">
        <select
          className="audio-select"
          value={selectedFileId ?? ''}
          onChange={(e) => onSelect(Number(e.target.value))}
        >
          {files.length === 0 && <option value="">No audio files</option>}
          {files.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <label className="add-audio-btn" title="Add audio files">
          ＋
          <input
            type="file"
            accept="audio/*"
            multiple
            hidden
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              if (list.length) onAddAudio(list);
              e.currentTarget.value = '';
            }}
          />
        </label>
        {selected && (
          <button
            className="danger small"
            title="Remove this audio file"
            onClick={() => {
              if (confirm(`Remove audio "${selected.name}"?`)) onDeleteAudio(selected.id!);
            }}
          >
            ✕
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
          <div className="audio-controls">
            <button onClick={() => skip(-5)} title="Back 5s">⏪ 5</button>
            <button className="play" onClick={toggle}>
              {playing ? '⏸' : '▶'}
            </button>
            <button onClick={() => skip(5)} title="Forward 5s">5 ⏩</button>
            <span className="time muted">{fmt(time)}</span>
            <input
              className="seek"
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={time}
              onChange={(e) => {
                const a = audioRef.current;
                if (a) a.currentTime = Number(e.target.value);
              }}
            />
            <span className="time muted">{fmt(duration)}</span>
            <select value={rate} onChange={(e) => setRate(Number(e.target.value))} title="Speed">
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );
}

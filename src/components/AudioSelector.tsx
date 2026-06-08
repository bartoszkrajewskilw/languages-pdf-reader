import { useState } from 'react';
import type { StoredFile } from '../types';
import { ChevronDownIcon, PlusIcon, TrashIcon } from './icons';

interface Props {
  files: StoredFile[];
  selectedFileId: number | null;
  onSelect: (fileId: number) => void;
  onAddAudio: (files: File[]) => void;
  onDeleteAudio: (fileId: number) => void;
}

// Audio-file picker for the (collapsible) left sidebar: choose which chapter to
// play, add more, or remove the current one. The chapter changes rarely, so it
// lives here rather than next to the always-visible transport controls.
export default function AudioSelector({
  files,
  selectedFileId,
  onSelect,
  onAddAudio,
  onDeleteAudio,
}: Props) {
  const [confirmFile, setConfirmFile] = useState<StoredFile | null>(null);
  const selected = files.find((f) => f.id === selectedFileId) ?? null;

  return (
    <div className="left-section">
      <div className="left-label">Audio chapter</div>
      <div className="select-wrap">
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
        <span className="select-chevron">
          <ChevronDownIcon size={16} />
        </span>
      </div>
      <div className="audio-actions">
        <label className="audio-btn" title="Add audio files">
          <PlusIcon size={16} />
          Add file
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
          <button className="audio-btn danger-ghost" onClick={() => setConfirmFile(selected)}>
            <TrashIcon size={16} />
            Remove
          </button>
        )}
      </div>

      {confirmFile && (
        <div className="modal-overlay" onClick={() => setConfirmFile(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Remove audio file?</h3>
            <p className="muted">
              “{confirmFile.name}” will be removed from this book. This can’t be undone.
            </p>
            <div className="row modal-actions">
              <button
                className="danger"
                onClick={() => {
                  onDeleteAudio(confirmFile.id!);
                  setConfirmFile(null);
                }}
              >
                Remove
              </button>
              <button onClick={() => setConfirmFile(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

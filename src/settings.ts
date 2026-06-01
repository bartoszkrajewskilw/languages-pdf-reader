// App-wide settings stored in localStorage (small, non-file config only).
// The Claude API key lives here so it stays on this device and is easy to clear.

export interface Settings {
  apiKey: string;
  model: string;
  // The learner's native language — what translations/explanations are written in.
  defaultTargetLang: string;
}

const KEY = 'languages-pdf-reader.settings';

export const MODEL_OPTIONS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast, cheap — recommended)' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (more nuanced)' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (most capable)' },
];

const DEFAULTS: Settings = {
  apiKey: '',
  model: MODEL_OPTIONS[0].id,
  defaultTargetLang: 'Polski',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

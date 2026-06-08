// App-wide settings. The OpenAI API key comes from a local .env file
// (VITE_OPENAI_API_KEY, gitignored) — never typed into the UI or stored in the
// browser. The model and native language are small prefs kept in localStorage.

export interface Settings {
  apiKey: string;
  model: string;
  // The learner's native language — what translations/explanations are written in.
  defaultTargetLang: string;
}

const KEY = "languages-pdf-reader.settings";
const ENV_API_KEY = (import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();

const DEFAULTS = {
  model: "gpt-5.5",
  defaultTargetLang: "Polski",
};

export function loadSettings(): Settings {
  let stored: Partial<Settings> = {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) stored = JSON.parse(raw) as Partial<Settings>;
  } catch {
    /* ignore corrupt storage */
  }
  let model = stored.model || DEFAULTS.model;
  if (model.startsWith("claude")) model = DEFAULTS.model; // migrate old configs
  return {
    apiKey: ENV_API_KEY, // always from .env
    model,
    defaultTargetLang: stored.defaultTargetLang || DEFAULTS.defaultTargetLang,
  };
}

export function saveSettings(s: Settings): void {
  // apiKey is sourced from .env, never persisted here.
  localStorage.setItem(
    KEY,
    JSON.stringify({ model: s.model, defaultTargetLang: s.defaultTargetLang }),
  );
}

import { type Settings } from '../settings';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
}

export default function SettingsPanel({ settings, onChange }: Props) {
  return (
    <div className="settings">
      <h1>Settings</h1>

      <div className="card">
        <h2>OpenAI API</h2>
        <p className="muted small">
          Translations use the OpenAI API. The key is read from a local <code>.env</code> file
          (gitignored) as <code>VITE_OPENAI_API_KEY</code> and sent only to api.openai.com. After
          changing <code>.env</code>, restart <code>npm run dev</code>.
        </p>
        <div className="env-status">
          {settings.apiKey ? (
            <span className="ok">✓ API key loaded from .env</span>
          ) : (
            <span className="error">
              No API key — add VITE_OPENAI_API_KEY to .env and restart the dev server.
            </span>
          )}
        </div>
        <label>
          Model
          <input
            value={settings.model}
            onChange={(e) => onChange({ ...settings, model: e.target.value.trim() })}
            placeholder="gpt-5.4-mini"
          />
        </label>
      </div>

      <div className="card">
        <h2>Your language</h2>
        <p className="muted small">
          Translations and explanations are written in this language. Set as default for new books.
        </p>
        <label>
          Native language
          <input
            value={settings.defaultTargetLang}
            onChange={(e) => onChange({ ...settings, defaultTargetLang: e.target.value })}
            placeholder="Polski"
          />
        </label>
      </div>
    </div>
  );
}

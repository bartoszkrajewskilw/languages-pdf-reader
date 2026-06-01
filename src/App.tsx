import { useState } from 'react';
import Library from './components/Library';
import BookReader from './components/BookReader';
import Dictionary from './components/Dictionary';
import SettingsPanel from './components/Settings';
import { loadSettings, saveSettings, type Settings } from './settings';

type View =
  | { name: 'library' }
  | { name: 'reader'; bookId: number }
  | { name: 'dictionary' }
  | { name: 'settings' };

export default function App() {
  const [view, setView] = useState<View>({ name: 'library' });
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  function updateSettings(next: Settings) {
    setSettings(next);
    saveSettings(next);
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView({ name: 'library' })}>
          📚 Languages
        </button>
        <nav className="topnav">
          <button
            className={view.name === 'library' ? 'active' : ''}
            onClick={() => setView({ name: 'library' })}
          >
            Library
          </button>
          <button
            className={view.name === 'dictionary' ? 'active' : ''}
            onClick={() => setView({ name: 'dictionary' })}
          >
            Dictionary
          </button>
          <button
            className={view.name === 'settings' ? 'active' : ''}
            onClick={() => setView({ name: 'settings' })}
          >
            ⚙ Settings
          </button>
        </nav>
        {!settings.apiKey && (
          <span className="apikey-warn" title="Set your Claude API key in Settings to enable translations">
            ⚠ No API key
          </span>
        )}
      </header>

      <main className="content">
        {view.name === 'library' && (
          <Library onOpenBook={(bookId) => setView({ name: 'reader', bookId })} />
        )}
        {view.name === 'reader' && (
          <BookReader
            bookId={view.bookId}
            settings={settings}
            onBack={() => setView({ name: 'library' })}
            onOpenSettings={() => setView({ name: 'settings' })}
          />
        )}
        {view.name === 'dictionary' && <Dictionary settings={settings} />}
        {view.name === 'settings' && (
          <SettingsPanel settings={settings} onChange={updateSettings} />
        )}
      </main>
    </div>
  );
}

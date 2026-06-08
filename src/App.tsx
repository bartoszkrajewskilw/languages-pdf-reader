import { useEffect, useState } from 'react';
import Library from './components/Library';
import BookReader from './components/BookReader';
import Dictionary from './components/Dictionary';
import SettingsPanel from './components/Settings';
import { loadSettings, saveSettings, type Settings } from './settings';
import { loadWords } from './words';
import { BookIcon, AlertIcon } from './components/icons';

type View =
  | { name: 'library' }
  | { name: 'reader'; bookId: number }
  | { name: 'dictionary' }
  | { name: 'settings' };

export default function App() {
  const [view, setView] = useState<View>({ name: 'library' });
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  // Load collected words from data/words.json once at startup.
  useEffect(() => {
    void loadWords();
  }, []);

  function updateSettings(next: Settings) {
    setSettings(next);
    saveSettings(next);
  }

  const isReader = view.name === 'reader';

  return (
    <div className="app">
      {!isReader && (
      <header className="topbar">
        <button className="brand" onClick={() => setView({ name: 'library' })}>
          <BookIcon size={20} />
          <span>Languages</span>
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
            Settings
          </button>
        </nav>
        {!settings.apiKey && (
          <button
            className="apikey-warn"
            onClick={() => setView({ name: 'settings' })}
            title="Set your OpenAI API key in Settings to enable translations"
          >
            <AlertIcon size={15} />
            No API key
          </button>
        )}
      </header>
      )}

      <main className={`content ${isReader ? 'content-full' : ''}`}>
        {view.name === 'library' && (
          <Library onOpenBook={(bookId) => setView({ name: 'reader', bookId })} />
        )}
        {view.name === 'reader' && (
          <BookReader
            bookId={view.bookId}
            settings={settings}
            onBack={() => setView({ name: 'library' })}
            onOpenSettings={() => setView({ name: 'settings' })}
            onOpenDictionary={() => setView({ name: 'dictionary' })}
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

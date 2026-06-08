/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const WORDS_FILE = path.join(DATA_DIR, 'words.json');

// Tiny dev-server API that persists the collected words to data/words.json on
// disk, so they live in a plain, human-readable JSON file instead of IndexedDB.
function wordsFileApi(): Plugin {
  return {
    name: 'words-json-api',
    configureServer(server) {
      server.middlewares.use('/api/words', async (req, res) => {
        try {
          if (req.method === 'GET') {
            const data = existsSync(WORDS_FILE) ? await readFile(WORDS_FILE, 'utf8') : '[]';
            res.setHeader('content-type', 'application/json');
            res.end(data.trim() || '[]');
            return;
          }
          if (req.method === 'PUT' || req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const c of req) chunks.push(c as Buffer);
            await mkdir(DATA_DIR, { recursive: true });
            await writeFile(WORDS_FILE, Buffer.concat(chunks).toString('utf8'), 'utf8');
            res.statusCode = 204;
            res.end();
            return;
          }
          res.statusCode = 405;
          res.end();
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), wordsFileApi()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

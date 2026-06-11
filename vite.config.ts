/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
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

function readBody(req: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function run(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, opts);
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    p.on('error', (e) => resolve({ code: -1, stdout, stderr: String(e) }));
  });
}

// On-demand transcription for the "jump PDF to the audio's current position"
// feature. Runs faster-whisper locally (free, offline) via scripts/transcribe.py.
function transcribeApi(): Plugin {
  return {
    name: 'transcribe-api',
    configureServer(server) {
      // POST audio bytes + ?start=&dur= -> transcribe ONLY that window (on-demand
      // "jump to audio position"). ffmpeg seeks/cuts the window, whisper does just
      // those ~15s, so there is no whole-book transcription and no background load.
      server.middlewares.use('/api/transcribe', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        const u = new URL(req.url ?? '', 'http://x');
        const start = Math.max(0, Number(u.searchParams.get('start') ?? '0') || 0);
        const dur = Math.max(1, Number(u.searchParams.get('dur') ?? '15') || 15);
        const id = `${Date.now()}-${Math.round(performance.now())}`;
        const inFile = path.join(tmpdir(), `lpr-${id}.audio`);
        const wav = path.join(tmpdir(), `lpr-${id}.wav`);
        const cleanup = () => {
          void unlink(inFile).catch(() => {});
          void unlink(wav).catch(() => {});
        };
        res.setHeader('content-type', 'application/json');
        try {
          await writeFile(inFile, await readBody(req));
          const ff = await run('ffmpeg', [
            '-nostdin', '-ss', String(start), '-t', String(dur), '-i', inFile,
            '-ar', '16000', '-ac', '1', '-y', wav,
          ]);
          if (ff.code !== 0) {
            cleanup();
            res.statusCode = 500;
            res.end(JSON.stringify({ error: `ffmpeg: ${ff.stderr.slice(-200)}` }));
            return;
          }
          const py = await run(
            'python3',
            [path.resolve(process.cwd(), 'scripts/transcribe.py'), wav],
            { env: { ...process.env, WHISPER_THREADS: process.env.WHISPER_THREADS ?? '4' } },
          );
          cleanup();
          if (py.code !== 0) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: `whisper: ${py.stderr.slice(-200)}` }));
            return;
          }
          let segments: unknown = [];
          let words: unknown = [];
          for (const line of py.stdout.split('\n')) {
            const t = line.trim();
            if (!t) continue;
            try {
              const o = JSON.parse(t);
              if (Array.isArray(o.segments)) segments = o.segments;
              if (Array.isArray(o.words)) words = o.words;
            } catch {
              /* skip non-JSON */
            }
          }
          res.end(JSON.stringify({ segments, words }));
        } catch (e) {
          cleanup();
          if (!res.headersSent) res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });

    },
  };
}

export default defineConfig({
  plugins: [react(), wordsFileApi(), transcribeApi()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

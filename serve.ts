// WARUNG SIZZLE — serve.ts (Node 22, standard library only)
// Server statis kecil untuk play-test: menyajikan game/ di localhost:8080.
//   node serve.ts
// lalu buka http://localhost:8080 di Chrome desktop.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const gameDir = join(here, 'game');
const port = Number(process.env.PORT ?? 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';
    const file = join(gameDir, path);
    if (!file.startsWith(gameDir)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const bytes = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(port, () => {
  console.log(`WARUNG SIZZLE at http://localhost:${port}`);
});

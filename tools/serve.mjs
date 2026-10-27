/* 零依赖静态服务器：给需要 WebGL 纹理的游戏用（file:// 下会被 CORS 拦）
 *
 *   node tools/serve.mjs [port] [root]
 *   node tools/serve.mjs 8080            # 根目录 = DDGame
 *   node tools/serve.mjs 8080 games      # 只服务 games/
 *
 * 起完浏览器打开 http://localhost:8080/games/darklegend/?engine=three
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 8080);
const root = path.resolve(process.argv[3] || path.join(here, '..'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.mdc': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('bad url');
    return;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const abs = path.join(root, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!abs.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + rel);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': 'no-cache',
    });
    fs.createReadStream(abs).pipe(res);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`serving ${root}`);
  console.log(`http://localhost:${port}/games/darklegend/?engine=three`);
});

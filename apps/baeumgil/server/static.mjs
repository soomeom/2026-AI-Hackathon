// public/ 정적 파일 제공 (담당: 지훈)

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export async function serveStatic(req, res, publicDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendText(res, 405, '지원하지 않는 요청 방식이에요.');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return sendText(res, 400, '잘못된 주소예요.');
  }
  if (pathname.endsWith('/')) {
    pathname += 'index.html';
  }

  const root = path.resolve(publicDir);
  const filePath = path.resolve(root, `.${pathname}`);
  // public/ 밖의 파일(server.mjs, .env 등)은 절대 내보내지 않는다
  if (!filePath.startsWith(root + path.sep)) {
    return sendText(res, 404, '찾을 수 없어요.');
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return sendText(res, 404, '찾을 수 없어요.');
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    sendText(res, 404, '찾을 수 없어요.');
  }
}

function sendText(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

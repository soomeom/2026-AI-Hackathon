// HTTP 라우팅 (담당: 지훈)
//   GET  /api/health  서버·AI 준비 상태
//   POST /api/ai      AI 호출 (server/ai/handler.mjs)
//   그 외 GET         public/ 정적 파일

import http from 'node:http';

import { ERROR_CODES, fail } from '../public/src/domain/contracts.js';
import { serveStatic } from './static.mjs';

const MAX_BODY_BYTES = 100 * 1024;

/**
 * @param {object} options
 * @param {string} options.publicDir
 * @param {(body: unknown, context: { signal: AbortSignal }) => Promise<{ status: number, payload: object }>} options.aiHandler
 * @param {{ configured: boolean, provider: string | null, model: string | null }} options.aiStatus
 */
export function createApp({ publicDir, aiHandler, aiStatus }) {
  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (pathname === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, { ok: true, ai: aiStatus });
      }
      if (pathname === '/api/ai') {
        if (req.method !== 'POST') {
          return sendJson(res, 405, fail(ERROR_CODES.INVALID_REQUEST, { field: 'method' }));
        }
        return await handleAi(req, res, aiHandler);
      }
      if (pathname.startsWith('/api/')) {
        return sendJson(res, 404, fail(ERROR_CODES.INVALID_REQUEST, { field: 'path' }));
      }
      return await serveStatic(req, res, publicDir);
    } catch (error) {
      console.error('[server] 처리하지 못한 오류', error);
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: { code: 'internal_error', message: '서버에서 문제가 생겼어요.' } });
      } else {
        res.end();
      }
    }
  });
}

async function handleAi(req, res, aiHandler) {
  const body = await readJsonBody(req);
  if (!body.ok) {
    // 다 읽지 않은 본문이 남은 연결은 재사용되지 않도록 닫는다
    const headers = body.status === 413 ? { connection: 'close' } : {};
    return sendJson(res, body.status, { ok: false, requestId: null, error: body.error }, headers);
  }
  // 화면이 요청을 취소하거나 창을 닫으면 Gemini 호출도 멈춘다
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });
  const { status, payload } = await aiHandler(body.value, { signal: controller.signal });
  if (!res.destroyed) {
    sendJson(res, status, payload);
  }
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const settle = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // 남은 본문은 버리면서 흘려보내고 바로 413으로 답한다
        settle({ ok: false, status: 413, error: fail(ERROR_CODES.INVALID_REQUEST, { field: 'body', reason: 'too_large' }).error });
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        settle({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      } catch {
        settle({ ok: false, status: 400, error: fail(ERROR_CODES.INVALID_REQUEST, { field: 'body', reason: 'not_json' }).error });
      }
    });
    req.on('error', () => {
      settle({ ok: false, status: 400, error: fail(ERROR_CODES.INVALID_REQUEST, { field: 'body', reason: 'read_failed' }).error });
    });
  });
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

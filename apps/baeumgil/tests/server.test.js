import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { createApp } from '../server/app.mjs';

let server;
let baseUrl;
let workDir;
const aiCalls = [];

before(async () => {
  workDir = await mkdtemp(path.join(os.tmpdir(), 'baeumgil-server-'));
  const publicDir = path.join(workDir, 'public');
  await mkdir(publicDir);
  await writeFile(path.join(publicDir, 'index.html'), '<!doctype html><title>배움길</title>');
  await writeFile(path.join(workDir, 'secret.txt'), 'outside public');

  server = createApp({
    publicDir,
    aiStatus: { configured: false, provider: null, model: null },
    aiHandler: async (body) => {
      aiCalls.push(body);
      return { status: 200, payload: { ok: true, requestId: body.requestId } };
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(workDir, { recursive: true, force: true });
});

// fetch는 '..'를 정리해 버리므로 경로를 그대로 보내려고 http.request를 쓴다
function rawGet(rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}${rawPath}`, { method: 'GET' }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

test('GET /api/health는 AI 준비 상태를 알려 준다', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, ai: { configured: false, provider: null, model: null } });
});

test('POST /api/ai는 본문을 처리기로 넘기고 결과를 그대로 돌려준다', async () => {
  const response = await fetch(`${baseUrl}/api/ai`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: 'ai-req-1' }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, requestId: 'ai-req-1' });
  assert.equal(aiCalls.at(-1).requestId, 'ai-req-1');
});

test('JSON이 아닌 본문, 너무 큰 본문, GET 요청은 거부한다', async () => {
  const notJson = await fetch(`${baseUrl}/api/ai`, { method: 'POST', body: 'not json' });
  assert.equal(notJson.status, 400);
  assert.equal((await notJson.json()).error.code, 'invalid_request');

  const tooLarge = await fetch(`${baseUrl}/api/ai`, { method: 'POST', body: 'x'.repeat(200 * 1024) });
  assert.equal(tooLarge.status, 413);

  const wrongMethod = await fetch(`${baseUrl}/api/ai`);
  assert.equal(wrongMethod.status, 405);
});

test('알 수 없는 API 경로는 404 JSON으로 답한다', async () => {
  const response = await fetch(`${baseUrl}/api/nothing`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).ok, false);
});

test('public/의 파일을 내보낸다', async () => {
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /배움길/);
});

test('public/ 밖의 파일은 내보내지 않는다', async () => {
  assert.equal(await rawGet('/..%2fsecret.txt'), 404);
  assert.equal(await rawGet('/%2e%2e/secret.txt'), 404);
  assert.equal(await rawGet('/missing.js'), 404);
});

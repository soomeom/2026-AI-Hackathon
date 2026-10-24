import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAI } from '../public/src/ai/client.js';

const reply = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });
const input = { requestId: 'req-1', inputRevision: 3, kind: 'lesson_plan' };

test('성공 응답은 요청 ID·입력 버전과 함께 돌려준다', async () => {
  const result = await requestAI(input, { fetchImpl: reply(200, { status: 'ok', output: { kind: 'lesson_plan' }, requestId: 'req-1', inputRevision: 3 }) });
  assert.deepEqual(result, { status: 'ok', output: { kind: 'lesson_plan' }, requestId: 'req-1', inputRevision: 3 });
});

test('서버 오류는 서버 안내 문구를 그대로 쓴다 (예: 키 미설정, 한도 초과)', async () => {
  const result = await requestAI(input, { fetchImpl: reply(503, { status: 'failed', error: { code: 'ai_not_configured', message: '서버의 AI 키와 모델 설정이 필요합니다.' } }) });
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'ai_not_configured');
  assert.match(result.message, /AI 키/);
});

test('시간 제한을 넘기면 실패로 전환한다', async () => {
  const hang = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const result = await requestAI(input, { fetchImpl: hang, timeoutMs: 20 });
  assert.equal(result.code, 'ai_timeout');
});

test('사용자가 취소하면 canceled 로 끝난다', async () => {
  const hang = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const controller = new AbortController();
  const pending = requestAI(input, { fetchImpl: hang, signal: controller.signal, timeoutMs: 5000 });
  controller.abort();
  assert.equal((await pending).status, 'canceled');
});

test('네트워크 오류도 실패 결과로 돌려주고 예외를 던지지 않는다', async () => {
  const result = await requestAI(input, { fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(result.code, 'ai_unavailable');
});

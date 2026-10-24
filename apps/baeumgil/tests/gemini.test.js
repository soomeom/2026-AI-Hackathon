import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ERROR_CODES } from '../public/src/domain/contracts.js';
import { ProviderError, createGeminiProvider } from '../server/ai/gemini.mjs';

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

const request = {
  systemInstruction: { parts: [{ text: '시스템 지침' }] },
  contents: [{ role: 'user', parts: [{ text: '학생 기록' }] }],
  generationConfig: { responseMimeType: 'application/json' },
};

test('generateContent 본문을 그대로 보내고 키는 URL이 아닌 헤더로 보낸다', async () => {
  const calls = [];
  const provider = createGeminiProvider({
    apiKey: 'test-key',
    model: 'gemini-3.8-flash',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(200, {
        modelVersion: 'gemini-3.8-flash-001',
        candidates: [{ content: { parts: [{ text: '{"ok":' }, { text: 'true}' }] } }],
      });
    },
  });

  const result = await provider.generate({ request });
  assert.deepEqual(result, { text: '{"ok":true}', model: 'gemini-3.8-flash-001' });

  const [{ url, options }] = calls;
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.ok(!url.includes('test-key'));
  assert.equal(options.headers['x-goog-api-key'], 'test-key');
  assert.deepEqual(JSON.parse(options.body), request);
});

test('429는 호출 한도 초과로 분류한다', async () => {
  const provider = createGeminiProvider({ apiKey: 'k', fetchImpl: async () => jsonResponse(429, {}) });
  await assert.rejects(provider.generate({ request }), (error) => error instanceof ProviderError && error.code === ERROR_CODES.AI_RATE_LIMITED);
});

test('그 밖의 HTTP 오류와 빈 응답은 공급자 오류로 분류한다', async () => {
  const failing = createGeminiProvider({ apiKey: 'k', fetchImpl: async () => jsonResponse(500, {}) });
  await assert.rejects(failing.generate({ request }), { code: ERROR_CODES.AI_PROVIDER_ERROR });

  const notFound = createGeminiProvider({
    apiKey: 'k',
    fetchImpl: async () => jsonResponse(404, { error: { message: 'models/gemini-x is not found' } }),
  });
  await assert.rejects(notFound.generate({ request }), { message: 'Gemini HTTP 404: models/gemini-x is not found' });

  const blocked = createGeminiProvider({
    apiKey: 'k',
    fetchImpl: async () => jsonResponse(200, { promptFeedback: { blockReason: 'SAFETY' } }),
  });
  await assert.rejects(blocked.generate({ request }), /SAFETY/);
});

test('네트워크 오류는 공급자 오류로 분류한다', async () => {
  const provider = createGeminiProvider({
    apiKey: 'k',
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });
  await assert.rejects(provider.generate({ request }), { code: ERROR_CODES.AI_PROVIDER_ERROR });
});

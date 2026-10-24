import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelProvider, withDeadline } from '../server/ai-provider.mjs';
import { aiInput, aiOutput } from './backend-ai-fixtures.js';

const response = (output, finishReason = 'STOP') => new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(output) }] } }] }), { status: 200 });

test('실제 공급자 형식으로 요청하고 공동 스키마로 검증한 JSON만 반환한다', async () => {
  const provider = createModelProvider({ apiKey: 'unit-test-key', model: 'test-model', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent');
    assert.equal(url.includes('unit-test-key'), false);
    assert.equal(options.headers['x-goog-api-key'], 'unit-test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.ok(body.contents[0].parts[0].text.includes('<data>'));
    assert.equal(body.contents[0].parts[0].text.includes('request-1'), false);
    return response(aiOutput());
  } });
  assert.deepEqual(await provider.generate(aiInput()), aiOutput());
});

test('일지 문장도 공동 계약으로 검증하고 가짜 참조는 채택하지 않는다', async () => {
  const provider = createModelProvider({ apiKey: 'test', model: 'test-model', fetchImpl: async () => response(aiOutput('log_narrative')) });
  assert.deepEqual(await provider.generate(aiInput('log_narrative')), aiOutput('log_narrative'));
  const bad = aiOutput(); bad.priorities[0].evidenceIds = ['made-up'];
  const invalid = createModelProvider({ apiKey: 'test', model: 'test-model', fetchImpl: async () => response(bad) });
  await assert.rejects(invalid.generate(aiInput()), { code: 'ai_invalid_output' });
});

test('키·모델 미설정과 잘못된 입력은 네트워크 호출 전에 거부한다', async () => {
  const missing = createModelProvider({ apiKey: '', model: '' });
  assert.equal(missing.configured, false);
  await assert.rejects(missing.generate(aiInput()), { code: 'ai_not_configured' });
  const provider = createModelProvider({ apiKey: 'test', model: 'test-model', fetchImpl: () => { throw new Error('must not call'); } });
  await assert.rejects(provider.generate({ kind: 'score' }), { code: 'invalid_ai_input' });
  await assert.rejects(createModelProvider({ apiKey: 'test', model: '../secret' }).generate(aiInput()), { code: 'ai_not_configured' });
});

test('한도 초과·네트워크 실패는 비밀값과 공급자 원문을 노출하지 않는다', async () => {
  for (const fetchImpl of [async () => new Response('secret provider detail', { status: 429 }), async () => { throw new Error('unit-test-key secret detail'); }]) {
    const provider = createModelProvider({ apiKey: 'unit-test-key', model: 'test-model', fetchImpl });
    await assert.rejects(provider.generate(aiInput()), error => {
      assert.equal(error.message.includes('unit-test-key'), false);
      assert.equal(error.message.includes('secret detail'), false);
      return ['ai_rate_limited', 'ai_unavailable'].includes(error.code);
    });
  }
});

test('차단·잘린 응답·잘못된 JSON을 성공으로 반환하지 않는다', async () => {
  for (const upstream of [new Response('{}'), response(aiOutput(), 'MAX_TOKENS'), new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{not json' }] } }] }))]) {
    const provider = createModelProvider({ apiKey: 'test', model: 'test-model', fetchImpl: async () => upstream });
    await assert.rejects(provider.generate(aiInput()));
  }
});

test('공급자가 취소를 무시해도 시간 제한으로 끝나며 사전 취소는 실행하지 않는다', async () => {
  await assert.rejects(withDeadline(() => new Promise(() => {}), { timeoutMs: 15 }), { code: 'ai_timeout' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(withDeadline(() => { throw new Error('must not run'); }, { signal: controller.signal, timeoutMs: 15 }), { code: 'ai_canceled' });
});

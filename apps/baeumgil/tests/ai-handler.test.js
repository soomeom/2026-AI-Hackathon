import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildAIInput, buildGeminiRequest } from '../public/src/ai/contracts.js';
import { ERROR_CODES } from '../public/src/domain/contracts.js';
import { ProviderError } from '../server/ai/gemini.mjs';
import { createAiHandler } from '../server/ai/handler.mjs';
import { makeAttempt, makeCatalog, stateWithAttempts } from './fixtures.js';

const catalog = makeCatalog();

// ai.test.js와 같은 시연 기록: 원 기출 오답 → 분배법칙 확인 오답 → 이항 확인 정답
function lessonPlanInput() {
  const state = stateWithAttempts([
    makeAttempt({ id: 'original-1', choiceId: 'b', result: 'incorrect' }),
    makeAttempt({ stage: 'concept_check', sourceQuestionId: 'q-cc-distribute-1', choiceId: 'a', result: 'incorrect' }),
    makeAttempt({ stage: 'concept_check', sourceQuestionId: 'q-cc-transpose-1', choiceId: 'b', result: 'correct' }),
  ]);
  return buildAIInput(state, { learnerId: 'learner-1', sessionId: 'session-1', kind: 'lesson_plan', catalog });
}

const validLessonPlan = {
  kind: 'lesson_plan',
  priorities: [{ conceptId: 'c-distribute-sign', evidenceIds: ['ev-c-distribute-sign'], reason: '개념 확인 문항 q-cc-distribute-1 에서 오답이 관찰됨' }],
  mentorQuestions: [{ text: '-3(x - 2)를 전개할 때 뒤의 항 부호를 어떻게 정했는지 설명해 볼래요?', conceptId: 'c-distribute-sign', evidenceIds: ['ev-c-distribute-sign'] }],
  plan: [{ minutes: 10, activity: '분배법칙 예제를 함께 전개하기', questionIds: ['q-cc-distribute-1'] }],
};

function body(overrides = {}) {
  return { requestId: 'ai-req-7', inputVersion: 'path-1@3', input: lessonPlanInput(), ...overrides };
}

function fakeProvider(generate) {
  return { name: 'fake', model: 'fake-model', generate };
}

const replying = (output) => fakeProvider(async () => ({ text: typeof output === 'string' ? output : JSON.stringify(output), model: 'fake-model-001' }));

// signal이 끊길 때까지 기다리는 공급자 (시간 초과·취소 확인용)
const hangingProvider = fakeProvider(
  ({ signal }) =>
    new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
);

test('형식이 틀린 요청은 400 invalid_request로 거부하고 문제 필드를 알려 준다', async () => {
  const handler = createAiHandler({ provider: replying(validLessonPlan) });
  const cases = [
    [{ requestId: '' }, 'requestId'],
    [{ input: undefined }, 'input'],
    [{ input: { ...lessonPlanInput(), kind: 'free_chat' } }, 'input.kind'],
    [{ input: { ...lessonPlanInput(), contractVersion: 99 } }, 'input.contractVersion'],
    [{ input: { ...lessonPlanInput(), allowedEvidenceIds: 'ev-1' } }, 'input.allowedEvidenceIds'],
  ];
  for (const [overrides, field] of cases) {
    const { status, payload } = await handler(body(overrides));
    assert.equal(status, 400, field);
    assert.equal(payload.error.code, ERROR_CODES.INVALID_REQUEST);
    assert.equal(payload.error.field, field);
  }
});

test('키가 없으면 503 ai_not_configured를 돌려준다', async () => {
  const { status, payload } = await createAiHandler({ provider: null })(body());
  assert.equal(status, 503);
  assert.equal(payload.requestId, 'ai-req-7');
  assert.equal(payload.error.code, ERROR_CODES.AI_NOT_CONFIGURED);
  assert.equal(payload.error.retryable, false);
});

test('팀 AI 계약의 Gemini 본문을 보내고, 검증을 통과한 출력만 돌려준다', async () => {
  let sent;
  const input = lessonPlanInput();
  const handler = createAiHandler({
    provider: fakeProvider(async ({ request }) => {
      sent = request;
      return { text: JSON.stringify(validLessonPlan), model: 'fake-model-001' };
    }),
    now: () => new Date('2026-10-24T07:00:00.000Z'),
  });

  const { status, payload } = await handler(body({ input }));
  assert.equal(status, 200);
  assert.deepEqual(sent, buildGeminiRequest(input));
  assert.deepEqual(payload, {
    ok: true,
    requestId: 'ai-req-7',
    inputVersion: 'path-1@3',
    kind: 'lesson_plan',
    source: 'live_ai',
    provider: 'fake',
    model: 'fake-model-001',
    output: validLessonPlan,
    completedAt: '2026-10-24T07:00:00.000Z',
  });
});

test('실험 도구가 Gemini 본문 생성을 바꾸면 그 본문을 보내고, 검증은 그대로 한다', async () => {
  let sent;
  const handler = createAiHandler({
    provider: fakeProvider(async ({ request }) => {
      sent = request;
      return { text: JSON.stringify(validLessonPlan), model: 'm' };
    }),
    buildRequest: (input) => ({ ...buildGeminiRequest(input), systemInstruction: { parts: [{ text: '실험 규칙' }] } }),
  });
  const { status } = await handler(body());
  assert.equal(status, 200);
  assert.equal(sent.systemInstruction.parts[0].text, '실험 규칙');
  assert.ok(sent.generationConfig.responseSchema);
});

test('JSON이 아닌 출력은 채택하지 않는다', async () => {
  const { status, payload } = await createAiHandler({ provider: replying('그냥 문장') })(body());
  assert.equal(status, 502);
  assert.equal(payload.error.code, ERROR_CODES.AI_INVALID_OUTPUT);
  assert.equal(payload.error.errors[0].code, 'invalidJson');
  assert.equal(payload.error.retryable, true);
});

test('허용되지 않은 근거 ID를 쓴 출력은 채택하지 않는다', async () => {
  const forged = {
    ...validLessonPlan,
    priorities: [{ ...validLessonPlan.priorities[0], evidenceIds: ['ev-made-up'] }],
  };
  const { status, payload } = await createAiHandler({ provider: replying(forged) })(body());
  assert.equal(status, 502);
  assert.ok(payload.error.errors.some((error) => error.code === 'unknownEvidenceId'));
});

test('호출 한도 초과는 429 ai_rate_limited로 돌려준다', async () => {
  const handler = createAiHandler({
    provider: fakeProvider(async () => {
      throw new ProviderError(ERROR_CODES.AI_RATE_LIMITED, 'limit', { status: 429 });
    }),
  });
  const { status, payload } = await handler(body());
  assert.equal(status, 429);
  assert.equal(payload.error.code, ERROR_CODES.AI_RATE_LIMITED);
});

test('제한 시간을 넘기면 504 ai_timeout으로 끝낸다', async () => {
  const { status, payload } = await createAiHandler({ provider: hangingProvider, timeoutMs: 30 })(body());
  assert.equal(status, 504);
  assert.equal(payload.error.code, ERROR_CODES.AI_TIMEOUT);
});

test('화면이 요청을 취소하면 ai_canceled로 끝낸다', async () => {
  const handler = createAiHandler({ provider: hangingProvider, timeoutMs: 5_000 });
  const controller = new AbortController();
  const pending = handler(body(), { signal: controller.signal });
  controller.abort();
  const { payload } = await pending;
  assert.equal(payload.error.code, ERROR_CODES.AI_CANCELED);
});

test('기록에는 입력 내용을 남기지 않는다', async () => {
  const entries = [];
  await createAiHandler({ provider: replying(validLessonPlan), log: (entry) => entries.push(entry) })(body());
  assert.equal(entries.length, 1);
  assert.deepEqual(Object.keys(entries[0]).sort(), ['kind', 'ms', 'outcome', 'requestId']);
});

test('공급자 오류의 원인은 서버 기록에만 남기고 화면 응답에는 넣지 않는다', async () => {
  const entries = [];
  const handler = createAiHandler({
    provider: fakeProvider(async () => {
      throw new ProviderError(ERROR_CODES.AI_PROVIDER_ERROR, 'Gemini HTTP 404: models/gemini-x is not found', { status: 404 });
    }),
    log: (entry) => entries.push(entry),
  });
  const { payload } = await handler(body());
  assert.equal(entries[0].detail, 'Gemini HTTP 404: models/gemini-x is not found');
  assert.doesNotMatch(JSON.stringify(payload), /gemini-x/);
});

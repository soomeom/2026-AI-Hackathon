import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createAppServer } from '../server.mjs';
import { aiInput, aiOutput } from './backend-ai-fixtures.js';
import { applyLearningCommand } from '../public/src/learning/engine.js';
import { normalizeChoiceValue } from '../public/src/learning/exposure.js';
import { loadState, saveState } from '../public/src/state/persistence.js';
import { buildAIInput } from '../public/src/ai/contracts.js';
import { saveSession, createSessionSnapshot, confirmLog, buildMonthlyLedger } from '../public/src/mentoring/logs.js';

async function start(t, options = {}) {
  const server = createAppServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
const post = (url, input, headers = {}) => fetch(`${url}/api/ai`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(input) });

test('상태·검수된 카탈로그·가명 초기 상태를 조회하고 서버 DB로 표시하지 않는다', async t => {
  const url = await start(t, { provider: { configured: false } });
  const health = await (await fetch(`${url}/api/health`)).json();
  assert.equal(health.storage, 'browser-local');
  assert.equal(health.ai.configured, false);
  const bootstrap = await (await fetch(`${url}/api/bootstrap`)).json();
  assert.equal(bootstrap.state.learners[0].id, 'learner-1');
  assert.equal(bootstrap.state.assignments[0].questionId, 'q-eq-1');
  assert.equal(bootstrap.assignableQuestions.length, 2);
  assert.equal(bootstrap.state.sessions.length, 0);
});

test('JSON 요청을 받아 검증한 실제 호출 결과와 요청·입력 버전을 반환한다', async t => {
  const url = await start(t, { provider: { configured: true, async generate() { return aiOutput(); } } });
  const input = aiInput(); input.inputRevision = 4;
  const response = await post(url, input);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.output, aiOutput());
  assert.equal(body.requestId, 'request-1');
  assert.equal(body.inputRevision, 4);
  assert.equal(body.source, 'live');
});

test('설정 없음·잘못된 입력·근거 없는 출력이 성공으로 표시되지 않는다', async t => {
  const missing = await start(t, { provider: { configured: false } });
  assert.equal((await post(missing, aiInput())).status, 503);
  assert.equal((await post(missing, { kind: 'wrong' })).status, 400);
  const invalid = await start(t, { provider: { configured: true, async generate() { return { kind: 'lesson_plan' }; } } });
  assert.equal((await post(invalid, aiInput())).status, 502);
});

test('외부 웹사이트의 AI 요청과 잘못된 JSON·과대 본문을 거부한다', async t => {
  const url = await start(t, { provider: { configured: false } });
  assert.equal((await post(url, aiInput(), { origin: 'https://example.com' })).status, 403);
  assert.equal((await fetch(`${url}/api/ai`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' })).status, 400);
  assert.equal((await post(url, { data: 'a'.repeat(600000) })).status, 413);
});

test('대기하는 공급자도 시간 초과로 끝나고 다른 상태 요청은 계속 처리한다', async t => {
  const url = await start(t, { aiTimeoutMs: 20, provider: { configured: true, generate() { return new Promise(() => {}); } } });
  const response = await post(url, aiInput());
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, 'ai_timeout');
  assert.equal((await fetch(`${url}/api/health`)).status, 200);
});

test('public 파일만 제공하고 설정·경로 탈출·심볼릭 링크 밖의 파일을 노출하지 않는다', async t => {
  const root = await mkdtemp(join(tmpdir(), 'baeumgil-http-'));
  const publicDir = join(root, 'public');
  await mkdir(publicDir);
  await writeFile(join(publicDir, 'index.html'), '<h1>FE fixture</h1>');
  await writeFile(join(root, '.env'), 'PRIVATE_TEST_VALUE');
  t.after(() => {
    const absolute = resolve(root);
    if (!absolute.startsWith(resolve(tmpdir()) + sep + 'baeumgil-http-')) throw new Error('Unsafe cleanup target');
    return rm(absolute, { recursive: true, force: true });
  });
  const url = await start(t, { publicDir, provider: { configured: false } });
  assert.equal(await (await fetch(url)).text(), '<h1>FE fixture</h1>');
  for (const path of ['/.env', '/%2e%2e/.env', '/server.mjs']) {
    const response = await fetch(url + path);
    assert.equal(response.status, 404);
    assert.equal((await response.text()).includes('PRIVATE_TEST_VALUE'), false);
  }
  await mkdir(join(root, 'private'));
  await writeFile(join(root, 'private', 'secret.txt'), 'PRIVATE_TEST_VALUE');
  await symlink(join(root, 'private'), join(publicDir, 'outside'), 'junction');
  const linked = await fetch(`${url}/outside/secret.txt`);
  assert.equal(linked.status, 404);
  assert.equal((await linked.text()).includes('PRIVATE_TEST_VALUE'), false);
});

test('초기 API → 전체 보충 학습·매번 저장/복원 → 회기·일지 AI 요청 → 확정 대장이 연결된다', async t => {
  const url = await start(t, { provider: { configured: true, async generate(input) {
    assert.equal(input.kind, 'log_narrative');
    assert.equal(input.facts.originalStats.incorrect, 1);
    assert.equal(input.facts.retryStats.correct, 1);
    assert.equal(input.facts.transferStats.correct, 1);
    return { kind: 'log_narrative', sentences: [{
      text: '방정식 풀이를 함께 확인함.',
      evidenceIds: [input.allowedEvidenceIds[0]], questionIds: [input.allowedQuestionIds[0]],
    }] };
  } } });
  const bootstrap = await (await fetch(`${url}/api/bootstrap`)).json();
  let state = bootstrap.state;
  let raw = null;
  const storage = { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
  const persist = next => {
    assert.equal(saveState(storage, next, state.revision).ok, true);
    state = loadState(storage).state;
    assert.deepEqual(state, next);
  };
  let sequence = 0;
  let seed = 42;
  const rng = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = (value + Math.imul(value ^ value >>> 7, 61 | value)) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  const send = (type, fields = {}) => {
    const result = applyLearningCommand(state, { type, learnerId: 'learner-1', pathId: 'path-1', ...fields }, { catalog: bootstrap.catalog, rng });
    assert.equal(result.events.some(event => event.type === 'commandRejected'), false);
    persist({ ...result.state, revision: state.revision + 1, events: [...state.events, ...result.events] });
  };
  send('START_PATH');
  const stages = [];
  while (state.paths[0].stage !== 'completed') {
    const stage = state.paths[0].stage;
    assert.ok(stages.length < 10, 'flow must terminate');
    stages.push(stage);
    for (const [index, item] of state.paths[0].items.entries()) {
      const wrong = stage === 'original_attempt' || (stage === 'concept_check' && index === 0);
      const choice = item.choices.find(option => (normalizeChoiceValue(option.value) === normalizeChoiceValue(item.answer)) !== wrong);
      send('PRESENT_QUESTION', { itemId: item.id });
      send('SUBMIT_ANSWER', { itemId: item.id, submissionId: `sub-${++sequence}`, choiceId: choice.id, abstained: false });
    }
    send('ADVANCE');
  }
  assert.deepEqual(stages, ['original_attempt', 'concept_check', 'foundation_practice', 'similar_practice', 'original_retry', 'transfer_check']);
  assert.equal(state.sessions.length, 0);
  persist(saveSession(state, { id: 'session-1', learnerId: 'learner-1', mentorId: 'mentor-1', localDate: '2026-10-24', attendance: 'attended', actualMinutes: 30, pathIds: ['path-1'], note: '풀이를 함께 확인함' }));
  const input = buildAIInput(createSessionSnapshot(state, 'session-1'), { learnerId: 'learner-1', sessionId: 'session-1', kind: 'log_narrative', catalog: bootstrap.catalog, requestId: 'flow-request' });
  const response = await post(url, input);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.inputRevision, state.revision);
  persist(confirmLog(state, { sessionId: 'session-1', reviewed: true, content: body.output.sentences.map(sentence => sentence.text).join('\n') }));
  const ledger = buildMonthlyLedger(state, '2026-10');
  assert.equal(ledger.totalMinutes, 30);
  assert.equal(ledger.sessionCount, 1);
});

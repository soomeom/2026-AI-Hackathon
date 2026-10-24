import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../public/src/domain/contracts.js';
import { saveSession, buildLogFacts, confirmLog, retractLog, buildMonthlyLedger, createSessionSnapshot } from '../public/src/mentoring/logs.js';
import { makeAttempt, stateWithAttempts } from './fixtures.js';

const session = overrides => ({ id: 'session-1', learnerId: 'learner-1', mentorId: 'mentor-1', localDate: '2026-11-01', attendance: 'attended', actualMinutes: 30, pathIds: [], note: '부호 계산을 함께 확인함', ...overrides });
const confirmation = overrides => ({ sessionId: 'session-1', content: '부호 계산 연습을 진행함.', reviewed: true, at: '2026-10-31T15:30:00Z', ...overrides });

test('자율 학습과 실제 회기를 분리하고 잘못된 날짜·참조·시간을 거부한다', () => {
  const initial = createInitialState();
  assert.throws(() => confirmLog(initial, confirmation()), { code: 'session_not_found' });
  for (const input of [session({ localDate: '2026-02-30' }), session({ actualMinutes: -1 }), session({ learnerId: 'missing' }), session({ pathIds: ['missing'] })]) {
    assert.throws(() => saveSession(initial, input));
  }
  assert.equal(initial.sessions.length, 0);
});

test('결석·0분·미검토·빈 본문은 확정할 수 없고 초안 회기는 합산하지 않는다', () => {
  for (const change of [{ attendance: 'absent' }, { actualMinutes: 0 }]) {
    const state = saveSession(createInitialState(), session(change));
    assert.throws(() => confirmLog(state, confirmation()));
    assert.equal(buildMonthlyLedger(state, '2026-11').totalMinutes, 0);
  }
  const state = saveSession(createInitialState(), session());
  assert.throws(() => confirmLog(state, confirmation({ reviewed: false })), { code: 'review_required' });
  assert.throws(() => confirmLog(state, confirmation({ content: ' ' })), { code: 'content_required' });
  assert.equal(buildMonthlyLedger(state, '2026-11').rows.length, 0);
});

test('확정·개정은 이전 내용과 날짜 스냅샷을 보존하고 최신본 하나만 합산한다', () => {
  const original = saveSession(createInitialState(), session());
  const first = confirmLog(original, confirmation());
  const second = confirmLog(first, confirmation({ content: '부호 계산과 방정식 풀이를 확인함.' }));
  assert.equal(first.logs.length, 1);
  assert.equal(second.logs.length, 2);
  assert.equal(second.logs[0].content, '부호 계산 연습을 진행함.');
  assert.equal(buildMonthlyLedger(second, '2026-11').totalMinutes, 30);
  assert.equal(buildMonthlyLedger(second, '2026-11').rows[0].revision, 2);
  assert.equal(original.logs.length, 0);
});

test('같은 확정 내용을 반복 제출해도 개정본과 합계를 중복 생성하지 않는다', () => {
  const first = confirmLog(saveSession(createInitialState(), session()), confirmation());
  const second = confirmLog(first, confirmation());
  assert.equal(second.logs.length, 1);
  assert.equal(buildMonthlyLedger(second, '2026-11').rows.length, 1);
});

test('회기 시간·메모를 고친 뒤에는 재검토·재확정 전 과거 일지로 합산하지 않는다', () => {
  const first = confirmLog(saveSession(createInitialState(), session()), confirmation());
  const updated = saveSession(first, session({ actualMinutes: 45 }));
  assert.equal(updated.logs[0].sessionSnapshot.actualMinutes, 30);
  assert.equal(buildMonthlyLedger(updated, '2026-11').totalMinutes, 0);
  assert.equal(buildLogFacts(updated, 'session-1').requiresReview, true);
  const reconfirmed = confirmLog(updated, confirmation());
  assert.equal(buildMonthlyLedger(reconfirmed, '2026-11').totalMinutes, 45);
});

test('철회는 이유와 이력을 남기고 이전 확정본을 되살려 집계하지 않는다', () => {
  let state = confirmLog(saveSession(createInitialState(), session()), confirmation());
  state = confirmLog(state, confirmation({ content: '수정된 회기 내용' }));
  assert.throws(() => retractLog(state, { sessionId: 'session-1', reason: '' }));
  const retracted = retractLog(state, { sessionId: 'session-1', reason: '기록 확인 중', at: '2026-11-01T01:00:00Z' });
  assert.equal(buildMonthlyLedger(retracted, '2026-11').rows.length, 0);
  assert.equal(retracted.logs[0].content, '부호 계산 연습을 진행함.');
  assert.equal(retracted.events.at(-1).type, 'logRetracted');
  const next = confirmLog(retracted, confirmation({ content: '다시 확인한 회기 내용' }));
  assert.equal(buildMonthlyLedger(next, '2026-11').totalMinutes, 30);
});

test('확정 시각의 UTC 월이 달라도 한국 회기 날짜의 월로 합산한다', () => {
  const state = confirmLog(saveSession(createInitialState(), session()), confirmation());
  assert.equal(buildMonthlyLedger(state, '2026-10').rows.length, 0);
  assert.equal(buildMonthlyLedger(state, '2026-11').totalMinutes, 30);
  assert.throws(() => buildMonthlyLedger(state, '2026-13'));
});

test('회기 사실과 일지 AI 입력용 스냅샷에 다른 회기의 학습을 섞지 않는다', () => {
  const attempts = [
    makeAttempt({ id: 'a-1', pathId: 'path-1', result: 'incorrect' }),
    makeAttempt({ id: 'a-2', pathId: 'path-2', result: 'correct' }),
  ];
  let state = createInitialState(stateWithAttempts(attempts));
  state.paths.push({ ...state.paths[0], id: 'path-2' });
  state = saveSession(state, session({ pathIds: ['path-1'] }));
  const snapshot = createSessionSnapshot(state, 'session-1');
  assert.deepEqual(snapshot.attempts.map(a => a.id), ['a-1']);
  const facts = buildLogFacts(state, 'session-1');
  assert.equal(facts.learning.originalStats.incorrect, 1);
  assert.equal(facts.learning.originalStats.correct, 0);
  assert.equal(facts.note, '부호 계산을 함께 확인함');
  assert.equal(state.attempts.length, 2);
});

test('다른 학생 경로를 회기에 연결할 수 없다', () => {
  const state = createInitialState({ paths: [{ id: 'other-path', learnerId: 'learner-2' }] });
  assert.throws(() => saveSession(state, session({ pathIds: ['other-path'] })), { code: 'path_learner_mismatch' });
});

test('확정 후 연결 학습 기록이 바뀌면 재검토 전에는 집계하지 않고 재확정 시 새 근거를 보존한다', () => {
  let state = createInitialState(stateWithAttempts([makeAttempt({ id: 'a-1', result: 'incorrect' })]));
  state = saveSession(state, session({ pathIds: ['path-1'] }));
  state = confirmLog(state, confirmation());
  const changed = structuredClone(state);
  changed.attempts[0].result = 'correct';
  assert.equal(buildLogFacts(changed, 'session-1').requiresReview, true);
  assert.equal(buildMonthlyLedger(changed, '2026-11').totalMinutes, 0);
  const reconfirmed = confirmLog(changed, confirmation());
  assert.equal(reconfirmed.logs.length, 2);
  assert.equal(reconfirmed.logs[0].learningSnapshot.attempts[0].result, 'incorrect');
  assert.equal(reconfirmed.logs[1].learningSnapshot.attempts[0].result, 'correct');
  assert.equal(buildMonthlyLedger(reconfirmed, '2026-11').totalMinutes, 30);
  const unrelated = structuredClone(reconfirmed);
  unrelated.attempts.push(makeAttempt({ id: 'other-attempt', pathId: 'other-path' }));
  assert.equal(buildLogFacts(unrelated, 'session-1').requiresReview, false);
  assert.equal(buildMonthlyLedger(unrelated, '2026-11').totalMinutes, 30);
});

test('같은 회기를 다시 저장해도 확정 대장과 버전이 바뀌지 않는다', () => {
  const confirmed = confirmLog(saveSession(createInitialState(), session()), confirmation());
  const same = saveSession(confirmed, session({ note: '  부호 계산을 함께 확인함  ' }));
  assert.equal(same, confirmed);
  assert.equal(buildMonthlyLedger(same, '2026-11').totalMinutes, 30);
  assert.equal(buildLogFacts(same, 'session-1').requiresReview, false);
});

test('일지 확정 이전 회기 변경도 수정 전후의 사실을 이력으로 보존한다', () => {
  const first = saveSession(createInitialState(), session());
  const updated = saveSession(first, session({ actualMinutes: 45, note: '추가 연습 진행' }));
  const event = updated.events.at(-1);
  assert.equal(event.previous.actualMinutes, 30);
  assert.equal(event.current.actualMinutes, 45);
  assert.equal(event.previous.note, '부호 계산을 함께 확인함');
  assert.equal(event.current.note, '추가 연습 진행');
  assert.equal(first.sessions[0].actualMinutes, 30);
});

test('확정 후 학생이 같은 경로를 계속 학습해도 확정 일지는 대장에서 빠지지 않는다', () => {
  let state = createInitialState(stateWithAttempts([makeAttempt({ id: 'a-1', result: 'incorrect' })]));
  state = saveSession(state, session({ pathIds: ['path-1'] }));
  state = confirmLog(state, confirmation());
  const later = structuredClone(state);
  // 다음 주에 같은 경로에서 새 문제를 풀고 단계가 바뀜
  later.attempts.push(makeAttempt({ id: 'a-2', result: 'correct', submittedAt: '2026-11-08T05:00:00Z' }));
  later.exposures.push({ id: 'exposure-9', learnerId: 'learner-1', pathId: 'path-1', fingerprint: 'x' });
  later.paths[0].stage = 'similar_practice';
  assert.equal(buildLogFacts(later, 'session-1').requiresReview, false);
  assert.equal(buildMonthlyLedger(later, '2026-11').totalMinutes, 30);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearnerSummary, JUDGEMENTAL_TERMS } from '../public/src/mentoring/summary.js';
import { applyLearningCommand } from '../public/src/learning/engine.js';
import { normalizeChoiceValue } from '../public/src/learning/exposure.js';
import { makeCatalog, makeState, makeAttempt, stateWithAttempts, stateWithSeenTransfer, command } from './fixtures.js';

const catalog = makeCatalog();
const summarize = (state) => buildLearnerSummary(state, 'learner-1', { catalog });
const evidenceOf = (summary, conceptId) => summary.evidence.find((e) => e.conceptId === conceptId);
const flagCodes = (summary) => summary.reviewFlags.map((f) => f.code);

test('stateWithSeenTransfer: 이미 본 새 적용 문항은 독립 적용 정답률에서 빠진다', () => {
  const s = summarize(stateWithSeenTransfer());
  assert.deepEqual(s.originalStats, { correct: 0, incorrect: 1, abstained: 0, attempted: 1, rate: 0 });
  assert.deepEqual(s.retryStats, { correct: 1, incorrect: 0, abstained: 0, attempted: 1, rate: 1 });
  assert.equal(s.transferStats.attempted, 0);
  assert.equal(s.transferStats.rate, null);
  assert.deepEqual(s.transferStats.excluded, { previouslySeen: 1, historyUnknown: 0, assisted: 0 });
  assert.equal(s.unmeasuredCount, 1);
  assert.ok(flagCodes(s).includes('transfer_previously_seen'));
});

test('새 적용: 이력 불명·도움 사용·문항 소진도 분모에서 빠지고 따로 표시된다', () => {
  const state = stateWithAttempts([
    makeAttempt({ stage: 'transfer_check', result: 'correct', noveltyAtPresentation: 'first_seen' }),
    makeAttempt({ stage: 'transfer_check', result: 'correct', noveltyAtPresentation: 'unknown' }),
    makeAttempt({ stage: 'transfer_check', result: 'correct', noveltyAtPresentation: 'first_seen', helpUsed: true }),
  ]);
  state.paths.push({ ...state.paths[0], id: 'path-2', transferStatus: 'not_measured', status: 'needs_mentor', stage: 'needs_mentor' });
  const s = summarize(state);
  assert.deepEqual(s.transferStats, {
    correct: 1, incorrect: 0, abstained: 0, attempted: 1, rate: 1,
    excluded: { previouslySeen: 0, historyUnknown: 1, assisted: 1 },
  });
  assert.equal(s.unmeasuredCount, 3);
  for (const code of ['transfer_history_unknown', 'transfer_assisted', 'transfer_not_measured', 'needs_mentor']) {
    assert.ok(flagCodes(s).includes(code), code);
  }
});

test('새 적용 단계에서 멘토 도움을 요청했다면 독립 적용으로 인정하지 않는다', () => {
  const state = stateWithAttempts(
    [makeAttempt({ stage: 'transfer_check', result: 'correct' })],
    { mentorRequests: [{ stage: 'transfer_check', reason: null, at: null }] },
  );
  const s = summarize(state);
  assert.equal(s.transferStats.attempted, 0);
  assert.equal(s.transferStats.excluded.assisted, 1);
});

test('abstainedIsSeparate', () => {
  const state = stateWithAttempts([
    makeAttempt({ stage: 'original_attempt', result: 'correct' }),
    makeAttempt({ stage: 'original_attempt', pathId: 'path-2', choiceId: 'a', result: 'incorrect' }),
    makeAttempt({ stage: 'original_attempt', pathId: 'path-3', choiceId: null, abstained: true, result: 'abstained' }),
    makeAttempt({ stage: 'transfer_check', choiceId: null, abstained: true, result: 'abstained' }),
  ]);
  const s = summarize(state);
  assert.deepEqual(s.originalStats, { correct: 1, incorrect: 1, abstained: 1, attempted: 2, rate: 0.5 });
  assert.equal(s.transferStats.attempted, 0);
  assert.equal(s.transferStats.abstained, 1);
  assert.equal(s.transferStats.rate, null);
});

test('다른 학생의 기록은 섞이지 않는다', () => {
  const state = stateWithAttempts([
    makeAttempt({ result: 'correct' }),
    makeAttempt({ learnerId: 'learner-2', choiceId: 'a', result: 'incorrect' }),
  ]);
  assert.equal(summarize(state).originalStats.attempted, 1);
});

test('inferredIsNotObserved', () => {
  // 원 기출 한 문항을 분배법칙 실수 선택지(4)로 틀림
  const s = summarize(stateWithAttempts([makeAttempt({ id: 'original-1', choiceId: 'b', result: 'incorrect' })]));

  const core = evidenceOf(s, 'c-eq-solve');
  assert.equal(core.status, 'observed');
  assert.deepEqual(core.counts, { correct: 0, incorrect: 1, abstained: 0 });
  assert.deepEqual(core.attemptIds, ['original-1']);

  for (const conceptId of ['c-distribute-sign', 'c-eq-transpose']) {
    const e = evidenceOf(s, conceptId);
    assert.equal(e.status, 'inferred', conceptId);
    assert.deepEqual(e.attemptIds, [], '직접 응답 근거가 없다');
    assert.deepEqual(e.counts, { correct: 0, incorrect: 0, abstained: 0 });
    assert.ok(e.inferredFrom.length > 0);
  }
  // 한 번의 오답을 선수 개념 전체(2단계 이상)로 전파하지 않는다
  assert.equal(evidenceOf(s, 'c-int-addsub'), undefined);
  assert.equal(evidenceOf(s, 'c-int-mul'), undefined);
  assert.deepEqual(s.evidence.filter((e) => e.status === 'observed').map((e) => e.conceptId), ['c-eq-solve']);
});

test('conflictingEvidenceNeedsReview', () => {
  // 1) 같은 개념에서 오답과 정답이 함께 관찰됨
  const mixed = summarize(stateWithAttempts([
    makeAttempt({ stage: 'concept_check', sourceQuestionId: 'q-cc-distribute-1', choiceId: 'a', result: 'incorrect' }),
    makeAttempt({ stage: 'foundation_practice', sourceQuestionId: null, itemId: 'gen-1', result: 'correct' }),
  ], { pastItems: [{ id: 'gen-1', conceptIds: ['c-distribute-sign'], choices: [] }] }));
  const e1 = evidenceOf(mixed, 'c-distribute-sign');
  assert.equal(e1.status, 'needs_review');
  assert.ok(e1.reasons.includes('mixed_results'));

  // 2) 오답 선택지는 분배법칙 실수를 가리키지만, 분배법칙 직접 확인은 정답
  const conflict = summarize(stateWithAttempts([
    makeAttempt({ stage: 'original_attempt', choiceId: 'b', result: 'incorrect' }),
    makeAttempt({ stage: 'concept_check', sourceQuestionId: 'q-cc-distribute-1', choiceId: 'b', result: 'correct' }),
  ]));
  const e2 = evidenceOf(conflict, 'c-distribute-sign');
  assert.equal(e2.status, 'needs_review');
  assert.ok(e2.reasons.includes('conflicts_with_inference'));

  // 3) 개념 확인 단계를 건너뛰어 근거가 없음
  const skipped = summarize(stateWithAttempts(
    [makeAttempt({ stage: 'original_attempt', choiceId: 'a', result: 'incorrect' })],
    { skippedStageIds: ['concept_check'], needsReview: true },
  ));
  assert.equal(evidenceOf(skipped, 'c-eq-transpose').status, 'needs_review');
  assert.ok(evidenceOf(skipped, 'c-eq-transpose').reasons.includes('stage_skipped'));
  assert.ok(flagCodes(skipped).includes('stage_skipped'));

  // 4) 모름만 있으면 근거 부족
  const onlyAbstained = summarize(stateWithAttempts([
    makeAttempt({ stage: 'concept_check', sourceQuestionId: 'q-cc-transpose-1', choiceId: null, abstained: true, result: 'abstained' }),
  ]));
  assert.ok(evidenceOf(onlyAbstained, 'c-eq-transpose').reasons.includes('insufficient'));
});

test('요약 문장은 단정적 표현 없이 관찰 사실과 멘토 확인 질문으로 구성된다', () => {
  const s = summarize(stateWithAttempts([
    makeAttempt({ id: 'original-1', choiceId: 'b', result: 'incorrect' }),
    makeAttempt({ stage: 'concept_check', sourceQuestionId: 'q-cc-distribute-1', choiceId: null, abstained: true, result: 'abstained' }),
    makeAttempt({ stage: 'concept_check', sourceQuestionId: 'q-cc-transpose-1', result: 'correct' }),
  ]));
  for (const e of s.evidence) {
    assert.equal(typeof e.observation, 'string');
    assert.ok(e.observation.length > 0);
    assert.match(e.mentorQuestion, /\?$/);
  }
  const text = JSON.stringify(s);
  for (const term of JUDGEMENTAL_TERMS) assert.ok(!text.includes(term), term);
});

test('엔진이 만든 실제 상태를 요약할 수 있다', () => {
  let seed = 5;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let state = makeState();
  let n = 0;
  const send = (cmd) => { state = applyLearningCommand(state, cmd, { catalog, rng }).state; };
  const solveStage = (correct) => {
    for (const item of state.paths[0].items) {
      send(command('PRESENT_QUESTION', { itemId: item.id }));
      const choice = item.choices.find((c) => (normalizeChoiceValue(c.value) === normalizeChoiceValue(item.answer)) === correct);
      send(command('SUBMIT_ANSWER', { submissionId: `s${++n}`, itemId: item.id, choiceId: choice.id }));
    }
    send(command('ADVANCE'));
  };
  send(command('START_PATH'));
  solveStage(false); // 원 기출 오답
  for (let i = 0; i < 5; i++) solveStage(true);

  const s = summarize(state);
  assert.equal(state.paths[0].status, 'completed');
  assert.deepEqual(s.originalStats, { correct: 0, incorrect: 1, abstained: 0, attempted: 1, rate: 0 });
  assert.equal(s.retryStats.rate, 1);
  assert.equal(s.transferStats.attempted, 1);
  assert.equal(s.unmeasuredCount, 0);
  assert.equal(s.timeline.length, state.attempts.length);
  assert.ok(s.evidence.some((e) => e.conceptId === 'c-distribute-sign'));
});

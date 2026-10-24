import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAnswer } from '../public/src/learning/grading.js';
import { applyLearningCommand } from '../public/src/learning/engine.js';
import { normalizeChoiceValue } from '../public/src/learning/exposure.js';
import { makeCatalog, makeQuestion, makeState, command } from './fixtures.js';

const catalog = makeCatalog();
const rngOf = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 테스트용 학습자: 명령을 순서대로 적용하고 상태를 들고 다닌다
function learner(overrides) {
  const rng = rngOf(42);
  let submission = 0;
  const self = {
    state: makeState(overrides),
    events: [],
    send(cmd) {
      const result = applyLearningCommand(self.state, cmd, { catalog, rng });
      self.state = result.state;
      self.events = result.events;
      return result;
    },
    get path() { return self.state.paths[0]; },
    // outcome: 'correct' | 'incorrect' | 'abstained' | 정답이 아닌 특정 선택지 값
    answer(index, outcome) {
      const item = self.path.items[index];
      self.send(command('PRESENT_QUESTION', { itemId: item.id }));
      const isAnswer = (c) => normalizeChoiceValue(c.value) === normalizeChoiceValue(item.answer);
      const choice = outcome === 'correct' ? item.choices.find(isAnswer)
        : outcome === 'incorrect' ? item.choices.find((c) => !isAnswer(c))
        : outcome === 'abstained' ? null
        : item.choices.find((c) => c.value === outcome);
      return self.send(command('SUBMIT_ANSWER', {
        submissionId: `sub-${++submission}`, itemId: item.id, choiceId: choice?.id ?? null, abstained: outcome === 'abstained',
      }));
    },
    answerAll(outcomes) { outcomes.forEach((o, i) => self.answer(i, o)); },
    advance(mode) { return self.send(command('ADVANCE', mode ? { mode } : {})); },
  };
  self.send(command('START_PATH'));
  return self;
}

test('gradeAnswer 는 정답·오답·모름을 판정하고 무응답 제출을 막는다', () => {
  const q = makeQuestion();
  assert.equal(gradeAnswer(q, { choiceId: 'c', abstained: false }), 'correct');
  assert.equal(gradeAnswer(q, { choiceId: 'b', abstained: false }), 'incorrect');
  assert.equal(gradeAnswer(q, { choiceId: null, abstained: true }), 'abstained');
  assert.throws(() => gradeAnswer(q, { choiceId: null, abstained: false }), { code: 'emptySubmission' });
  assert.throws(() => gradeAnswer(q, { choiceId: 'z', abstained: false }), { code: 'unknownChoice' });
  // 값으로 채점하므로 동치 분수도 정답
  const frac = makeQuestion({ answer: '1/2', choices: [{ id: 'a', value: '2/4' }, { id: 'b', value: '1' }] });
  assert.equal(gradeAnswer(frac, { choiceId: 'a', abstained: false }), 'correct');
});

test('wrongOriginalRunsRemedialStages', () => {
  const l = learner();
  assert.equal(l.path.stage, 'original_attempt');
  assert.equal(l.path.items[0].sourceQuestionId, 'q-eq-1');

  l.answer(0, '4'); // 분배법칙 부호 실수 선택지
  assert.equal(l.state.attempts[0].id, 'original-1');
  assert.equal(l.state.attempts[0].result, 'incorrect');
  assert.deepEqual(l.path.recommendation, { nextStage: 'concept_check', reason: 'originalIncorrect' });

  l.advance();
  assert.equal(l.path.stage, 'concept_check');
  assert.deepEqual(l.path.items.map((i) => i.sourceQuestionId), ['q-cc-distribute-1', 'q-cc-transpose-1']);
  l.answerAll(['incorrect', 'correct']);
  assert.equal(l.path.focusConceptId, 'c-distribute-sign');

  l.advance();
  assert.equal(l.path.stage, 'foundation_practice');
  assert.equal(l.path.foundationRound, 1);
  assert.equal(l.path.items.length, 3);
  assert.equal(l.path.items[0].conceptIds[0], 'c-distribute-sign');
  l.answerAll(['correct', 'incorrect', 'correct']);
  assert.deepEqual(l.path.recommendation, { nextStage: 'similar_practice', reason: 'foundationPassed' });

  l.advance();
  assert.equal(l.path.items.length, 2);
  l.answerAll(['correct', 'correct']);
  l.advance();
  assert.equal(l.path.stage, 'original_retry');
  assert.equal(l.path.items[0].sourceQuestionId, 'q-eq-1');
  l.answer(0, 'correct');
  assert.equal(l.state.exposures.at(-1).noveltyAtPresentation, 'already_seen');

  l.advance();
  assert.equal(l.path.stage, 'transfer_check');
  assert.equal(l.path.items.length, 1);
  l.answer(0, 'correct');
  assert.equal(l.state.exposures.at(-1).noveltyAtPresentation, 'first_seen');
  l.advance();

  assert.equal(l.path.stage, 'completed');
  assert.equal(l.path.status, 'completed');
  assert.equal(l.path.transferStatus, 'measured');
  assert.equal(l.path.transferResult, 'correct');
  assert.equal(l.path.retryResult, 'correct');
  assert.deepEqual(l.path.stageHistory.map((h) => h.to), [
    'original_attempt', 'concept_check', 'foundation_practice', 'similar_practice', 'original_retry', 'transfer_check', 'completed',
  ]);
});

test('모름을 선택해도 보충 단계로 간다', () => {
  const l = learner();
  l.answer(0, 'abstained');
  assert.equal(l.state.attempts[0].result, 'abstained');
  assert.deepEqual(l.path.recommendation, { nextStage: 'concept_check', reason: 'originalAbstained' });
});

test('correctOriginalSkipsRemediation', () => {
  const l = learner();
  l.answer(0, 'correct');
  assert.deepEqual(l.path.recommendation, { nextStage: 'transfer_check', reason: 'originalCorrect' });
  l.advance();
  assert.equal(l.path.stage, 'transfer_check');
  assert.deepEqual(l.path.stageHistory.map((h) => h.to), ['original_attempt', 'transfer_check']);
  l.answer(0, 'incorrect');
  l.advance();
  assert.equal(l.path.stage, 'completed');
  assert.equal(l.path.transferResult, 'incorrect');
});

test('foundationStopsAfterTwoRounds', () => {
  const l = learner();
  l.answer(0, 'incorrect');
  l.advance();
  l.answerAll(['correct', 'correct']);
  l.advance();
  const round1Ids = l.path.items.map((i) => i.id);
  l.answerAll(['correct', 'incorrect', 'abstained']);
  assert.deepEqual(l.path.recommendation, { nextStage: 'foundation_practice', reason: 'foundationRetry' });

  l.advance();
  assert.equal(l.path.foundationRound, 2);
  assert.notDeepEqual(l.path.items.map((i) => i.id), round1Ids);
  l.answerAll(['incorrect', 'incorrect', 'correct']);
  assert.deepEqual(l.path.recommendation, { nextStage: 'needs_mentor', reason: 'foundationMaxRounds' });

  l.advance();
  assert.equal(l.path.stage, 'needs_mentor');
  assert.equal(l.path.status, 'needs_mentor');
  const { events } = l.advance();
  assert.deepEqual(events, [{ type: 'commandRejected', commandType: 'ADVANCE', reason: 'pathClosed' }]);
  assert.equal(l.path.foundationRound, 2);
});

test('skipAndMentorOverrideAreRecorded', () => {
  const l = learner();
  assert.equal(l.advance('skip').events[0].reason, 'stageNotSkippable');
  l.answer(0, 'incorrect');
  l.advance();
  assert.equal(l.path.stage, 'concept_check');

  l.advance('skip');
  assert.equal(l.path.stage, 'foundation_practice');
  assert.deepEqual(l.path.skippedStageIds, ['concept_check']);
  assert.equal(l.path.needsReview, true);

  const before = l.state;
  assert.equal(l.send(command('MENTOR_OVERRIDE', { mentorId: 'mentor-x', targetStage: 'similar_practice', reason: '수업에서 확인함' })).events[0].reason, 'notMentor');
  assert.equal(l.send(command('MENTOR_OVERRIDE', { mentorId: 'mentor-1', targetStage: 'similar_practice', reason: '' })).events[0].reason, 'reasonRequired');
  assert.equal(l.state, before);

  l.send(command('MENTOR_OVERRIDE', { mentorId: 'mentor-1', targetStage: 'similar_practice', reason: '대면 수업에서 기초 확인 완료', at: '2026-10-24T10:00:00Z' }));
  assert.equal(l.path.stage, 'similar_practice');
  assert.deepEqual(l.path.overrides, [{
    mentorId: 'mentor-1', from: 'foundation_practice', to: 'similar_practice', reason: '대면 수업에서 기초 확인 완료', at: '2026-10-24T10:00:00Z',
  }]);
  assert.equal(l.path.stageHistory.at(-1).reason, 'mentorOverride');
});

test('duplicateSubmissionIsIdempotent', () => {
  const l = learner();
  const item = l.path.items[0];
  l.send(command('PRESENT_QUESTION', { itemId: item.id }));
  const submit = command('SUBMIT_ANSWER', { submissionId: 'sub-1', itemId: item.id, choiceId: 'c' });
  l.send(submit);
  const afterFirst = l.state;

  const { state, events } = l.send(submit);
  assert.equal(state, afterFirst);
  assert.deepEqual(events, [{ type: 'duplicateIgnored', submissionId: 'sub-1' }]);
  assert.equal(state.attempts.length, 1);

  // 같은 command.id 도 한 번만 적용된다
  l.send(command('REQUEST_MENTOR', { id: 'cmd-1', reason: '이해가 안 돼요' }));
  l.send(command('REQUEST_MENTOR', { id: 'cmd-1', reason: '이해가 안 돼요' }));
  assert.equal(l.path.mentorRequests.length, 1);
  assert.deepEqual(l.events, [{ type: 'duplicateIgnored', commandId: 'cmd-1' }]);
});

test('제출 전 노출이 필요하고 무응답 제출과 일시정지 중 제출은 거부된다', () => {
  const l = learner();
  const item = l.path.items[0];
  assert.equal(l.send(command('SUBMIT_ANSWER', { submissionId: 's1', itemId: item.id, choiceId: 'c' })).events[0].reason, 'notPresented');
  l.send(command('PRESENT_QUESTION', { itemId: item.id }));
  assert.equal(l.send(command('SUBMIT_ANSWER', { submissionId: 's2', itemId: item.id, choiceId: null })).events[0].reason, 'emptySubmission');
  l.send(command('PAUSE'));
  assert.equal(l.send(command('SUBMIT_ANSWER', { submissionId: 's3', itemId: item.id, choiceId: 'c' })).events[0].reason, 'pathPaused');
  l.send(command('RESUME'));
  l.send(command('SUBMIT_ANSWER', { submissionId: 's4', itemId: item.id, choiceId: 'c' }));
  assert.equal(l.state.attempts.length, 1);
});

test('도움 사용과 화면 숨김 시간이 풀이 기록에 반영된다', () => {
  const l = learner();
  const item = l.path.items[0];
  l.send(command('PRESENT_QUESTION', { itemId: item.id, at: 0 }));
  l.send(command('USE_HELP', { itemId: item.id, helpType: 'hint', at: 5_000 }));
  l.send(command('SET_VISIBILITY', { visible: false, at: 10_000 }));
  l.send(command('SET_VISIBILITY', { visible: true, at: 40_000 }));
  l.send(command('SUBMIT_ANSWER', { submissionId: 's1', itemId: item.id, choiceId: 'c', at: 60_000 }));
  const attempt = l.state.attempts[0];
  assert.equal(attempt.helpUsed, true);
  assert.equal(attempt.activeMs, 30_000);
  assert.deepEqual(l.path.helpUsage, [{ itemId: item.id, helpType: 'hint', at: 5_000 }]);
});

test('practiceDoesNotCreateSession', () => {
  const l = learner({ sessions: [], logs: [] });
  l.answer(0, 'correct');
  l.advance();
  l.answer(0, 'correct');
  l.advance();
  assert.equal(l.path.status, 'completed');
  assert.deepEqual(l.state.sessions, []);
  assert.deepEqual(l.state.logs, []);

  const fresh = learner();
  fresh.answer(0, 'correct');
  fresh.advance();
  fresh.answer(0, 'correct');
  fresh.advance();
  assert.equal('sessions' in fresh.state, false);
  assert.equal('logs' in fresh.state, false);
});

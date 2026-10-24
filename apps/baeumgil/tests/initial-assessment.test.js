import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialQuestions, startInitialAssessment, presentInitialQuestion, submitInitialAnswer,
  initialAssessmentSummary, planInitialLesson,
} from '../public/src/learning/initial-assessment.js';
import { createInitialState, validateState } from '../public/src/domain/contracts.js';
import { createStore } from '../public/src/state/store.js';
import { gradeAnswer } from '../public/src/learning/grading.js';
import { classifyNovelty, fingerprintQuestion } from '../public/src/learning/exposure.js';
import { buildLearnerSummary } from '../public/src/mentoring/summary.js';
import { loadState, saveState } from '../public/src/state/persistence.js';
import { makeCatalog } from './fixtures.js';

const catalog = makeCatalog();
const at = '2026-10-24T10:00:00Z';
const begin = state => startInitialAssessment(state ?? createInitialState(), { learnerId: 'learner-1', id: 'initial-1', at });
const answer = (state, question, outcome = 'correct') => {
  const choice = question.choices.find(c => (gradeAnswer(question, { choiceId: c.id }) === 'correct') === (outcome === 'correct'));
  const presented = presentInitialQuestion(state, { assessmentId: 'initial-1', questionId: question.id, at });
  return submitInitialAnswer(presented, { assessmentId: 'initial-1', questionId: question.id, choiceId: outcome === 'abstained' ? null : choice.id, abstained: outcome === 'abstained', at });
};
const complete = (outcomes = []) => initialQuestions().reduce((state, q, index) => answer(state, q, outcomes[index] ?? 'correct'), begin());
const plan = overrides => ({ assessmentId: 'initial-1', learnerId: 'learner-1', mentorId: 'mentor-1', conceptId: 'c-int-addsub', questionId: 'q-rat-1', reason: '부호 계산부터 함께 확인', at, ...overrides });

test('7문항은 현재 7개 개념을 각각 확인하며 정답은 하나이고 자체 제작 문항이다', () => {
  const questions = initialQuestions();
  assert.equal(questions.length, 7);
  assert.equal(new Set(questions.map(q => q.conceptIds[0])).size, 7);
  for (const q of questions) {
    assert.equal(q.kind, 'authored');
    assert.ok(catalog.concepts.some(c => c.id === q.conceptIds[0]));
    assert.equal(q.choices.filter(c => gradeAnswer(q, { choiceId: c.id }) === 'correct').length, 1);
  }
  questions[0].prompt = 'changed';
  assert.notEqual(initialQuestions()[0].prompt, 'changed');
});

test('시작·제시·제출은 순서를 지키고 빈 답·다른 선택지·노출 없는 답을 거부한다', () => {
  const state = begin(); const [q, next] = initialQuestions();
  assert.throws(() => submitInitialAnswer(state, { assessmentId: 'initial-1', questionId: q.id, choiceId: 'a', at }));
  assert.throws(() => presentInitialQuestion(state, { assessmentId: 'initial-1', questionId: next.id, at }));
  const shown = presentInitialQuestion(state, { assessmentId: 'initial-1', questionId: q.id, at });
  assert.throws(() => submitInitialAnswer(shown, { assessmentId: 'initial-1', questionId: q.id, at }));
  assert.throws(() => submitInitialAnswer(shown, { assessmentId: 'initial-1', questionId: q.id, choiceId: 'missing', at }));
  assert.equal(state.initialAssessments[0].answers.length, 0);
  assert.equal(state.exposures.length, 0);
});

test('렌더 반복·동일 제출·시작 연타는 노출과 답을 중복 생성하지 않는다', () => {
  const state = begin(); const q = initialQuestions()[0];
  assert.equal(begin(state), state);
  const shown = presentInitialQuestion(state, { assessmentId: 'initial-1', questionId: q.id, at });
  assert.equal(presentInitialQuestion(shown, { assessmentId: 'initial-1', questionId: q.id, at }), shown);
  const input = { assessmentId: 'initial-1', questionId: q.id, choiceId: 'b', at };
  const submitted = submitInitialAnswer(shown, input);
  assert.equal(submitInitialAnswer(submitted, input), submitted);
  assert.throws(() => submitInitialAnswer(submitted, { ...input, choiceId: 'a' }));
  assert.equal(submitted.exposures.length, 1);
});

test('완료 전에는 추천이 없고 완료 후 정답·오답·모름을 구분해 기초부터 확인을 추천한다', () => {
  assert.equal(initialAssessmentSummary(begin(), 'learner-1', { catalog }).recommendation, null);
  const state = complete(['abstained', 'incorrect']);
  const summary = initialAssessmentSummary(state, 'learner-1', { catalog });
  assert.deepEqual(summary.counts, { correct: 5, incorrect: 1, abstained: 1, pending: 0 });
  assert.equal(summary.status, 'completed');
  assert.equal(summary.recommendation.conceptId, 'c-int-addsub');
  assert.deepEqual(summary.recommendation.questionIds, ['q-eq-1', 'q-rat-1']);
  assert.equal(summary.entries[0].result, 'abstained');
  assert.equal(initialAssessmentSummary(state, 'other', { catalog }), null);
  assert.equal(initialAssessmentSummary(complete(), 'learner-1', { catalog }).recommendation.conceptId, 'c-eq-solve');
});

test('초기 응답은 학습 정답률·회기와 분리되고 실제 노출은 새 문제 판정에 반영된다', () => {
  const state = complete();
  const summary = buildLearnerSummary(state, 'learner-1', { catalog });
  assert.equal(summary.timeline.length, 0);
  assert.equal(summary.originalStats.attempted, 0);
  assert.equal(state.sessions.length, 0);
  assert.equal(state.logs.length, 0);
  assert.equal(classifyNovelty(state, 'learner-1', fingerprintQuestion(initialQuestions()[0])), 'already_seen');
});

test('중간 저장·재개를 보존하고 새 필드가 없는 기존 저장본도 허용하되 손상은 거부한다', () => {
  const state = answer(begin(), initialQuestions()[0], 'abstained');
  let raw = null;
  const storage = { getItem: () => raw, setItem: (_k, value) => { raw = value; } };
  assert.equal(saveState(storage, state, 0).ok, true);
  const loaded = loadState(storage);
  assert.deepEqual(loaded.state, state);
  assert.equal(initialAssessmentSummary(loaded.state, 'learner-1', { catalog }).counts.pending, 6);
  const legacy = createInitialState(); delete legacy.initialAssessments; delete legacy.startingPoints;
  assert.equal(validateState(legacy).ok, true);
  assert.equal(begin(legacy).initialAssessments.length, 1);
  const corrupted = structuredClone(state); corrupted.initialAssessments[0].answers[0].result = 'correct';
  assert.equal(validateState(corrupted).ok, false);
});

test('멘토는 추천을 바꿔 연결된 개념·문항을 지정하며 과제·시작점·경로를 한 번에 만든다', () => {
  const state = complete(['incorrect']);
  const next = planInitialLesson(state, plan({ conceptId: 'c-eq-transpose', questionId: 'q-eq-1' }), { catalog });
  assert.equal(next.startingPoints.length, 1);
  assert.equal(next.startingPoints[0].conceptId, 'c-eq-transpose');
  assert.equal(next.assignments.length, 1);
  assert.equal(next.paths[0].stage, 'original_attempt');
  assert.equal(next.paths[0].id, next.startingPoints[0].pathId);
  assert.equal(state.paths.length, 0);
  assert.equal(next.revision, state.revision + 1);
  assert.equal(planInitialLesson(next, plan({ conceptId: 'c-eq-transpose', questionId: 'q-eq-1' }), { catalog }), next);
});

test('미완료·다른 학생·잘못된 개념·문항 지정은 일부 과제도 남기지 않는다', () => {
  const state = complete();
  assert.throws(() => planInitialLesson(begin(), plan(), { catalog }));
  for (const change of [{ learnerId: 'other' }, { mentorId: 'other' }, { conceptId: 'missing' }, { questionId: 'missing' }, { conceptId: 'c-frac-reciprocal', questionId: 'q-eq-1' }]) {
    assert.throws(() => planInitialLesson(state, plan(change), { catalog }));
  }
  assert.equal(state.assignments.length, 0);
  assert.equal(state.startingPoints.length, 0);
});

test('store에서 새로고침 복원 후 이어 풀고 멘토 계획을 한 번만 발행한다', () => {
  const store = createStore({ initialState: createInitialState(), catalog, now: () => at });
  store.startInitialAssessment();
  const id = store.getState().initialAssessments[0].id;
  const q = initialQuestions()[0];
  store.presentInitialQuestion({ assessmentId: id, questionId: q.id });
  store.submitInitialAnswer({ assessmentId: id, questionId: q.id, abstained: true });
  const restored = createStore({ initialState: structuredClone(store.getState()), catalog, now: () => at });
  for (const question of initialQuestions().slice(1)) {
    restored.presentInitialQuestion({ assessmentId: id, questionId: question.id });
    restored.submitInitialAnswer({ assessmentId: id, questionId: question.id, abstained: true });
  }
  let emitted = 0; restored.subscribe(() => emitted++);
  const input = plan({ assessmentId: id });
  const pathId = restored.planInitialLesson(input);
  assert.equal(pathId, restored.getState().startingPoints[0].pathId);
  assert.equal(restored.planInitialLesson(input), pathId);
  assert.equal(emitted, 1);
  assert.equal(validateState(restored.getState()).ok, true);
});

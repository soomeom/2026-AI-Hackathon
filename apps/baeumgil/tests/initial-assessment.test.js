import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  startInitialAssessment, presentInitialQuestion, submitInitialAnswer, pauseInitialAssessment, resumeInitialAssessment,
  initialAssessmentSummary, planInitialLesson, initialQuestionOptions, currentInitialQuestionId,
} from '../public/src/learning/initial-assessment.js';
import { mergeCatalogParts } from '../public/src/content/catalog.js';
import { createInitialState, validateState } from '../public/src/domain/contracts.js';
import { normalizeChoiceValue, fingerprintQuestion, classifyNovelty } from '../public/src/learning/exposure.js';
import { buildLearnerSummary } from '../public/src/mentoring/summary.js';
import { saveState, loadState } from '../public/src/state/persistence.js';
import { createStore, createDemoState } from '../public/src/state/store.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../public/src/content/${name}.json`, import.meta.url), 'utf8'));
const catalog = mergeCatalogParts(['questions', 'concepts', 'routes', 'review', 'exam-bank'].map(read));
const ctx = { catalog };
const at = '2026-10-24T06:00:00.000Z';
const qOf = (id) => catalog.questions.find((q) => q.id === id);
const record = (state) => state.initialAssessments.at(-1);
const begin = (state) => startInitialAssessment(state ?? createInitialState(), { learnerId: 'learner-1', id: 'initial-1', at }, ctx);

// outcome: 'correct' | 'incorrect' | 'abstained' 또는 (문항) => outcome
function step(state, outcome, { helpUsed = false } = {}) {
  const id = currentInitialQuestionId(record(state));
  const q = qOf(id);
  const shown = presentInitialQuestion(state, { assessmentId: 'initial-1', questionId: id, at }, ctx);
  const want = typeof outcome === 'function' ? outcome(q) : outcome;
  const isAnswer = (c) => normalizeChoiceValue(c.value) === normalizeChoiceValue(q.answer);
  const choice = want === 'correct' ? q.choices.find(isAnswer) : q.choices.find((c) => !isAnswer(c));
  return submitInitialAnswer(shown, { assessmentId: 'initial-1', questionId: id, choiceId: want === 'abstained' ? null : choice.id, abstained: want === 'abstained', helpUsed, at }, ctx);
}
const finish = (outcome = 'correct', opts) => { let s = begin(); while (record(s).status === 'active') s = step(s, outcome, opts); return s; };
const plan = (overrides) => ({ assessmentId: 'initial-1', learnerId: 'learner-1', mentorId: 'mentor-1', reason: '첫 수업 계획', at, ...overrides });

test('고졸 핵심 문항부터 시작하고, 틀리면 연결된 중학교 선수 문항으로 바뀐다 (적응형)', () => {
  const state = begin();
  const first = qOf(currentInitialQuestionId(record(state)));
  assert.equal(first.level, 3);
  assert.equal(first.kind, 'official');
  const next = step(state, 'incorrect');
  assert.equal(currentInitialQuestionId(record(next)), first.fallback_question_id);
  assert.ok(qOf(currentInitialQuestionId(record(next))).level < 3);
});

test('모두 맞히면 6영역 × 2문항(12문항)으로 끝나고 모든 영역이 고졸 핵심 근거를 가진다', () => {
  const state = finish('correct');
  const summary = initialAssessmentSummary(state, 'learner-1', ctx);
  assert.equal(summary.status, 'completed');
  assert.equal(summary.counts.total, 12);
  assert.equal(summary.report.tier, '고졸 핵심 수준');
  assert.ok(summary.report.domains.every((d) => d.demonstrated === 3));
});

test('도움 받은 정답만 있으면 낮은 수준이 아니라 판단 보류로 표시한다', () => {
  const summary = initialAssessmentSummary(finish('correct', { helpUsed: true }), 'learner-1', ctx);
  assert.ok(summary.report.domains.every((d) => d.evidence === 'insufficient'));
  assert.match(summary.report.tier, /판단 보류/);
  assert.equal(summary.counts.independentCorrect, 0);
});

test('보충 학습에서 이미 본 기출은 진단에서 독립 수행 근거로 쓰지 않는다', () => {
  const root = qOf(catalog.diagnostic.domains[0].rootQuestionId);
  const seen = { ...createInitialState(), exposures: [{ id: 'e1', learnerId: 'learner-1', fingerprint: fingerprintQuestion(root), presentedAt: at }] };
  assert.ok(record(begin(seen)).diagnostic.seenBefore.includes(root.id));
});

test('순서·노출 없는 제출을 거부하고 렌더 반복·동일 제출은 중복을 만들지 않는다', () => {
  const state = begin();
  const id = currentInitialQuestionId(record(state));
  assert.throws(() => submitInitialAnswer(state, { assessmentId: 'initial-1', questionId: id, choiceId: 'a', at }, ctx));
  assert.throws(() => presentInitialQuestion(state, { assessmentId: 'initial-1', questionId: 'ged-middle-2025-1-math-q02', at }, ctx));
  assert.equal(begin(state), state);
  const shown = presentInitialQuestion(state, { assessmentId: 'initial-1', questionId: id, at }, ctx);
  assert.equal(presentInitialQuestion(shown, { assessmentId: 'initial-1', questionId: id, at }, ctx), shown);
  assert.throws(() => submitInitialAnswer(shown, { assessmentId: 'initial-1', questionId: id, at }, ctx));
  const input = { assessmentId: 'initial-1', questionId: id, choiceId: 'a', at };
  const submitted = submitInitialAnswer(shown, input, ctx);
  assert.equal(submitInitialAnswer(submitted, input, ctx), submitted);
  assert.throws(() => submitInitialAnswer(submitted, { ...input, choiceId: 'b' }, ctx));
  assert.equal(submitted.exposures.length, 1);
});

test('초기 응답은 학습 정답률·회기와 분리되고 노출은 새 문제 판정에 반영된다', () => {
  const state = finish('correct');
  const summary = buildLearnerSummary(state, 'learner-1', ctx);
  assert.equal(summary.timeline.length, 0);
  assert.equal(state.sessions.length, 0);
  const first = qOf(catalog.diagnostic.domains[0].rootQuestionId);
  assert.equal(classifyNovelty(state, 'learner-1', fingerprintQuestion(first)), 'already_seen');
});

test('중간에 멈추면 지금까지의 결과를 멘토에게 넘기고, 다시 이어서 풀 수 있다', () => {
  let state = step(step(begin(), 'correct'), 'incorrect');
  state = pauseInitialAssessment(state, { assessmentId: 'initial-1', at });
  const paused = initialAssessmentSummary(state, 'learner-1', ctx);
  assert.equal(paused.status, 'completed');
  assert.equal(paused.stopReason, 'user_paused');
  assert.ok(paused.recommendation);
  state = resumeInitialAssessment(state, { assessmentId: 'initial-1', at });
  assert.equal(record(state).status, 'active');
  assert.ok(currentInitialQuestionId(record(state)));
});

test('추천은 근거가 가장 약한 영역의 막힌 단원이며, 첫 문제 후보는 그 단원의 기출이다', () => {
  // 함수 영역만 틀리고 나머지는 맞힘
  const state = (() => { let s = begin(); while (record(s).status === 'active') s = step(s, (q) => (q.domain === 'functions' ? 'incorrect' : 'correct')); return s; })();
  const rec = initialAssessmentSummary(state, 'learner-1', ctx).recommendation;
  assert.equal(rec.domainId, 'functions');
  assert.match(rec.conceptId, /^ged-/);
  assert.ok(rec.questionIds.length > 0);
  const route = catalog.routes.find((r) => r.questionId === rec.questionIds[0]);
  assert.equal(`ged-${route.examUnit}`, rec.conceptId);
  // 진단에 쓴 문제는 후보 뒤쪽으로 미룬다
  const options = initialQuestionOptions(catalog, rec.conceptId);
  assert.notEqual(options[0].role, 'diagnostic');
});

test('멘토 확정은 과제·시작점·경로를 한 번에 만들고, 잘못된 지정은 아무것도 남기지 않는다', () => {
  const state = finish('correct');
  const conceptId = 'ged-h-function';
  const questionId = initialQuestionOptions(catalog, conceptId)[0].id;
  assert.throws(() => planInitialLesson(begin(), plan({ conceptId, questionId }), ctx));
  assert.throws(() => planInitialLesson(state, plan({ conceptId, questionId: 'q-eq-1' }), ctx));
  assert.equal(state.assignments.length, 0);
  const next = planInitialLesson(state, plan({ conceptId, questionId }), ctx);
  assert.equal(next.startingPoints.length, 1);
  assert.equal(next.paths[0].stage, 'original_attempt');
  assert.equal(next.paths[0].questionId, questionId);
  assert.equal(planInitialLesson(next, plan({ conceptId, questionId }), ctx), next);
});

test('저장·복원 후 이어 풀 수 있고, 이전 방식(7문항) 기록은 무시하며 손상은 거부한다', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const state = { ...step(begin(), 'correct'), revision: 1 };
  assert.equal(saveState(storage, state, 0).ok, true);
  const loaded = loadState(storage);
  assert.equal(loaded.status, 'ready');
  assert.equal(initialAssessmentSummary(loaded.state, 'learner-1', ctx).counts.total, 1);
  const legacy = { ...createInitialState(), initialAssessments: [{ id: 'old', learnerId: 'learner-1', version: 1, status: 'active', answers: [] }] };
  assert.equal(validateState(legacy).ok, true);
  assert.equal(initialAssessmentSummary(legacy, 'learner-1', ctx), null);
  const corrupted = structuredClone(state); corrupted.initialAssessments[0].diagnostic.attempts = 'x';
  assert.equal(validateState(corrupted).ok, false);
});

test('store 를 통해 시작·응답·멘토 계획이 이어진다', () => {
  const store = createStore({ initialState: createDemoState(), catalog, rng: () => 0.2 });
  store.startInitialAssessment();
  const assessmentId = store.getState().initialAssessments[0].id;
  while (store.getState().initialAssessments[0].status === 'active') {
    const id = store.getState().initialAssessments[0].diagnostic.currentId;
    store.presentInitialQuestion({ assessmentId, questionId: id });
    const q = qOf(id);
    store.submitInitialAnswer({ assessmentId, questionId: id, choiceId: q.choices.find((c) => c.value === q.answer).id });
  }
  const conceptId = 'ged-h-poly';
  const questionId = initialQuestionOptions(catalog, conceptId)[0].id;
  const pathId = store.planInitialLesson({ assessmentId, conceptId, questionId });
  assert.equal(store.getState().paths.find((p) => p.id === pathId).questionId, questionId);
});

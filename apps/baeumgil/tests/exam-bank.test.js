import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeCatalogParts, validateCatalog, validateExamRoutes, listAssignableQuestions } from '../public/src/content/catalog.js';
import { applyLearningCommand } from '../public/src/learning/engine.js';
import { normalizeChoiceValue } from '../public/src/learning/exposure.js';
import { createInitialState } from '../public/src/domain/contracts.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../public/src/content/${name}.json`, import.meta.url), 'utf8'));
const catalog = mergeCatalogParts(['questions', 'concepts', 'routes', 'review', 'exam-bank'].map(read));
const byId = new Map(catalog.questions.map((q) => [q.id, q]));

test('중졸·고졸 기출 360문항(확정 정답 회차)이 모두 배움길 원 문항으로 지정 가능하다', () => {
  assert.equal(validateCatalog(catalog).ok, true);
  assert.deepEqual(validateExamRoutes(catalog).errors, []);
  const exam = listAssignableQuestions(catalog).filter((q) => q.kind === 'official');
  assert.equal(exam.length, 360);
  assert.ok(exam.some((q) => q.id.includes('middle')) && exam.some((q) => q.id.includes('high')));
  // 가안 정답(2026년 2회)은 채점에 쓰지 않는다
  assert.equal(listAssignableQuestions(catalog).some((q) => q.id.includes('2026-2')), false);
  assert.equal(byId.get('ged-high-2026-2-math-q01').contentStatus, 'pending');
  // 이미지 문항은 원본 이미지·출처·정답 번호를 가진다
  const image = byId.get('ged-high-2022-1-math-q16');
  assert.match(image.image, /^\/assets\/exams\/ged-high-2022-1-math\/question-16\.png$/);
  assert.equal(image.reference.year, 2022);
  assert.deepEqual(image.choices.map((c) => c.value), ['1', '2', '3', '4']);
});

function walk(questionId, decide) {
  let seq = 0;
  let state = createInitialState({
    assignments: [{ id: 'assignment-1', learnerId: 'learner-1', mentorId: 'mentor-1', questionId }],
  });
  const send = (cmd) => {
    const r = applyLearningCommand(state, { id: `c${++seq}`, pathId: 'path-1', learnerId: 'learner-1', at: `2026-10-24T06:00:${String(seq % 60).padStart(2, '0')}Z`, ...cmd }, { catalog, rng: () => 0.3 });
    assert.notEqual(r.events[0]?.type, 'commandRejected', JSON.stringify(r.events[0]));
    state = r.state;
  };
  send({ type: 'START_PATH', assignmentId: 'assignment-1' });
  const seen = [];
  for (let guard = 0; guard < 40 && !['completed', 'needs_mentor'].includes(state.paths[0].stage); guard++) {
    const path = state.paths[0];
    const item = path.items.find((i) => !i.answered);
    if (item) {
      seen.push({ stage: path.stage, id: item.sourceQuestionId });
      send({ type: 'PRESENT_QUESTION', itemId: item.id });
      const correct = decide(path.stage);
      const choice = item.choices.find((c) => (normalizeChoiceValue(c.value) === normalizeChoiceValue(item.answer)) === correct);
      send({ type: 'SUBMIT_ANSWER', itemId: item.id, submissionId: `s${seq}`, choiceId: choice.id });
    } else send({ type: 'ADVANCE' });
  }
  return { state, seen };
}

test('고졸 이미지 기출 오답 → 중졸 기출로 개념 확인·기초 연습 → 다른 회차 같은 단원 기출로 유사·새 문제', () => {
  const id = 'ged-high-2022-1-math-q16';
  const { state, seen } = walk(id, (stage) => stage !== 'original_attempt' && stage !== 'concept_check');
  const route = catalog.routes.find((r) => r.questionId === id);
  assert.equal(state.paths[0].stage, 'completed');
  const ids = (stage) => seen.filter((s) => s.stage === stage).map((s) => s.id);
  assert.deepEqual(ids('original_attempt'), [id]);
  assert.ok(ids('concept_check').every((q) => q.includes('middle')));
  assert.equal(ids('foundation_practice').length, 3);
  assert.ok(ids('foundation_practice').every((q) => route.foundationQuestionIds.includes(q)));
  assert.equal(ids('similar_practice').length, 2);
  assert.ok(ids('similar_practice').every((q) => q.includes('high') && q !== id));
  assert.deepEqual(ids('original_retry'), [id]);
  // 새 문제 확인은 앞서 본 적 없는 다른 기출
  const transfer = ids('transfer_check')[0];
  assert.ok(route.transferQuestionIds.includes(transfer));
  assert.ok(!seen.slice(0, -1).some((s) => s.id === transfer));
  assert.equal(state.attempts.at(-1).noveltyAtPresentation, 'first_seen');
  // 화면 표시용 원본 이미지·출처가 문항 인스턴스에 남는다
  const first = state.paths[0].pastItems[0];
  assert.equal(first.reference.qualification, '고졸');
  assert.match(first.image, /question-16\.png$/);
});

test('합성함수 보충 경로도 교정한 함숫값 대입 문항으로 개념을 확인한다', () => {
  const id = 'ged-high-2025-1-math-q16';
  const { state, seen } = walk(id, (stage) => stage !== 'original_attempt');
  assert.equal(state.paths[0].stage, 'completed');
  assert.equal(seen.find((s) => s.stage === 'concept_check').id, 'roadmap-function-value');
  // 개념 확인을 모두 맞혀 기초 연습 없이 유사 문제로 간다
  assert.equal(seen.some((s) => s.stage === 'foundation_practice'), false);
});

test('중졸 기출도 원 문항으로 끝까지 진행된다', () => {
  const { state } = walk('ged-middle-2023-1-math-q11', () => false);
  assert.ok(['completed', 'needs_mentor'].includes(state.paths[0].stage));
  assert.ok(state.attempts.length >= 6);
});

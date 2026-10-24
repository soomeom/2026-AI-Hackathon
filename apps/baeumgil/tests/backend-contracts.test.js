import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, validateState, validateAIInput } from '../public/src/domain/contracts.js';
import { makeCatalog, makeState } from './fixtures.js';
import { applyLearningCommand } from '../public/src/learning/engine.js';
import { buildAIInput } from '../public/src/ai/contracts.js';

test('초기 상태는 엔진과 AI에 필요한 공통 배열·버전·가명 프로필을 제공한다', () => {
  const state = createInitialState();
  assert.equal(validateState(state).ok, true);
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.revision, 0);
  assert.equal(state.historyIntegrity, 'complete');
  assert.equal(state.learners[0].id, 'learner-1');
  assert.equal(state.mentors[0].id, 'mentor-1');
  state.attempts.push({ id: 'one' });
  assert.equal(createInitialState().attempts.length, 0);
});

test('기존 엔진 상태를 보존해 공통 상태로 확장하고 START_PATH 결과도 저장 가능하다', () => {
  const state = createInitialState(makeState());
  const result = applyLearningCommand(state, { type: 'START_PATH', learnerId: 'learner-1', pathId: 'path-1' }, { catalog: makeCatalog() });
  assert.equal(result.state.paths[0].stage, 'original_attempt');
  assert.equal(validateState(result.state).ok, true);
  assert.equal(state.paths[0].routeId, undefined);
});

test('손상된 배열·중복 ID·알 수 없는 버전·음수 revision을 거부한다', () => {
  for (const change of [{ schemaVersion: 2 }, { attempts: {} }, { revision: -1 }, { historyIntegrity: 'guessed' }, { learners: [{ id: 'x' }, { id: 'x' }] }]) {
    assert.equal(validateState({ ...createInitialState(), ...change }).ok, false);
  }
  assert.equal(validateState(null).ok, false);
});

test('공동 모듈이 만든 AI 입력은 허용하고 누락·잘못된 ID·제약 완화 입력을 거부한다', () => {
  const input = buildAIInput(createInitialState(), { learnerId: 'learner-1', kind: 'lesson_plan', catalog: makeCatalog(), requestId: 'request-1' });
  assert.equal(validateAIInput(input).ok, true);
  assert.equal(validateAIInput({ ...input, kind: 'score_student' }).ok, false);
  assert.equal(validateAIInput({ ...input, allowedEvidenceIds: [null] }).ok, false);
  assert.equal(validateAIInput({ ...input, constraints: { language: 'ko', forbidAffectiveStatements: false } }).ok, false);
  assert.equal(validateAIInput({ ...input, facts: null }).ok, false);
});

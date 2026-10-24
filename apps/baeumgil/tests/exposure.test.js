import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintQuestion, classifyNovelty, normalizeChoiceValue } from '../public/src/learning/exposure.js';
import { applyLearningCommand } from '../public/src/learning/engine.js';
import { makeCatalog, makeQuestion, makeState, command } from './fixtures.js';

const catalog = makeCatalog();
const rngOf = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const apply = (state, cmd, rng = rngOf(1)) => applyLearningCommand(state, cmd, { catalog, rng });

test('선택지 값은 기약분수로 정규화된다', () => {
  assert.equal(normalizeChoiceValue('2/4'), '1/2');
  assert.equal(normalizeChoiceValue('-3/6'), '-1/2');
  assert.equal(normalizeChoiceValue('3/-6'), '-1/2');
  assert.equal(normalizeChoiceValue('4/2'), '2');
  assert.equal(normalizeChoiceValue('0.5'), '1/2');
  assert.equal(normalizeChoiceValue('(−1/2)'), '-1/2');
  assert.equal(normalizeChoiceValue(' 5 '), '5');
  assert.equal(normalizeChoiceValue('-3x + 6'), '-3x+6');
});

test('sameQuestionAcrossIdsIsNotNew', () => {
  const original = makeQuestion();
  const disguised = {
    ...original,
    id: 'q-copy-99',
    prompt: '방정식  2(x − 3) = −x + 9  의 해는?', // 유니코드 마이너스와 공백만 다름
    choices: [
      { id: 'w', value: '15' },
      { id: 'x', value: ' 5' },
      { id: 'y', value: '1' },
      { id: 'z', value: '8/2' }, // 4 와 같은 값
    ],
  };
  assert.equal(fingerprintQuestion(disguised), fingerprintQuestion(original));

  const state = makeState({ exposures: [{ learnerId: 'learner-1', fingerprint: fingerprintQuestion(original) }] });
  assert.equal(classifyNovelty(state, 'learner-1', fingerprintQuestion(disguised)), 'already_seen');
  // 다른 학생에게는 새 문항
  assert.equal(classifyNovelty(state, 'learner-2', fingerprintQuestion(disguised)), 'first_seen');
  // 본문이 다르면 다른 문항
  const changed = { ...original, prompt: '방정식 2(x - 3) = -x + 12 의 해는?' };
  assert.notEqual(fingerprintQuestion(changed), fingerprintQuestion(original));
});

test('unknownHistoryIsNotFirstSeen', () => {
  const state = makeState({ historyIntegrity: 'unknown' });
  assert.equal(classifyNovelty(state, 'learner-1', fingerprintQuestion(makeQuestion())), 'unknown');

  // 엔진: 노출 판정이 unknown 으로 기록되고, 새 적용 문제를 확보할 수 없어 not_measured → needs_mentor
  let s = apply(state, command('START_PATH')).state;
  const item = s.paths[0].items[0];
  s = apply(s, command('PRESENT_QUESTION', { itemId: item.id })).state;
  assert.equal(s.exposures[0].noveltyAtPresentation, 'unknown');
  const correct = item.choices.find((c) => c.value === item.answer);
  s = apply(s, command('SUBMIT_ANSWER', { submissionId: 'sub-1', itemId: item.id, choiceId: correct.id })).state;
  s = apply(s, command('ADVANCE')).state;
  assert.equal(s.paths[0].stage, 'needs_mentor');
  assert.equal(s.paths[0].transferStatus, 'not_measured');
});

test('newExposureBeforeSubmissionIsPreserved', () => {
  let s = apply(makeState(), command('START_PATH')).state;
  const item = s.paths[0].items[0];
  s = apply(s, command('PRESENT_QUESTION', { itemId: item.id, at: 1000 })).state;

  // 판정을 먼저 하고 저장하므로, 저장 후에도 기록된 판정은 first_seen 이다
  assert.equal(s.exposures.length, 1);
  assert.equal(s.exposures[0].noveltyAtPresentation, 'first_seen');
  assert.equal(s.exposures[0].fingerprint, fingerprintQuestion(item));
  assert.equal(s.attempts.length, 0);

  // 제출하지 않고 중단해도 노출은 남는다
  s = apply(s, command('PAUSE', { at: 2000 })).state;
  s = apply(s, command('RESUME', { at: 3000 })).state;
  assert.equal(s.exposures.length, 1);
  // 같은 문항을 다시 띄워도 노출이 중복 저장되지 않는다
  s = apply(s, command('PRESENT_QUESTION', { itemId: item.id })).state;
  assert.equal(s.exposures.length, 1);
  assert.equal(classifyNovelty(s, 'learner-1', fingerprintQuestion(item)), 'already_seen');

  // 같은 학생의 다른 경로에서 같은 문항을 보면 already_seen
  s.assignments.push({ id: 'assignment-2', learnerId: 'learner-1', mentorId: 'mentor-1', questionId: 'q-eq-1' });
  s.paths.push({ id: 'path-2', assignmentId: 'assignment-2' });
  s = apply(s, command('START_PATH', { pathId: 'path-2' })).state;
  const item2 = s.paths[1].items[0];
  s = apply(s, command('PRESENT_QUESTION', { pathId: 'path-2', itemId: item2.id })).state;
  assert.equal(s.exposures[1].noveltyAtPresentation, 'already_seen');
});

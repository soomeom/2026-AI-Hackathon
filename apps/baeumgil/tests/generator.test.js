import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePractice, validateGeneratedItem, MAX_GENERATION_ATTEMPTS } from '../public/src/learning/generator.js';
import { fingerprintQuestion, normalizeChoiceValue } from '../public/src/learning/exposure.js';
import { makeCatalog, makeState } from './fixtures.js';

const catalog = makeCatalog();
const routeOf = (questionId) => catalog.routes.find((r) => r.questionId === questionId);
const rngOf = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 프롬프트를 JS 식으로 바꿔 정답을 독립적으로 검산한다
const toNumber = (v) => {
  const [n, d = '1'] = normalizeChoiceValue(v).split('/');
  return Number(n) / Number(d);
};
const evalExpr = (expr, x = 0) => {
  const js = expr
    .replace(/÷/g, '/').replace(/×/g, '*')
    .replace(/(\d)\s*\(/g, '$1*(').replace(/(\d)\s*x/g, '$1*x')
    .replace(/x/g, `(${x})`);
  return Function(`return (${js});`)();
};
function checkAnswer(item) {
  const p = item.prompt;
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${p} → ${item.answer}`);
  if (p.startsWith('방정식')) {
    const [lhs, rhs] = p.replace('방정식', '').replace('의 해는?', '').split('=');
    close(evalExpr(lhs, toNumber(item.answer)), evalExpr(rhs, toNumber(item.answer)));
  } else if (p.includes('일 때, x 의 값은?')) {
    const [lhs, rhs] = p.replace('일 때, x 의 값은?', '').split('=');
    close(evalExpr(lhs, toNumber(item.answer)), evalExpr(rhs, toNumber(item.answer)));
  } else if (p.includes('를 바르게 전개한 것은?')) {
    const expr = p.replace('를 바르게 전개한 것은?', '');
    close(evalExpr(expr, 1.7), evalExpr(item.answer, 1.7));
  } else {
    close(evalExpr(p.replace('의 값은?', '')), toNumber(item.answer));
  }
}

const STAGES = { foundation_practice: 3, similar_practice: 2, transfer_check: 1 };

test('모든 틀은 여러 시드에서 유효하고 정답이 맞는 문항을 만든다', () => {
  for (const questionId of ['q-eq-1', 'q-rat-1']) {
    for (const [stage, count] of Object.entries(STAGES)) {
      for (let seed = 1; seed <= 150; seed++) {
        const result = generatePractice({ catalog, route: routeOf(questionId), stage, learnerId: 'learner-1', state: makeState(), rng: rngOf(seed) });
        assert.equal(result.status, 'ok');
        assert.equal(result.items.length, count);
        assert.equal(new Set(result.items.map((i) => i.fingerprint)).size, count, '묶음 안 중복 없음');
        for (const item of result.items) {
          assert.equal(item.stage, stage);
          assert.equal(validateGeneratedItem(item).ok, true, item.prompt);
          assert.deepEqual(item.choices.map((c) => c.id), ['a', 'b', 'c', 'd']);
          assert.equal(item.fingerprint, fingerprintQuestion(item));
          assert.doesNotMatch(item.prompt, /\/\s*\(?-?0(?![\d.])/);
          checkAnswer(item);
        }
      }
    }
  }
});

test('같은 시드는 같은 문항을 만든다', () => {
  const run = () => generatePractice({ catalog, route: routeOf('q-rat-1'), stage: 'foundation_practice', learnerId: 'learner-1', state: makeState(), rng: rngOf(7) });
  assert.deepEqual(run(), run());
});

test('기초 연습은 우선 연습 개념을 먼저 낸다', () => {
  const result = generatePractice({
    catalog, route: routeOf('q-eq-1'), stage: 'foundation_practice', learnerId: 'learner-1',
    state: makeState(), rng: rngOf(3), focusConceptId: 'c-eq-transpose',
  });
  assert.deepEqual(result.items.map((i) => i.conceptIds[0]), ['c-eq-transpose', 'c-distribute-sign', 'c-eq-transpose']);
});

test('generatorUsesAtMostTwentyAttempts', () => {
  assert.equal(MAX_GENERATION_ATTEMPTS, 20);
  let calls = 0;
  const alwaysInvalid = { 'tpl-eq-transfer': { 'c-eq-solve': () => { calls++; return { prompt: 'x = 1', choices: [{ value: '1' }], answer: '1', conceptIds: ['c-eq-solve'] }; } } };

  const result = generatePractice({ catalog, route: routeOf('q-eq-1'), stage: 'transfer_check', learnerId: 'learner-1', state: makeState(), rng: rngOf(1), templates: alwaysInvalid });
  assert.equal(calls, 20);
  assert.equal(result.attempts, 20);
  assert.equal(result.status, 'ok');
  assert.equal(result.source, 'spare');
  assert.equal(result.items[0].sourceQuestionId, 'q-eq-spare-1');

  // 예비 문항도 이미 본 문항이면 새 적용 문제를 확보할 수 없다
  calls = 0;
  const spare = catalog.questions.find((q) => q.id === 'q-eq-spare-1');
  const seen = makeState({ exposures: [{ learnerId: 'learner-1', fingerprint: fingerprintQuestion(spare) }] });
  const unavailable = generatePractice({ catalog, route: routeOf('q-eq-1'), stage: 'transfer_check', learnerId: 'learner-1', state: seen, rng: rngOf(1), templates: alwaysInvalid });
  assert.equal(calls, 20);
  assert.deepEqual(unavailable, { status: 'unavailable', reason: 'noFirstSeenItem', attempts: 20 });
});

test('새 적용 문제는 이미 본 문항을 내지 않는다', () => {
  const first = generatePractice({ catalog, route: routeOf('q-rat-1'), stage: 'transfer_check', learnerId: 'learner-1', state: makeState(), rng: rngOf(11) });
  const seen = makeState({ exposures: [{ learnerId: 'learner-1', fingerprint: first.items[0].fingerprint }] });
  const second = generatePractice({ catalog, route: routeOf('q-rat-1'), stage: 'transfer_check', learnerId: 'learner-1', state: seen, rng: rngOf(11) });
  assert.equal(second.status, 'ok');
  assert.notEqual(second.items[0].fingerprint, first.items[0].fingerprint);
});

test('equivalentFractionChoicesAreRejected', () => {
  const base = { prompt: '(1/4) ÷ (1/2) 의 값은?', answer: '1/2', conceptIds: ['c-frac-reciprocal'] };
  const equivalent = validateGeneratedItem({ ...base, choices: [{ value: '1/2' }, { value: '2/4' }, { value: '3' }, { value: '4' }] });
  assert.deepEqual(equivalent, { ok: false, reason: 'duplicateChoice' });

  assert.deepEqual(validateGeneratedItem({ ...base, choices: [{ value: '1/8' }, { value: '2' }, { value: '3' }, { value: '4' }] }), { ok: false, reason: 'answerMissing' });
  assert.deepEqual(validateGeneratedItem({ ...base, choices: [{ value: '1/2' }, { value: '1/0' }, { value: '3' }, { value: '4' }] }), { ok: false, reason: 'zeroDenominator' });
  assert.deepEqual(validateGeneratedItem({ ...base, prompt: '(1/4) ÷ (0) 의 값은?', choices: [{ value: '1/2' }, { value: '2' }, { value: '3' }, { value: '4' }] }), { ok: false, reason: 'zeroDenominator' });
  assert.deepEqual(validateGeneratedItem({ ...base, choices: [{ value: '1/2' }, { value: '2' }, { value: '3' }, { value: '4' }] }), { ok: true });

  // 동치 선택지만 만드는 틀은 20회 후 예비 문항으로 대체된다
  const equivalentOnly = { 'tpl-rat-similar': { 'c-rat-calc': () => ({ ...base, choices: [{ value: '1/2' }, { value: '2/4' }, { value: '3' }, { value: '4' }] }) } };
  const result = generatePractice({ catalog, route: routeOf('q-rat-1'), stage: 'similar_practice', learnerId: 'learner-1', state: makeState(), rng: rngOf(1), templates: equivalentOnly });
  // 2문항 중 첫 칸만 예비 문항으로 채울 수 있고, 둘째 칸은 같은 예비 문항을 다시 쓸 수 없다
  assert.deepEqual(result, { status: 'unavailable', reason: 'generationFailed', attempts: 40 });
});

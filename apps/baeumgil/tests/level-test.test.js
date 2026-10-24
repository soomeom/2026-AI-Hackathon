import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { normalizeChoiceValue } from '../public/src/learning/exposure.js';
import { ROADMAP_AI_KIND, buildRoadmapAIInput, validateRoadmapAIOutput } from '../public/src/roadmap/ai-route.js';
import { findRouteOrderViolations, getNodeLinks, validateRoadmapGraph } from '../public/src/roadmap/graph.js';
import {
  finishLevelTest,
  getLevelTestQuestion,
  remainingSeconds,
  startLevelTest,
  submitLevelTestAnswer,
  summarizeLevelTest,
} from '../public/src/roadmap/level-test.js';

const readJson = (name) => JSON.parse(readFileSync(new URL(`../public/src/roadmap/${name}`, import.meta.url), 'utf8'));
const roadmap = readJson('roadmap.json');
const levelTests = readJson('level-tests.json');
const question = (id) => getLevelTestQuestion(levelTests, id);

// ---- 검산 도우미 ----
const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const fraction = (n, d) => `${n / gcd(n, d)}/${d / gcd(n, d)}`;
// 다항식 곱: 계수 배열(낮은 차수부터)
const multiply = (p, q) => p.reduce((out, a, i) => (q.forEach((b, j) => { out[i + j] = (out[i + j] ?? 0) + a * b; }), out), []);
const evaluate = (coefficients, x) => coefficients.reduce((sum, c, i) => sum + c * x ** i, 0);
const integersIn = (predicate) => Array.from({ length: 41 }, (_, i) => i - 20).filter(predicate);
const sameList = (p, q) => JSON.stringify(p) === JSON.stringify(q);
const superscript = (n) => String(n).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
// 부등식 선택지: 여러 x에서 원래 부등식과 참·거짓이 같은지
const sameSolutions = (inequality, choices) =>
  Object.fromEntries(Object.entries(choices).map(([value, holds]) => [value, (x) => holds(x) === inequality(x)]));
const X_SAMPLES = Array.from({ length: 41 }, (_, i) => [i / 2 - 10]);

// 문항별로 정답을 다시 계산한다. 문장·식으로 된 선택지는 TRUTH_CHECKS에서 각 선택지가 참인지 검사한다.
const RECOMPUTED = {
  'lt10-poly-ops': () => String(integersIn((a) => 2 + a === 0)[0] + (5 + 1)), // x² 계수 2 + a = 0, b = 5 + 1
  'lt10-factor-cubic': () => String(integersIn((a) => sameList(multiply([3, 1], [9, a, 1]), [27, 0, 0, 1]))[0]),
  'lt10-discriminant': () => String(Math.min(...integersIn((a) => a > 0 && a * a - 4 * 9 > 0))),
  'lt10-vieta': () => String(Math.round((3 + Math.SQRT2) * (3 - Math.SQRT2))),
  'lt10-quad-min': () => String(Math.min(...Array.from({ length: 9 }, (_, i) => -1 + i / 2).map((x) => (x - 2) ** 2 + 1))),
  'lt10-cubic-eq': () => String(integersIn((a) => evaluate([a, -3, 0, 1], 2) === 0)[0]),
  'lt10-distance': () => String(Math.hypot(8 - 2, 9 - 1)),
  'lt30-arith': () => String(6 + 4 * 3),
  'lt30-fraction': () => fraction(1 * 6 + 1 * 3, 3 * 6),
  'lt30-integer': () => String(-3 * 4),
  'lt30-power': () => String(3 ** 3),
  'lt30-expr-value': () => String(3 * 4 + 2),
  'lt30-linear-expr': () => String(3 * (0 + 2) - (0 - 4)),
  'lt30-linear-eq': () => String(integersIn((x) => 4 * x - 7 === 2 + x)[0]),
  'lt30-linear-eq-app': () => String(integersIn((x) => 2 * (8 + x) === 30)[0]),
  'lt30-system': () => {
    const [[x, y]] = integersIn(() => true).flatMap((x) => integersIn((y) => x - y === 2 && 2 * x - y === 7).map((y) => [x, y]));
    return `x = ${x}, y = ${y}`;
  },
  'lt30-system-app': () => String([0, 1, 2, 3, 4, 5, 6].find((y) => 300 * (6 - y) + 500 * y === 2200)),
  'lt30-quad-eq': () => String(integersIn((x) => x * x - 5 * x + 6 === 0 && x !== 2)[0]),
  'lt30-quad-formula': () => String((16 + 4) / 4), // x = 2 ± √(D)/2 = 2 ± √(D/4)
  'lt30-discriminant': () => String(integersIn((a) => 16 - 4 * a === 0)[0]),
  'lt30-vieta': () => String(integersIn((x) => x * x - 3 * x - 10 === 0).reduce((a, b) => a + b, 0)),
  'lt30-proportion': () => String((8 / 2) * 5),
  'lt30-linear-fn': () => String(evaluate([-5, 1], 0)),
  'lt30-quad-fn-eq': () => String(Math.max(...integersIn((x) => x * x - 2 * x - 8 === 0))),
  'lt30-exponent': () => `a${superscript(3 + 6 - 4)}`,
  'lt30-sqrt': () => String(Math.sqrt((-7) ** 2)),
  'lt30-mult-formula': () => String(multiply([3, 1], [4, 1])[1]),
  'lt30-radical': () => `${4 + 2}√3`,
};

const quadGraph = (x) => (x - 2) ** 2 - 3;
const quadGraphVertexX = integersIn(() => true).reduce((best, x) => (quadGraph(x) < quadGraph(best) ? x : best));

const TRUTH_CHECKS = {
  'lt10-quad-ineq': {
    ...sameSolutions((x) => (x - 1) * (x - 5) <= 0, {
      'x ≤ 1': (x) => x <= 1,
      'x ≥ 5': (x) => x >= 5,
      '1 ≤ x ≤ 5': (x) => x >= 1 && x <= 5,
      'x ≤ 1 또는 x ≥ 5': (x) => x <= 1 || x >= 5,
    }),
    samples: X_SAMPLES,
  },
  'lt30-linear-ineq': {
    ...sameSolutions((x) => 15 * x >= 45, {
      'x > 3': (x) => x > 3,
      'x ≥ 3': (x) => x >= 3,
      'x ≤ 3': (x) => x <= 3,
      'x < 3': (x) => x < 3,
    }),
    samples: X_SAMPLES,
  },
  // 장미꽃 a송이의 가격은 3000 × a
  'lt30-letters': {
    '(3000 + a)원': (a) => 3000 + a === 3000 * a,
    '(3000 − a)원': (a) => 3000 - a === 3000 * a,
    '(3000 × a)원': (a) => 3000 * a === 3000 * a,
    '(3000 ÷ a)원': (a) => 3000 / a === 3000 * a,
    samples: [[1], [2], [5]],
  },
  'lt30-quad-graph': {
    '위로 볼록이다.': () => quadGraph(quadGraphVertexX + 1) < quadGraph(quadGraphVertexX),
    '점 (0, 3)을 지난다.': () => quadGraph(0) === 3,
    '직선 x = −2를 축으로 한다.': () => quadGraph(-2 - 1) === quadGraph(-2 + 1),
    '꼭짓점의 좌표는 (2, −3)이다.': () => quadGraphVertexX === 2 && quadGraph(2) === -3,
    samples: [[]],
  },
  // 전개해서 x² + 7x + 12가 되는 것
  'lt30-factor': {
    '(x + 3)(x + 4)': () => sameList(multiply([3, 1], [4, 1]), [12, 7, 1]),
    '(x + 3)(x + 5)': () => sameList(multiply([3, 1], [5, 1]), [12, 7, 1]),
    '(x + 4)²': () => sameList(multiply([4, 1], [4, 1]), [12, 7, 1]),
    '(x + 5)(x + 6)': () => sameList(multiply([5, 1], [6, 1]), [12, 7, 1]),
    samples: [[]],
  },
  // a = b인 여러 값에서 늘 참인 선택지만 정답
  'lt30-eq-property': {
    'a + 3 = b + 3': (a, b) => a + 3 === b + 3,
    'a − 3 = b + 3': (a, b) => a - 3 === b + 3,
    '3a = b + 3': (a, b) => 3 * a === b + 3,
    'a ÷ 3 = b ÷ 2': (a, b) => a / 3 === b / 2,
    samples: [[1, 1], [-2, -2], [5, 5]],
  },
  // a < b인 여러 값에서 늘 참인 선택지만 정답
  'lt30-ineq-property': {
    'a + 2 < b + 2': (a, b) => a + 2 < b + 2,
    '−a < −b': (a, b) => -a < -b,
    '2a > 2b': (a, b) => 2 * a > 2 * b,
    'a − 3 > b − 3': (a, b) => a - 3 > b - 3,
    samples: [[1, 2], [-5, -1], [-2, 3]],
  },
};

test('로드맵: 28개 개념, 5개 묶음, 연결에 오류가 없다', () => {
  assert.equal(validateRoadmapGraph(roadmap).ok, true);
  assert.equal(roadmap.nodes.length, 28);
  const count = (cluster) => roadmap.nodes.filter((node) => node.cluster === cluster).length;
  assert.deepEqual(
    roadmap.clusters.map((cluster) => [cluster.name, count(cluster.id)]),
    [['기초 연산', 4], ['문자와 식', 3], ['방정식·부등식', 11], ['함수', 5], ['다항식·제곱근', 5]],
  );
  assert.ok(roadmap.nodes.every((node) => ['초등', '중1', '중2', '중3', '고1'].includes(node.grade)));
  // 노드를 누르면 선수(먼저 알아야 할 개념)와 후위(이어지는 개념)가 나온다
  const formula = getNodeLinks(roadmap, 'rm-quad-formula');
  assert.deepEqual(formula.prerequisites.map((node) => node.name), ['이차방정식 (인수분해로 풀기)', '근호를 포함한 식의 계산']);
  assert.deepEqual(formula.successors.map((node) => node.name), ['판별식', '근과 계수의 관계']);
});

test('레벨테스트 구성: 10분 8문항, 30분 28문항(로드맵 개념마다 1문항)', () => {
  const quick = levelTests.tests.find((t) => t.id === 'quick-10');
  const full = levelTests.tests.find((t) => t.id === 'full-30');
  assert.equal(quick.questionIds.length, 8);
  assert.equal(quick.timeLimitMinutes, 10);
  assert.equal(full.questionIds.length, 28);
  assert.equal(full.timeLimitMinutes, 30);
  const covered = full.questionIds.map((id) => question(id).conceptIds[0]).sort();
  assert.deepEqual(covered, roadmap.nodes.map((node) => node.id).sort());
  const nodeIds = new Set(roadmap.nodes.map((node) => node.id));
  for (const id of quick.questionIds) {
    const q = question(id);
    const links = [...q.conceptIds.filter((c) => nodeIds.has(c)), ...q.relatedNodeIds];
    assert.ok(links.length > 0 && links.every((nodeId) => nodeIds.has(nodeId)), `${id}가 로드맵에 연결되지 않음`);
  }
});

test('모든 문항: 선택지 4개가 서로 다르고 정답이 선택지 안에 있다', () => {
  const ids = levelTests.questions.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const q of levelTests.questions) {
    const values = q.choices.map((choice) => normalizeChoiceValue(choice.value));
    assert.equal(q.choices.length, 4, q.id);
    assert.equal(new Set(values).size, 4, `${q.id} 선택지 중복`);
    assert.equal(values.filter((value) => value === normalizeChoiceValue(q.answer)).length, 1, `${q.id} 정답이 선택지에 하나`);
  }
});

test('모든 문항의 정답을 다시 계산해 확인한다', () => {
  for (const q of levelTests.questions) {
    if (RECOMPUTED[q.id]) {
      assert.equal(normalizeChoiceValue(RECOMPUTED[q.id]()), normalizeChoiceValue(q.answer), `${q.id} 정답 불일치`);
    } else if (TRUTH_CHECKS[q.id]) {
      const { samples, ...checks } = TRUTH_CHECKS[q.id];
      const alwaysTrue = q.choices.map((c) => c.value).filter((value) => samples.every((sample) => checks[value](...sample)));
      assert.deepEqual(alwaysTrue, [q.answer], `${q.id} 늘 참인 선택지`);
    }
  }
  // 사분면 문항은 직접 확인
  assert.equal(question('lt30-coordinate').answer, '제2사분면'); // (−2, 5): x < 0, y > 0
  const checked = Object.keys(RECOMPUTED).length + Object.keys(TRUTH_CHECKS).length + 1;
  assert.equal(checked, levelTests.questions.length);
});

test('기출 변형 문항은 실제 기출 원문을 가리키고, 자체 제작 문항은 이유를 적는다', () => {
  const drafts = JSON.parse(readFileSync(new URL('../data/exam-sources/question-drafts.json', import.meta.url), 'utf8')).questions;
  const draftIds = new Set(drafts.map((draft) => draft.id));
  for (const q of levelTests.questions) {
    const ref = q.reference;
    assert.equal(q.kind, 'authored', `${q.id}: 숫자를 바꿨으므로 official이 아님`);
    if (ref.basis === 'official_variant') {
      assert.ok(draftIds.has(ref.derivedFrom), `${q.id}의 원문 ${ref.derivedFrom}이 기출 자료에 없음`);
      const level = ref.qualification === '고졸' ? 'high' : 'middle';
      const questionNumber = String(ref.questionNumber).padStart(2, '0');
      assert.equal(ref.derivedFrom, `ged-${level}-${ref.year}-${ref.session}-math-q${questionNumber}`, q.id);
      assert.equal(ref.usageReviewStatus, 'unverified', q.id);
    } else {
      assert.equal(ref.basis, 'authored', q.id);
      assert.ok(['no_official', 'figure_required', 'concept_mismatch'].includes(ref.reason), q.id);
      assert.ok(ref.note, `${q.id}: 기출을 쓰지 않은 이유`);
      if (ref.candidate) {
        assert.ok(draftIds.has(ref.candidate), `${q.id}의 후보 ${ref.candidate}이 기출 자료에 없음`);
      }
    }
  }
});

function takeTest(testId, wrongIds = []) {
  const at = () => new Date('2026-10-24T09:00:00.000Z');
  let session = startLevelTest(levelTests, testId, { now: at });
  let n = 0;
  while (session.status === 'active') {
    const q = question(session.currentId);
    const correct = !wrongIds.includes(q.id);
    const choice = q.choices.find((c) => (normalizeChoiceValue(c.value) === normalizeChoiceValue(q.answer)) === correct);
    session = submitLevelTestAnswer(session, { id: `lt${n++}`, questionId: q.id, choiceId: choice.id }, levelTests, { now: at });
  }
  return session;
}

test('진행: 순서대로 내고, 이미 낸 답은 다시 저장하지 않고, 지난 문항 답은 거부한다', () => {
  let session = startLevelTest(levelTests, 'quick-10');
  const first = question(session.currentId);
  session = submitLevelTestAnswer(session, { id: 's1', questionId: first.id, choiceId: 'a' }, levelTests);
  assert.equal(submitLevelTestAnswer(session, { id: 's1', questionId: first.id, choiceId: 'b' }, levelTests), session);
  assert.throws(() => submitLevelTestAnswer(session, { id: 's2', questionId: first.id, choiceId: 'a' }, levelTests), /staleQuestion/);
  assert.throws(() => submitLevelTestAnswer(session, { id: 's3', questionId: session.currentId }, levelTests), { code: 'emptySubmission' });
  assert.equal(session.attempts.length, 1);
});

test('시간이 끝나면 닫히고, 답하지 않은 문항은 미응답으로 남는다', () => {
  const start = new Date('2026-10-24T09:00:00.000Z');
  let session = startLevelTest(levelTests, 'quick-10', { now: () => start });
  assert.equal(remainingSeconds(session, { now: () => new Date(start.getTime() + 4 * 60_000) }), 360);
  const q = question(session.currentId);
  session = submitLevelTestAnswer(session, { id: 's1', questionId: q.id, choiceId: q.choices[0].id }, levelTests);
  session = finishLevelTest(session, { reason: 'time_up' });
  assert.equal(session.status, 'completed');
  const summary = summarizeLevelTest(session, levelTests, roadmap);
  assert.equal(summary.report.unanswered, 7);
  assert.match(summary.report.tier, /7문항 미응답/);
});

test('30분 결과: 제곱근·근호 계산·근의 공식을 틀리면 가장 아래인 제곱근부터 시작한다', () => {
  const session = takeTest('full-30', ['lt30-sqrt', 'lt30-radical', 'lt30-quad-formula']);
  const summary = summarizeLevelTest(session, levelTests, roadmap);
  assert.match(summary.report.tier, /28문항 중 25개 정답/);
  const poly = summary.report.domains.find((d) => d.id === 'polynomials');
  assert.deepEqual(poly.weak, ['제곱근', '근호를 포함한 식의 계산']);

  const input = buildRoadmapAIInput({ graph: roadmap, diagnostic: summary, goal: '간호사' });
  const status = Object.fromEntries(input.nodes.map((node) => [node.id, node.evidence]));
  assert.equal(status['rm-sqrt'], 'failed');
  assert.equal(status['rm-quad-formula'], 'failed');
  assert.equal(status['rm-discriminant'], 'passed');
  assert.deepEqual(input.startCandidateIds, ['rm-sqrt']);

  const route = ['rm-sqrt', 'rm-radical', 'rm-quad-formula'];
  assert.deepEqual(findRouteOrderViolations(roadmap, route), []);
  const output = {
    kind: ROADMAP_AI_KIND,
    startNodeId: 'rm-sqrt',
    route: route.map((nodeId) => ({ nodeId, reason: '30분 레벨테스트에서 오답이 관찰됨', evidenceAttemptIds: input.nodes.find((n) => n.id === nodeId).attemptIds })),
    goalConnection: '간호 계열 진학 요건은 공식 정보 확인이 필요합니다.',
    uncertainties: [],
  };
  assert.equal(validateRoadmapAIOutput(input, output).ok, true);
});

test('10분 결과: 고1 문항을 틀리면 관련 기초를 막힘이 아니라 확인 필요로 표시한다', () => {
  const session = takeTest('quick-10', ['lt10-factor-cubic']);
  const input = buildRoadmapAIInput({ graph: roadmap, diagnostic: summarizeLevelTest(session, levelTests, roadmap) });
  const status = Object.fromEntries(input.nodes.map((node) => [node.id, node.evidence]));
  assert.equal(status['rm-factor'], 'needs_check');
  assert.equal(status['rm-mult-formula'], 'needs_check');
  assert.equal(status['rm-discriminant'], 'passed'); // 10분 판별식 문항은 로드맵 개념과 직접 연결
  assert.ok(!Object.values(status).includes('failed'));
  // 곱셈 공식이 인수분해의 선수이므로 곱셈 공식부터
  assert.deepEqual(input.startCandidateIds, ['rm-mult-formula']);
});

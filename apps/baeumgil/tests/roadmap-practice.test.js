import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createEmptyAppState } from '../public/src/domain/contracts.js';
import { normalizeChoiceValue } from '../public/src/learning/exposure.js';
import { ROADMAP_AI_KIND, buildRoadmapAIInput } from '../public/src/roadmap/ai-route.js';
import { getLevelTestQuestion, startLevelTest, submitLevelTestAnswer, summarizeLevelTest } from '../public/src/roadmap/level-test.js';
import { applyAIRoadmapPlan, applyRoadmapPlan, buildRuleRoadmapRoute, currentRoadmapPlan } from '../public/src/roadmap/plans.js';
import {
  PRACTICE_NODE_RESULTS,
  getPracticeQuestion,
  latestRoadmapPractice,
  saveRoadmapPractice,
  startRoadmapPractice,
  submitRoadmapPracticeAnswer,
  summarizeRoadmapPractice,
} from '../public/src/roadmap/practice.js';

const readJson = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));
const roadmap = readJson('public/src/roadmap/roadmap.json');
const levelTests = readJson('public/src/roadmap/level-tests.json');
const practice = readJson('public/src/roadmap/practice-questions.json');
const drafts = readJson('data/exam-sources/question-drafts.json').questions;

// ---- 검산 도우미: 학생이 보는 문제 문장의 숫자로 다시 푼다 ----
const num = (text) => Number(text.replace('−', '-'));
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const fromSup = (text) => Number([...text].map((c) => SUP.indexOf(c)).join(''));
const toSup = (n) => String(n).replace(/\d/g, (d) => SUP[d]);
const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const fraction = (n, d) => `${n / gcd(n, d)}/${d / gcd(n, d)}`;
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const integersIn = (predicate) => range(-30, 30).filter(predicate);
// 선택지 식을 계산한다: × ÷ − ≥ ≤ ² 와 '3a'·')(' 같은 곱셈 생략, 등호를 바꾼 뒤 계산
const toJs = (text) =>
  text.replace(/원$/, '')
    .replaceAll('−', '-').replaceAll('×', '*').replaceAll('÷', '/').replaceAll('≥', '>=').replaceAll('≤', '<=').replaceAll('²', '**2')
    .replace(/(\d)([a-z(])/g, '$1*$2').replaceAll(')(', ')*(')
    .replace(/(?<![<>=!])=(?!=)/g, '===');
const calc = (text, vars) => Function(...Object.keys(vars), `return (${toJs(text)});`)(...Object.values(vars));
const X_SAMPLES = range(-20, 20).map((i) => i / 2);

const match = (q, pattern) => {
  const found = q.prompt.match(pattern);
  assert.ok(found, `${q.id}: 문제 문장 형식이 다름 — ${q.prompt}`);
  return found.slice(1);
};

// 정답 값을 다시 계산하는 노드
const SOLVE = {
  'rm-arith': (q) => { const [a, b, c] = match(q, /^(\d+) \+ (\d+) × (\d+) 의 값은\?$/).map(num); return a + b * c; },
  'rm-fraction': (q) => { const [a, b] = match(q, /^1\/(\d+) \+ 1\/(\d+) 의 값은\?$/).map(num); return fraction(a + b, a * b); },
  'rm-integer': (q) => { const [a, b] = match(q, /^\(−(\d+)\) × \(\+(\d+)\)[을를] 계산하면\?$/).map(num); return -a * b; },
  'rm-power': (q) => { const [a, e] = match(q, /^(\d+)([⁰¹²³⁴⁵⁶⁷⁸⁹]+) 의 값은\?$/); return num(a) ** fromSup(e); },
  'rm-expr-value': (q) => { const [k, m, c] = match(q, /^a = (\d+)일 때, (\d+)a \+ (\d+)의 값은\?$/).map(num); return m * k + c; },
  'rm-linear-expr': (q) => {
    const [a, b, c, lead] = match(q, /^(\d+)\(x \+ (\d+)\) − \(x − (\d+)\) 를 간단히 하면 (\d*)x \+ □ 입니다\. □는\?$/);
    const f = (x) => num(a) * (x + num(b)) - (x - num(c));
    assert.equal(f(1) - f(0), lead === '' ? 1 : num(lead), `${q.id}: x의 계수`);
    return f(0);
  },
  'rm-linear-eq': (q) => { const [p, m, r] = match(q, /^일차방정식 (\d+)x − (\d+) = (\d+) \+ x의 해는\?$/).map(num); return integersIn((x) => p * x - m === r + x)[0]; },
  'rm-linear-eq-app': (q) => { const [w, p] = match(q, /가로의 길이가 (\d+) cm, 세로의 길이가 x cm인 직사각형이 있다\. 이 직사각형의 둘레의 길이가 (\d+) cm일 때/).map(num); return integersIn((x) => 2 * (w + x) === p)[0]; },
  'rm-system': (q) => {
    const [d, e] = match(q, /^연립방정식 x − y = (\d+), 2x − y = (\d+) 의 해는\?$/).map(num);
    const [[x, y]] = integersIn(() => true).flatMap((x) => integersIn((y) => x - y === d && 2 * x - y === e).map((y) => [x, y]));
    return `x = ${x}, y = ${y}`;
  },
  'rm-system-app': (q) => {
    const [p, r, n, money] = match(q, /^(\d+)원짜리 연필과 (\d+)원짜리 지우개를 합쳐 (\d+)개 사고 (\d+)원을 냈습니다\. 지우개는 몇 개인가요\?$/).map(num);
    return range(0, n).find((y) => p * (n - y) + r * y === money);
  },
  'rm-quad-eq': (q) => {
    const [b, c, root] = match(q, /^이차방정식 x² − (\d+)x \+ (\d+) = 0의 한 근이 (\d+)이다\. 다른 한 근은\?$/).map(num);
    const roots = integersIn((x) => x * x - b * x + c === 0);
    assert.ok(roots.includes(root), `${q.id}: 주어진 근이 근이 아님`);
    return roots.find((x) => x !== root) ?? root;
  },
  'rm-quad-formula': (q) => {
    const [b, c, h] = match(q, /^이차방정식 x² − (\d+)x − (\d+) = 0 의 해는 x = (\d+) ± √□ 입니다\. □는\?$/).map(num);
    assert.equal(h, b / 2, `${q.id}: ± 앞의 수`);
    return (b * b + 4 * c) / 4; // x = {b ± √(b² + 4c)} / 2 = b/2 ± √((b² + 4c)/4)
  },
  'rm-discriminant': (q) => { const [b] = match(q, /^이차방정식 x² − (\d+)x \+ a = 0이 중근을 가질 때, 상수 a의 값은\?$/).map(num); return range(0, 100).find((a) => b * b - 4 * a === 0); },
  'rm-vieta': (q) => {
    const [b, c] = match(q, /^이차방정식 x² − (\d+)x − (\d+) = 0의 서로 다른 두 실근을 α, β라고 할 때, α \+ β의 값은\?$/).map(num);
    const roots = integersIn((x) => x * x - b * x - c === 0);
    assert.equal(roots.length, 2, `${q.id}: 서로 다른 두 실근`);
    return roots[0] + roots[1];
  },
  'rm-coordinate': (q) => {
    const [x, y] = match(q, /^점 \((−?\d+), (−?\d+)\) 는 제몇사분면 위의 점인가요\?$/).map(num);
    return `제${x > 0 ? (y > 0 ? 1 : 4) : y > 0 ? 2 : 3}사분면`;
  },
  'rm-proportion': (q) => {
    const [x1, y1, x2] = match(q, /^y가 x에 정비례하고 x = (\d+)일 때 y = (\d+)입니다\. x = (\d+)일 때 y는\?$/).map(num);
    return (y1 / x1) * x2;
  },
  'rm-linear-fn': (q) => { const [b] = match(q, /^일차함수 y = x − (\d+)의 그래프의 y절편은\?$/).map(num); return 0 - b; },
  'rm-quad-fn-eq': (q) => {
    const [b, c] = match(q, /^이차함수 y = x² − (\d*)x − (\d+) 의 그래프와 x축이 만나는 두 점 중 x좌표가 큰 점의 x좌표는\?$/);
    return Math.max(...integersIn((x) => x * x - (b === '' ? 1 : num(b)) * x - num(c) === 0));
  },
  'rm-exponent': (q) => { const [m, n, k] = match(q, /^a([⁰¹²³⁴⁵⁶⁷⁸⁹]+) × a([⁰¹²³⁴⁵⁶⁷⁸⁹]+) ÷ a([⁰¹²³⁴⁵⁶⁷⁸⁹]+)을 간단히 한 것은\? \(단, a ≠ 0\)$/).map(fromSup); return `a${toSup(m + n - k)}`; },
  'rm-sqrt': (q) => { const [n] = match(q, /^√\{\(−(\d+)\)²\}의 값은\?$/).map(num); return Math.sqrt((-n) ** 2); },
  'rm-mult-formula': (q) => {
    const [a, b, c] = match(q, /^\(x \+ (\d+)\)\(x \+ (\d+)\)[을를] 전개한 식이 x² \+ mx \+ (\d+)일 때, 수 m의 값은\?$/).map(num);
    assert.equal(a * b, c, `${q.id}: 상수항`);
    return a + b;
  },
  'rm-radical': (q) => {
    const [a, r, b, r2] = match(q, /^(\d+)√(\d+) \+ (\d+)√(\d+)[을를] 간단히 한 것은\?$/).map(num);
    assert.equal(r, r2, `${q.id}: 근호 안의 수`);
    return `${a + b}√${r}`;
  },
};

// 선택지가 식·문장인 노드: 정답만 참이어야 한다. 반환값은 { 선택지 값: 참인지 }
const TRUTH = {
  'rm-letters': (q) => {
    const [price] = match(q, /^한 송이에 (\d+)원인 장미꽃 a송이의 가격을/).map(num);
    return (value) => [1, 2, 5].every((a) => calc(value, { a }) === price * a);
  },
  'rm-eq-property': () => (value) => [[1, 1], [-2, -2], [5, 5]].every(([a, b]) => calc(value, { a, b })),
  'rm-ineq-property': () => (value) => [[1, 2], [-5, -1], [-2, 3]].every(([a, b]) => calc(value, { a, b })),
  'rm-linear-ineq': (q) => {
    const [p, r] = match(q, /^일차부등식 (\d+)x ≥ (\d+)[을를] 풀면\?$/).map(num);
    return (value) => X_SAMPLES.every((x) => calc(value, { x }) === p * x >= r);
  },
  'rm-factor': (q) => {
    const [b, c] = match(q, /^다항식 x² \+ (\d+)x \+ (\d+)[을를] 인수분해한 것은\?$/).map(num);
    return (value) => X_SAMPLES.every((x) => calc(value, { x }) === x * x + b * x + c);
  },
  'rm-quad-graph': (q) => {
    const [p, k] = match(q, /^이차함수 y = \(x − (\d+)\)² − (\d+)의 그래프에 대한 설명으로 옳은 것은\?$/).map(num);
    const f = (x) => (x - p) ** 2 - k;
    const vertexX = integersIn(() => true).reduce((best, x) => (f(x) < f(best) ? x : best));
    return (value) => {
      if (value === '위로 볼록이다.') return f(vertexX + 1) < f(vertexX);
      let m = value.match(/^점 \(0, (−?\d+)\)[을를] 지난다\.$/);
      if (m) return f(0) === num(m[1]);
      m = value.match(/^직선 x = (−?\d+)[을를] 축으로 한다\.$/);
      if (m) return f(num(m[1]) - 1) === f(num(m[1]) + 1);
      m = value.match(/^꼭짓점의 좌표는 \((−?\d+), (−?\d+)\)이다\.$/);
      if (m) return num(m[1]) === vertexX && num(m[2]) === f(vertexX);
      throw new Error(`${q.id}: 알 수 없는 설명 ${value}`);
    };
  },
};

// 받침: 숫자 마지막 자리 읽기 기준(0 십·영, 1 일, 3 삼, 6 육, 7 칠, 8 팔), 위첨자는 '제곱'
const expectedObjectParticle = (char) => (SUP.includes(char) || '013678'.includes(char) ? '을' : '를');

test('연습 문항: 로드맵 28개 노드마다 3문항 묶음 2개, 노드 정보와 맞다', () => {
  assert.deepEqual(practice.rules, { setSize: 3, passCorrect: 2, maxSets: 2 });
  const ids = practice.questions.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(practice.questions.length, roadmap.nodes.length * 6);
  for (const node of roadmap.nodes) {
    for (const set of [1, 2]) {
      const inSet = practice.questions.filter((q) => q.nodeId === node.id && q.set === set);
      assert.equal(inSet.length, practice.rules.setSize, `${node.id} 묶음 ${set}`);
    }
    for (const q of practice.questions.filter((entry) => entry.nodeId === node.id)) {
      assert.deepEqual([q.topic, q.cluster, q.grade, q.conceptIds], [node.name, node.cluster, node.grade, [node.id]], q.id);
      assert.deepEqual([q.kind, q.role, q.contentStatus], ['authored', 'roadmap_practice', 'approved'], q.id);
    }
  }
});

test('연습 문항: 선택지 4개가 서로 다르고, 정답은 문제 문장의 숫자로 다시 풀어도 같다', () => {
  for (const q of practice.questions) {
    const values = q.choices.map((choice) => normalizeChoiceValue(choice.value));
    assert.equal(new Set(values).size, 4, `${q.id} 선택지 중복`);
    assert.equal(values.filter((value) => value === normalizeChoiceValue(q.answer)).length, 1, `${q.id} 정답이 선택지에 하나`);
    if (SOLVE[q.nodeId]) {
      assert.equal(normalizeChoiceValue(String(SOLVE[q.nodeId](q))), normalizeChoiceValue(q.answer), `${q.id} 정답 불일치`);
    } else {
      const isTrue = TRUTH[q.nodeId](q);
      assert.deepEqual(q.choices.map((c) => c.value).filter(isTrue), [q.answer], `${q.id} 참인 선택지`);
    }
  }
  const checkedNodes = new Set([...Object.keys(SOLVE), ...Object.keys(TRUTH)]);
  assert.deepEqual([...checkedNodes].sort(), roadmap.nodes.map((node) => node.id).sort());
});

test('연습 문항: 같은 문제가 없고, 레벨테스트 문항과도 겹치지 않으며, 한 묶음 안에서 정답 자리가 다 같지 않다', () => {
  const statementOnly = new Set(['rm-eq-property', 'rm-ineq-property']); // 문장이 같고 선택지 숫자만 다른 노드
  const keyOf = (q) => (statementOnly.has(q.nodeId) ? `${q.prompt}|${q.choices.map((c) => c.value).sort().join('|')}` : q.prompt);
  const keys = practice.questions.map(keyOf);
  assert.equal(new Set(keys).size, keys.length);
  const levelKeys = new Set(levelTests.questions.map((q) => `${q.prompt}|${q.choices.map((c) => c.value).sort().join('|')}`));
  for (const q of practice.questions) {
    assert.ok(!levelKeys.has(`${q.prompt}|${q.choices.map((c) => c.value).sort().join('|')}`), `${q.id}가 레벨테스트 문항과 같음`);
  }
  for (const node of roadmap.nodes) {
    for (const set of [1, 2]) {
      const positions = practice.questions
        .filter((q) => q.nodeId === node.id && q.set === set)
        .map((q) => q.choices.findIndex((c) => c.value === q.answer));
      assert.ok(new Set(positions).size > 1, `${node.id} 묶음 ${set}의 정답 자리가 모두 같음`);
    }
  }
});

test('연습 문항: 레벨테스트와 같은 원문(기출 또는 자체 제작 문항)을 가리킨다', () => {
  const draftIds = new Set(drafts.map((draft) => draft.id));
  const levelByNode = new Map(levelTests.questions.filter((q) => q.id.startsWith('lt30-')).map((q) => [q.conceptIds[0], q]));
  for (const q of practice.questions) {
    const base = levelByNode.get(q.nodeId);
    if (base.reference.basis === 'official_variant') {
      assert.equal(q.reference.basis, 'official_variant', q.id);
      assert.equal(q.reference.derivedFrom, base.reference.derivedFrom, q.id);
      assert.ok(draftIds.has(q.reference.derivedFrom), q.id);
    } else {
      assert.deepEqual([q.reference.basis, q.reference.derivedFrom], ['authored_variant', base.id], q.id);
    }
  }
});

test('조사: 숫자 뒤 을/를이 읽는 소리에 맞다 (연습·레벨테스트 문제 문장)', () => {
  for (const q of [...practice.questions, ...levelTests.questions]) {
    for (const [, char, particle] of q.prompt.matchAll(/([0-9⁰¹²³⁴⁵⁶⁷⁸⁹])\)*(을|를) /g)) {
      assert.equal(particle, expectedObjectParticle(char), `${q.id}: ${q.prompt}`);
    }
  }
});

// ---- 진행 ----
const at = () => new Date('2026-10-24T09:00:00.000Z');
const choiceFor = (questionId, correct) => {
  const q = getPracticeQuestion(practice, questionId);
  return q.choices.find((c) => (normalizeChoiceValue(c.value) === normalizeChoiceValue(q.answer)) === correct).id;
};
// plan 순서대로 풀고, 낸 문항 순서를 돌려준다. answers: 문항 ID → 'o' 정답 | 'x' 오답 | 'h' 도움 받고 정답 (없으면 정답)
function solve(plan, answers = {}) {
  let session = startRoadmapPractice(plan, practice, { now: at });
  const served = [];
  for (let n = 0; session.status === 'active'; n += 1) {
    const id = session.currentId;
    served.push(id);
    const mark = answers[id] ?? 'o';
    session = submitRoadmapPracticeAnswer(session, { id: `p${n}`, questionId: id, choiceId: choiceFor(id, mark !== 'x'), helpUsed: mark === 'h' }, practice, { now: at });
  }
  return { session, served };
}
const plan = { id: 'plan-1', learnerId: 'learner-1', nodeIds: ['rm-sqrt', 'rm-radical', 'rm-quad-formula'] };

test('로드맵 순서대로 문제를 낸다: 3문제 중 2개 맞히면 다음 노드, 못 넘으면 두 번째 묶음, 그래도 못 넘으면 멘토 확인', () => {
  const { session, served } = solve(plan, {
    'rp-sqrt-2': 'x', // 제곱근: 2/3 → 통과
    'rp-radical-1': 'x', 'rp-radical-3': 'x', // 근호 계산 1묶음: 1/3 → 2묶음으로
    'rp-radical-4': 'h', 'rp-radical-5': 'h', // 2묶음: 도움 받은 정답은 빼면 1/3 → 멘토 확인
  });
  assert.deepEqual(served, [
    'rp-sqrt-1', 'rp-sqrt-2', 'rp-sqrt-3',
    'rp-radical-1', 'rp-radical-2', 'rp-radical-3', 'rp-radical-4', 'rp-radical-5', 'rp-radical-6',
    'rp-quad-formula-1', 'rp-quad-formula-2', 'rp-quad-formula-3',
  ]);
  assert.equal(session.status, 'completed');
  assert.deepEqual(session.nodeResults, [
    { nodeId: 'rm-sqrt', result: PRACTICE_NODE_RESULTS.PASSED, sets: 1 },
    { nodeId: 'rm-radical', result: PRACTICE_NODE_RESULTS.NEEDS_MENTOR, sets: 2 },
    { nodeId: 'rm-quad-formula', result: PRACTICE_NODE_RESULTS.PASSED, sets: 1 },
  ]);
  const summary = summarizeRoadmapPractice(session);
  assert.deepEqual(summary.nodes.map((node) => node.status), ['passed', 'needs_mentor', 'passed']);
  assert.deepEqual(summary.needsMentorNodeIds, ['rm-radical']);
  // 원 응답은 모두 남는다
  assert.equal(session.attempts.length, 12);
  assert.deepEqual(session.attempts.filter((a) => a.helpUsed).map((a) => [a.questionId, a.result, a.independent]), [
    ['rp-radical-4', 'correct', false],
    ['rp-radical-5', 'correct', false],
  ]);
});

test('진행: 같은 제출은 다시 저장하지 않고, 지난 문항·빈 제출·끝난 연습은 거부하고, 문항 없는 노드는 건너뛴다', () => {
  let session = startRoadmapPractice(plan, practice, { now: at });
  const first = session.currentId;
  session = submitRoadmapPracticeAnswer(session, { id: 's1', questionId: first, choiceId: choiceFor(first, true) }, practice);
  assert.equal(submitRoadmapPracticeAnswer(session, { id: 's1', questionId: first, choiceId: 'a' }, practice), session);
  assert.throws(() => submitRoadmapPracticeAnswer(session, { id: 's2', questionId: first, choiceId: 'a' }, practice), /staleQuestion/);
  assert.throws(() => submitRoadmapPracticeAnswer(session, { id: 's3', questionId: session.currentId }, practice), { code: 'emptySubmission' });

  const done = solve(plan).session;
  assert.throws(() => submitRoadmapPracticeAnswer(done, { id: 'late', questionId: 'rp-sqrt-1', choiceId: 'a' }, practice), /practiceClosed/);

  const skipped = startRoadmapPractice({ ...plan, nodeIds: ['rm-not-in-file', 'rm-sqrt'] }, practice);
  assert.deepEqual(skipped.nodeResults, [{ nodeId: 'rm-not-in-file', result: PRACTICE_NODE_RESULTS.NO_QUESTIONS, sets: 0 }]);
  assert.equal(skipped.currentNodeId, 'rm-sqrt');
});

test('연습 기록을 앱 기록에 저장하고, 이어서 풀 최신 기록을 찾는다', () => {
  let session = startRoadmapPractice(plan, practice, { now: at });
  let state = saveRoadmapPractice(createEmptyAppState(), { id: 'practice-1', session, now: at });
  session = submitRoadmapPracticeAnswer(session, { id: 's1', questionId: session.currentId, choiceId: choiceFor(session.currentId, true) }, practice);
  state = saveRoadmapPractice(state, { id: 'practice-1', session, now: () => new Date('2026-10-24T09:05:00.000Z') });
  assert.equal(state.roadmapPractices.length, 1);
  const latest = latestRoadmapPractice(state, 'learner-1');
  assert.equal(latest.startedAt, '2026-10-24T09:00:00.000Z');
  assert.equal(latest.session.attempts.length, 1);
  assert.equal(latest.completedAt, null);
  assert.equal(latestRoadmapPractice(state, 'learner-2'), null);
});

test('처음부터 끝까지: 30분 레벨테스트 → AI 루트 바로 적용 → 루트 순서대로 연습 (AI 실패 시 규칙 루트도 같은 순서)', () => {
  // 30분 레벨테스트에서 제곱근·근호 계산·근의 공식을 틀림
  const wrong = new Set(['lt30-sqrt', 'lt30-radical', 'lt30-quad-formula']);
  let test30 = startLevelTest(levelTests, 'full-30', { now: at });
  for (let n = 0; test30.status === 'active'; n += 1) {
    const q = getLevelTestQuestion(levelTests, test30.currentId);
    const choice = q.choices.find((c) => (normalizeChoiceValue(c.value) === normalizeChoiceValue(q.answer)) !== wrong.has(q.id));
    test30 = submitLevelTestAnswer(test30, { id: `lt${n}`, questionId: q.id, choiceId: choice.id }, levelTests, { now: at });
  }
  const input = buildRoadmapAIInput({ graph: roadmap, diagnostic: summarizeLevelTest(test30, levelTests, roadmap), goal: '간호사' });
  const attemptsOf = (nodeId) => input.nodes.find((node) => node.id === nodeId).attemptIds;
  const aiOutput = {
    kind: ROADMAP_AI_KIND,
    startNodeId: 'rm-sqrt',
    route: plan.nodeIds.map((nodeId) => ({ nodeId, reason: '30분 레벨테스트에서 오답이 관찰됨', evidenceAttemptIds: attemptsOf(nodeId) })),
    goalConnection: '간호 계열 진학 요건은 공식 정보 확인이 필요합니다.',
    uncertainties: [],
  };

  let state = applyAIRoadmapPlan(createEmptyAppState(), { learnerId: 'learner-1', input, output: aiOutput, aiRequestId: 'roadmap-1' }).value.state;
  const applied = currentRoadmapPlan(state, 'learner-1');
  assert.equal(applied.source, 'ai');
  const first = startRoadmapPractice(applied, practice, { now: at });
  assert.deepEqual([first.currentNodeId, first.currentId], ['rm-sqrt', 'rp-sqrt-1']);

  // AI 호출이 실패했을 때
  const rule = buildRuleRoadmapRoute(input);
  assert.deepEqual(rule.nodeIds, plan.nodeIds);
  state = applyRoadmapPlan(state, { learnerId: 'learner-1', ...rule, source: 'rule' }).value.state;
  assert.equal(currentRoadmapPlan(state, 'learner-1').source, 'rule');
  assert.equal(solve(currentRoadmapPlan(state, 'learner-1')).served[0], 'rp-sqrt-1');
});

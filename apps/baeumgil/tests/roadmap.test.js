import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ERROR_CODES, ROADMAP_PLAN_STATUSES, createEmptyAppState } from '../public/src/domain/contracts.js';
import { ROADMAP_AI_KIND, buildRoadmapAIInput, buildRoadmapGeminiRequest, validateRoadmapAIOutput } from '../public/src/roadmap/ai-route.js';
import { latestCompletedDiagnostic, saveDiagnosticSession, summarizeDiagnostic } from '../public/src/roadmap/diagnostic-log.js';
import {
  createEmptyRoadmapGraph,
  findRouteOrderViolations,
  getNodeLinks,
  orderByPrerequisites,
  validateRoadmapGraph,
} from '../public/src/roadmap/graph.js';
import { applyAIRoadmapPlan, applyRoadmapPlan, buildRuleRoadmapRoute, currentRoadmapPlan } from '../public/src/roadmap/plans.js';
import { createAiHandler } from '../server/ai/handler.mjs';
import { WRONG_VIETA_AND_SQRT, loadDiagnosticContent, makeSampleRoadmap, runDiagnostic } from './roadmap-fixtures.js';

const content = loadDiagnosticContent();
const graph = makeSampleRoadmap();

function vietaSqrtDiagnostic() {
  return summarizeDiagnostic(runDiagnostic(content, WRONG_VIETA_AND_SQRT), content.bank, content.config);
}

function roadmapInput(goal = '간호사가 되고 싶어요') {
  return buildRoadmapAIInput({ graph, diagnostic: vietaSqrtDiagnostic(), goal, learnerNames: ['하늘'] });
}

function validRoute(input) {
  const attemptOf = (nodeId) => input.nodes.find((node) => node.id === nodeId).attemptIds;
  return {
    kind: ROADMAP_AI_KIND,
    startNodeId: 'rm-sqrt',
    route: [
      { nodeId: 'rm-sqrt', reason: '중3 제곱근 문항에서 오답이 관찰됨', evidenceAttemptIds: attemptOf('rm-sqrt') },
      { nodeId: 'rm-quad-factor', reason: '근과 계수의 관계의 선수 개념으로 확인이 필요함', evidenceAttemptIds: [] },
      { nodeId: 'rm-vieta', reason: '고졸 근과 계수의 관계 문항에서 오답이 관찰됨', evidenceAttemptIds: attemptOf('rm-vieta') },
    ],
    goalConnection: '간호 계열 진학 요건은 공식 정보 확인이 필요하며, 검정고시 수학 기초부터 이어 갑니다.',
    uncertainties: ['이차방정식의 인수분해는 레벨테스트에서 확인하지 않았음'],
  };
}

test('로드맵 데이터는 받기 전까지 비어 있고, 빈 그래프도 형식은 올바르다', () => {
  assert.deepEqual(createEmptyRoadmapGraph().nodes, []);
  assert.equal(validateRoadmapGraph(createEmptyRoadmapGraph()).ok, true);
  assert.equal(validateRoadmapGraph(graph).ok, true);
});

test('없는 선수 노드, 중복 ID, 순환 연결을 잡아낸다', () => {
  const codes = (g) => validateRoadmapGraph(g).error.errors.map((error) => error.code);
  assert.deepEqual(codes({ nodes: [{ id: 'a', prerequisiteIds: ['ghost'] }] }), ['unknownPrerequisite']);
  assert.deepEqual(codes({ nodes: [{ id: 'a' }, { id: 'a' }] }), ['duplicateNodeId']);
  assert.deepEqual(codes({ nodes: [{ id: 'a', prerequisiteIds: ['b'] }, { id: 'b', prerequisiteIds: ['a'] }] }), ['cycle']);
});

test('노드를 누르면 보여 줄 선수 노드와 후위 노드를 돌려준다', () => {
  const vieta = getNodeLinks(graph, 'rm-vieta');
  assert.deepEqual(vieta.prerequisites.map((node) => node.id), ['rm-quad-factor', 'rm-sqrt']);
  assert.deepEqual(vieta.successors, []);
  const quad = getNodeLinks(graph, 'rm-quad-factor');
  assert.deepEqual(quad.prerequisites.map((node) => node.id), ['rm-linear-eq']);
  assert.deepEqual(quad.successors.map((node) => node.id), ['rm-discriminant', 'rm-vieta']);
  assert.equal(getNodeLinks(graph, 'nope'), null);
});

test('선수 노드가 뒤에 오는 순서를 찾아내고, 규칙대로 다시 정렬할 수 있다', () => {
  assert.deepEqual(findRouteOrderViolations(graph, ['rm-sqrt', 'rm-vieta']), []);
  assert.deepEqual(findRouteOrderViolations(graph, ['rm-vieta', 'rm-linear-eq']), [{ nodeId: 'rm-vieta', prerequisiteId: 'rm-linear-eq' }]);
  assert.deepEqual(orderByPrerequisites(graph, ['rm-vieta', 'rm-sqrt', 'rm-quad-factor']), ['rm-sqrt', 'rm-quad-factor', 'rm-vieta']);
});

test('레벨테스트 기록마다 영역·문항·개념·단계·정답 여부가 남는다', () => {
  const equations = vietaSqrtDiagnostic().attempts.filter((attempt) => attempt.domain === 'equations');
  assert.deepEqual(
    equations.map(({ questionId, stage, result }) => [questionId, stage, result]),
    [
      ['ged-high-2025-1-math-q05', '고졸 본문항', 'correct'],
      ['ged-high-2025-1-math-q06', '고졸 본문항', 'incorrect'],
      ['ged-middle-2025-1-math-q15', '1차 하위', 'incorrect'],
      ['ged-middle-2025-1-math-q04', '2차 하위', 'correct'],
      ['ged-middle-2025-1-math-q10', '2차 하위', 'correct'],
    ],
  );
  assert.deepEqual(equations[1].conceptIds, ['astra-equations-l3-근과 계수의 관계']);
});

test('레벨테스트 진행 기록을 앱 기록에 저장하고, 끝난 것 중 최신을 찾는다', () => {
  const session = runDiagnostic(content, WRONG_VIETA_AND_SQRT);
  const at = () => new Date('2026-10-24T08:00:00.000Z');
  const state = saveDiagnosticSession(createEmptyAppState(), { id: 'diag-1', learnerId: 'learner-1', session, now: at });
  assert.equal(state.diagnostics.length, 1);
  assert.equal(latestCompletedDiagnostic(state, 'learner-1').id, 'diag-1');
  assert.equal(latestCompletedDiagnostic(state, 'learner-2'), null);
});

test('AI 입력: 노드별 근거, 가장 아래에서 막힌 시작점 후보, 가린 목표 문장', () => {
  const input = roadmapInput('하늘이는 간호사가 꿈이에요. 010-1234-5678');
  const evidence = Object.fromEntries(input.nodes.map((node) => [node.id, node.evidence]));
  assert.deepEqual(evidence, {
    'rm-linear-eq': 'passed',
    'rm-sqrt': 'failed',
    'rm-quad-factor': 'unmeasured',
    'rm-discriminant': 'passed',
    'rm-vieta': 'failed',
  });
  // 근과 계수의 관계도 막혔지만 그 선수인 제곱근이 막혔으므로 제곱근부터
  assert.deepEqual(input.startCandidateIds, ['rm-sqrt']);
  assert.equal(input.goal, '학습자 A이는 간호사가 꿈이에요. [연락처]');
  assert.ok(buildRoadmapGeminiRequest(input).generationConfig.responseSchema);
});

test('AI 출력 검증: 규칙에 맞는 루트는 통과한다', () => {
  const input = roadmapInput();
  const verdict = validateRoadmapAIOutput(input, JSON.stringify(validRoute(input)));
  assert.equal(verdict.ok, true, JSON.stringify(verdict.errors));
});

test('AI 출력 검증: 시작점·순서·노드·근거 규칙을 어기면 채택하지 않는다', () => {
  const input = roadmapInput();
  const codesOf = (mutate) => {
    const output = validRoute(input);
    mutate(output);
    const verdict = validateRoadmapAIOutput(input, output);
    return verdict.ok ? [] : verdict.errors.map((error) => error.code);
  };
  assert.ok(codesOf((o) => { o.startNodeId = 'rm-vieta'; o.route.reverse(); }).includes('startNotCandidate'));
  assert.ok(codesOf((o) => { o.route.reverse(); }).includes('prerequisiteAfter'));
  assert.ok(codesOf((o) => { o.route.push({ nodeId: 'rm-made-up', reason: '추가', evidenceAttemptIds: [] }); }).includes('unknownNodeId'));
  assert.ok(codesOf((o) => { o.route.shift(); }).includes('startMismatch'));
  assert.ok(codesOf((o) => { o.route[0].evidenceAttemptIds = ['d999']; }).includes('unknownAttemptId'));
  assert.ok(codesOf((o) => { o.route[0].reason = '찍은 것으로 보임'; }).includes('judgementalLanguage'));
  assert.ok(codesOf((o) => { o.route.push({ ...o.route[0] }); }).includes('duplicateNode'));
});

test('/api/ai: 로드맵 루트 요청을 받아 검증을 통과한 결과만 돌려준다', async () => {
  const input = roadmapInput();
  let sent;
  const handler = createAiHandler({
    provider: {
      name: 'fake',
      model: 'fake-model',
      generate: async ({ request }) => {
        sent = request;
        return { text: JSON.stringify(validRoute(input)), model: 'fake-model' };
      },
    },
  });
  const { status, payload } = await handler({ requestId: 'roadmap-1', input });
  assert.equal(status, 200);
  assert.equal(payload.kind, ROADMAP_AI_KIND);
  assert.equal(payload.output.startNodeId, 'rm-sqrt');
  assert.match(sent.systemInstruction.parts[0].text, /startCandidateIds/);
});

test('/api/ai: 로드맵 데이터가 비어 있으면 roadmap_empty로 거부한다', async () => {
  const input = buildRoadmapAIInput({ graph: createEmptyRoadmapGraph(), diagnostic: vietaSqrtDiagnostic() });
  const { status, payload } = await createAiHandler({ provider: null })({ requestId: 'roadmap-2', input });
  assert.equal(status, 400);
  assert.equal(payload.error.field, 'input.allowedNodeIds');
  assert.equal(payload.error.reason, 'roadmap_empty');
});

test('검사를 통과한 AI 루트는 멘토 채택 없이 바로 적용되고, 새 루트가 오면 이전 루트는 교체됨으로 남는다', () => {
  const input = roadmapInput();
  let state = createEmptyAppState();
  let ids = ['plan-1', 'plan-2'];
  const options = { createId: () => ids.shift() };
  state = applyAIRoadmapPlan(state, { learnerId: 'learner-1', input, output: validRoute(input), aiRequestId: 'roadmap-1' }, options).value.state;
  const first = currentRoadmapPlan(state, 'learner-1');
  assert.equal(first.id, 'plan-1');
  assert.equal(first.source, 'ai');
  assert.deepEqual(first.nodeIds, validRoute(input).route.map((step) => step.nodeId));
  assert.equal(first.detail.reasons.length, first.nodeIds.length);

  state = applyRoadmapPlan(state, { learnerId: 'learner-1', startNodeId: 'rm-sqrt', nodeIds: ['rm-sqrt'], source: 'rule' }, options).value.state;
  assert.equal(currentRoadmapPlan(state, 'learner-1').id, 'plan-2');
  assert.deepEqual(state.roadmapPlans.map((plan) => [plan.id, plan.status, plan.replacedBy]), [
    ['plan-1', ROADMAP_PLAN_STATUSES.REPLACED, 'plan-2'],
    ['plan-2', ROADMAP_PLAN_STATUSES.ACTIVE, null],
  ]);
  assert.equal(currentRoadmapPlan(state, 'learner-2'), null);
  assert.equal(applyRoadmapPlan(state, { learnerId: 'learner-1', startNodeId: 'x', nodeIds: ['y'], source: 'ai' }).error.code, ERROR_CODES.INVALID_COMMAND);
  assert.equal(applyRoadmapPlan(state, { learnerId: 'learner-1', startNodeId: 'x', nodeIds: ['x'], source: 'mentor' }).error.code, ERROR_CODES.INVALID_COMMAND);
});

test('규칙을 어긴 AI 루트는 적용하지 않고, 기존 루트도 그대로 둔다', () => {
  const input = roadmapInput();
  const broken = validRoute(input);
  broken.route.reverse(); // 선수 노드가 뒤로 감
  const state = createEmptyAppState();
  const result = applyAIRoadmapPlan(state, { learnerId: 'learner-1', input, output: broken });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, ERROR_CODES.AI_INVALID_OUTPUT);
  assert.ok(result.error.errors.length > 0);
  assert.deepEqual(state.roadmapPlans, []);
});

test('AI가 실패하면 규칙 기반 루트: 시작점 후보부터, 이어지는 미확인 노드를 선수 순서대로', () => {
  const input = roadmapInput();
  const rule = buildRuleRoadmapRoute(input);
  assert.equal(rule.startNodeId, input.startCandidateIds[0]);
  assert.deepEqual(findRouteOrderViolations(graph, rule.nodeIds), []);
  const evidence = Object.fromEntries(input.nodes.map((node) => [node.id, node.evidence]));
  assert.ok(rule.nodeIds.every((id) => evidence[id] !== 'passed'));
  // 모두 확인된 학생은 낼 루트가 없다
  assert.equal(buildRuleRoadmapRoute({ ...input, startCandidateIds: [] }), null);
});

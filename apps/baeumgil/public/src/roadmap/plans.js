// 학생별 로드맵 루트 (담당: 지훈)
// 팀 결정(2026-10-24): AI 루트는 코드 검사(validateRoadmapAIOutput)를 통과하면 멘토 채택 없이 바로 적용한다.
// PRD FR-06·2.3(AI 제안은 멘토가 채택)과 다르므로 PM 확인이 필요하다.
// AI 호출이 실패하면 buildRuleRoadmapRoute의 규칙 기반 루트를 적용한다.

import { ERROR_CODES, ROADMAP_PLAN_STATUSES, createId as defaultCreateId, fail, succeed } from '../domain/contracts.js';
import { ROADMAP_MAX_ROUTE, validateRoadmapAIOutput } from './ai-route.js';
import { getAncestorIds, orderByPrerequisites } from './graph.js';

const PLAN_SOURCES = ['ai', 'rule'];

/**
 * 루트를 바로 적용한다. 같은 학생의 이전 루트는 지우지 않고 '교체됨'으로 남긴다.
 * @param {object} plan { learnerId, diagnosticId?, graphVersion?, startNodeId, nodeIds, source: 'ai' | 'rule', aiRequestId?, detail? }
 */
export function applyRoadmapPlan(state, plan, { now = () => new Date(), createId = defaultCreateId } = {}) {
  if (!Array.isArray(plan.nodeIds) || plan.nodeIds.length === 0 || plan.nodeIds[0] !== plan.startNodeId) {
    return fail(ERROR_CODES.INVALID_COMMAND, { field: 'nodeIds' });
  }
  if (!PLAN_SOURCES.includes(plan.source)) {
    return fail(ERROR_CODES.INVALID_COMMAND, { field: 'source' });
  }
  const at = now().toISOString();
  const entry = {
    id: plan.id ?? createId('roadmap-plan'),
    learnerId: plan.learnerId,
    diagnosticId: plan.diagnosticId ?? null,
    graphVersion: plan.graphVersion ?? null,
    startNodeId: plan.startNodeId,
    nodeIds: [...plan.nodeIds],
    source: plan.source,
    aiRequestId: plan.aiRequestId ?? null,
    detail: plan.detail ?? null,
    status: ROADMAP_PLAN_STATUSES.ACTIVE,
    appliedAt: at,
    replacedAt: null,
    replacedBy: null,
  };
  const previous = (state.roadmapPlans ?? []).map((other) =>
    other.learnerId === plan.learnerId && other.status === ROADMAP_PLAN_STATUSES.ACTIVE
      ? { ...other, status: ROADMAP_PLAN_STATUSES.REPLACED, replacedAt: at, replacedBy: entry.id }
      : other,
  );
  return succeed({ state: { ...state, roadmapPlans: [...previous, entry] }, planId: entry.id });
}

/**
 * /api/ai의 roadmap_route 결과를 다시 검사하고 바로 적용한다.
 * 규칙을 어긴 결과는 적용하지 않는다 (ai_invalid_output).
 */
export function applyAIRoadmapPlan(state, { learnerId, input, output, aiRequestId = null, diagnosticId = null }, options) {
  const checked = validateRoadmapAIOutput(input, output);
  if (!checked.ok) {
    return fail(ERROR_CODES.AI_INVALID_OUTPUT, { errors: checked.errors });
  }
  const { startNodeId, route, goalConnection, uncertainties } = checked.value;
  return applyRoadmapPlan(state, {
    learnerId,
    diagnosticId,
    startNodeId,
    nodeIds: route.map((step) => step.nodeId),
    source: 'ai',
    aiRequestId,
    detail: { reasons: route.map(({ nodeId, reason }) => ({ nodeId, reason })), goalConnection, uncertainties },
  }, options);
}

/**
 * AI가 실패했을 때 쓰는 규칙 기반 루트.
 * 시작점 후보들과, 그 뒤에 이어지는 노드 중 아직 확인되지 않은(passed가 아닌) 노드를 선수 순서대로 놓는다.
 * 확인할 노드가 없으면 null.
 */
export function buildRuleRoadmapRoute(input) {
  if (input.startCandidateIds.length === 0) {
    return null;
  }
  const graph = { nodes: input.nodes };
  const candidates = new Set(input.startCandidateIds);
  const included = input.nodes
    .filter((node) => node.evidence !== 'passed' || candidates.has(node.id))
    .filter((node) => candidates.has(node.id) || [...getAncestorIds(graph, node.id)].some((id) => candidates.has(id)))
    .map((node) => node.id);
  const nodeIds = orderByPrerequisites(graph, included).slice(0, ROADMAP_MAX_ROUTE);
  return { startNodeId: nodeIds[0], nodeIds };
}

/** 학생에게 지금 적용 중인 로드맵 */
export function currentRoadmapPlan(state, learnerId) {
  return (state.roadmapPlans ?? []).find(
    (entry) => entry.learnerId === learnerId && entry.status === ROADMAP_PLAN_STATUSES.ACTIVE,
  ) ?? null;
}

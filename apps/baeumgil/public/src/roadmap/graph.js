// 로드맵 그래프 (담당: 지훈)
// 데이터는 roadmap/roadmap.json에 둔다. 로드맵을 받기 전까지 nodes는 비어 있다.
//   노드: { id, name, prerequisiteIds: [선수 노드 id], conceptIds?: [레벨테스트 개념 id], ...화면용 필드 }
// prerequisiteIds가 '선수'이고, 그 반대 방향이 '후위'다. 화면은 getNodeLinks 결과로 연결선을 그린다.

import { ERROR_CODES, fail, succeed } from '../domain/contracts.js';

export function createEmptyRoadmapGraph() {
  return { version: 1, source: null, nodes: [] };
}

export function validateRoadmapGraph(graph) {
  if (graph === null || typeof graph !== 'object' || !Array.isArray(graph.nodes)) {
    return fail(ERROR_CODES.INVALID_ROADMAP, { errors: [{ code: 'invalidShape' }] });
  }
  const errors = [];
  const ids = new Set();
  for (const node of graph.nodes) {
    if (typeof node?.id !== 'string' || node.id.trim() === '') {
      errors.push({ code: 'invalidNodeId' });
      continue;
    }
    if (ids.has(node.id)) {
      errors.push({ code: 'duplicateNodeId', nodeId: node.id });
    }
    ids.add(node.id);
  }
  for (const node of graph.nodes) {
    for (const prerequisiteId of node.prerequisiteIds ?? []) {
      if (!ids.has(prerequisiteId)) {
        errors.push({ code: 'unknownPrerequisite', nodeId: node.id, prerequisiteId });
      }
    }
  }
  if (errors.length === 0) {
    const cycle = findCycle(graph);
    if (cycle) {
      errors.push({ code: 'cycle', nodeIds: cycle });
    }
  }
  return errors.length > 0 ? fail(ERROR_CODES.INVALID_ROADMAP, { errors }) : succeed(graph);
}

/** 노드를 눌렀을 때 보여 줄 선수 노드와 후위 노드 */
export function getNodeLinks(graph, nodeId) {
  const byId = indexNodes(graph);
  const node = byId.get(nodeId);
  if (!node) {
    return null;
  }
  return {
    node,
    prerequisites: (node.prerequisiteIds ?? []).map((id) => byId.get(id)).filter(Boolean),
    successors: graph.nodes.filter((other) => (other.prerequisiteIds ?? []).includes(nodeId)),
  };
}

/** 노드의 모든 선수 노드 (선수의 선수까지) */
export function getAncestorIds(graph, nodeId) {
  const byId = indexNodes(graph);
  const ancestors = new Set();
  const stack = [...(byId.get(nodeId)?.prerequisiteIds ?? [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (ancestors.has(id)) {
      continue;
    }
    ancestors.add(id);
    stack.push(...(byId.get(id)?.prerequisiteIds ?? []));
  }
  return ancestors;
}

/**
 * 루트 순서가 선수 관계를 어기지 않는지 검사한다.
 * 어떤 노드보다 그 노드의 선수(선수의 선수 포함)가 뒤에 오면 위반이다.
 */
export function findRouteOrderViolations(graph, nodeIds) {
  const position = new Map(nodeIds.map((id, index) => [id, index]));
  const violations = [];
  nodeIds.forEach((id, index) => {
    for (const ancestorId of getAncestorIds(graph, id)) {
      if (position.has(ancestorId) && position.get(ancestorId) > index) {
        violations.push({ nodeId: id, prerequisiteId: ancestorId });
      }
    }
  });
  return violations;
}

/** 주어진 노드들을 선수 관계 순서로 정렬한다. 같은 단계에서는 원래 순서를 지킨다 (AI가 실패했을 때 규칙 기반 대체용) */
export function orderByPrerequisites(graph, nodeIds) {
  const remaining = [...new Set(nodeIds)];
  const ordered = [];
  while (remaining.length > 0) {
    const index = remaining.findIndex((id) => [...getAncestorIds(graph, id)].every((a) => !remaining.includes(a)));
    ordered.push(...remaining.splice(index === -1 ? 0 : index, 1));
  }
  return ordered;
}

function indexNodes(graph) {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function findCycle(graph) {
  const byId = indexNodes(graph);
  const state = new Map(); // 1: 방문 중, 2: 끝
  const path = [];
  const visit = (id) => {
    state.set(id, 1);
    path.push(id);
    for (const next of byId.get(id)?.prerequisiteIds ?? []) {
      if (state.get(next) === 1) {
        return [...path.slice(path.indexOf(next)), next];
      }
      if (!state.has(next)) {
        const found = visit(next);
        if (found) {
          return found;
        }
      }
    }
    state.set(id, 2);
    path.pop();
    return null;
  };
  for (const node of graph.nodes) {
    if (!state.has(node.id)) {
      const found = visit(node.id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

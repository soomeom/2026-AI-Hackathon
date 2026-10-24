// Read-only map projection of diagnostic concepts and recorded learning evidence.
import { roadmapCards } from './roadmap.js';

export function buildConceptMap(roadmap, bank, config) {
  const cards = new Map((roadmap ? roadmapCards(roadmap) : []).map(c => [c.id, c]));
  const questions = new Map(bank.map(q => [q.id, q]));
  const nodes = new Map(), edges = new Map();
  const domains = config?.domains ?? [];
  const ensure = (domain, q, conceptId) => {
    const id = `${domain.id}:${conceptId}`;
    if (!nodes.has(id)) {
      const card = cards.get(id);
      const bundle = config?.learningBundles?.find(b => b.domain === domain.id && b.conceptId === conceptId);
      nodes.set(id, { id, conceptId, domain: domain.id, domainName: domain.name,
        title: bundle?.title ?? card?.title ?? q.curriculum?.core ?? conceptId,
        level: bundle?.level ?? card?.level ?? q.level, status: card?.status ?? 'unmeasured',
        courseComplete: card?.courseComplete ?? false,
        cardId: card?.id ?? null, practiceComplete: card?.practiceComplete ?? false,
        practiceCorrect: card?.practiceCorrect ?? 0, practiceTotal: card?.practiceTotal ?? 0,
        reason: card?.reason ?? '아직 직접 풀어 확인하지 않은 개념이에요.',
        explanation: bundle?.explanation ?? card?.explanation ?? '',
        evidenceQuestionIds: card?.evidenceQuestionIds ?? [], results: card?.results ?? [],
      });
    }
    return id;
  };
  for (const domain of domains) {
    const visited = new Set();
    const visit = questionId => {
      if (visited.has(questionId)) return;
      visited.add(questionId);
      const q = questions.get(questionId); if (!q) return;
      const targetIds = (q.conceptIds ?? []).map(c => ensure(domain, q, c));
      for (const lowerId of q.prerequisite_question_ids ?? (q.fallback_question_id ? [q.fallback_question_id] : [])) {
        const lower = questions.get(lowerId); if (!lower) continue;
        for (const concept of lower.conceptIds ?? []) {
          const from = ensure(domain, lower, concept);
          for (const to of targetIds) if (from !== to) edges.set(`${from}>${to}`, { from, to });
        }
        visit(lowerId);
      }
    };
    (domain.levels[3] ?? []).forEach(visit);
  }
  // Old records outside the current graph stay available, without invented relationships.
  for (const card of cards.values()) if (!nodes.has(card.id)) {
    nodes.set(card.id, { ...card, cardId: card.id, domainName: domains.find(d => d.id === card.domain)?.name ?? '이전 진단', legacy: true });
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()], nextNodeId: roadmap?.nextCardId ?? null };
}

export function selectMapNodes(map, { scope = 'path', domainId, nodeId } = {}) {
  if (scope === 'all') return map.nodes;
  if (scope === 'domain') return map.nodes.filter(n => n.domain === domainId);
  const anchor = map.nodes.find(n => n.id === nodeId) ?? map.nodes.find(n => n.id === map.nextNodeId) ?? map.nodes[0];
  if (!anchor) return [];
  const visible = new Set([anchor.id]), queue = [anchor.id];
  while (queue.length) {
    const id = queue.shift();
    for (const edge of map.edges) {
      const other = edge.from === id ? edge.to : edge.to === id ? edge.from : null;
      if (other && !visible.has(other)) { visible.add(other); queue.push(other); }
    }
  }
  return map.nodes.filter(n => visible.has(n.id));
}

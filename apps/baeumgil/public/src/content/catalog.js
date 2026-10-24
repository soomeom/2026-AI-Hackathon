// 콘텐츠 카탈로그 검증과 출제 가능 문항 목록.
// catalog = { questions, concepts, routes, templates, reviews } (각 JSON 파일을 합친 객체)

export const STAGE_ITEM_COUNT = Object.freeze({
  foundation_practice: 3,
  similar_practice: 2,
  transfer_check: 1,
});

export const MAX_CONCEPT_CHECKS = 2;

const ROUTE_TEMPLATE_STAGES = [
  ['foundationTemplateId', 'foundation_practice'],
  ['similarTemplateId', 'similar_practice'],
  ['transferTemplateId', 'transfer_check'],
];

const REVIEW_CHECKS = ['answerVerified', 'singleCorrectAnswer', 'authoredNotCopied'];

export function validateCatalog(catalog) {
  const questions = catalog.questions ?? [];
  const concepts = catalog.concepts ?? [];
  const routes = catalog.routes ?? [];
  const templates = catalog.templates ?? [];
  const reviews = catalog.reviews ?? [];

  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const routeByQuestionId = new Map(routes.map((r) => [r.questionId, r]));
  const reviewByQuestionId = new Map(reviews.map((r) => [r.questionId, r]));

  const errors = [];
  const originals = questions.filter((q) => q.role === 'original');

  // 개념 c 와 그 선수 개념 전체 (순환이 있어도 멈춘다)
  const closure = (startIds) => {
    const seen = new Set();
    const stack = [...startIds];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const pre of conceptById.get(id)?.prerequisiteIds ?? []) stack.push(pre);
    }
    return seen;
  };

  const routeConcepts = (q) => {
    const route = routeByQuestionId.get(q.id);
    return closure([...(q.conceptIds ?? []), ...(route ? [route.coreConceptId, ...route.prerequisiteConceptIds] : [])]);
  };
  const originalsTouching = (conceptIds) =>
    originals.filter((q) => {
      const own = routeConcepts(q);
      return conceptIds.some((id) => own.has(id));
    }).map((q) => q.id);

  // 1. 개념 그래프: 존재하지 않는 선수 개념
  for (const c of concepts) {
    const missing = (c.prerequisiteIds ?? []).filter((id) => !conceptById.has(id));
    if (missing.length) {
      errors.push({
        code: 'unknownConceptRejected',
        message: `개념 ${c.id} 의 선수 개념이 존재하지 않음: ${missing.join(', ')}`,
        conceptIds: [c.id, ...missing],
        questionIds: originalsTouching([c.id]),
      });
    }
  }

  // 2. 개념 그래프: 순환 (자기 자신으로 돌아오는 개념)
  const cyclic = concepts
    .filter((c) => closure(c.prerequisiteIds ?? []).has(c.id))
    .map((c) => c.id);
  if (cyclic.length) {
    errors.push({
      code: 'cyclicGraphRejected',
      message: `선수 관계가 순환함: ${cyclic.join(', ')}`,
      conceptIds: cyclic,
      questionIds: originalsTouching(cyclic),
    });
  }

  // 3. 문항 자체 검사 (개념 참조, 정답, 검수)
  const questionIssues = (q) => {
    const issues = [];
    const refs = [...(q.conceptIds ?? []), ...(q.choices ?? []).map((ch) => ch.misconceptionConceptId).filter(Boolean)];
    const missing = refs.filter((id) => !conceptById.has(id));
    if (missing.length) {
      issues.push({ code: 'unknownConceptRejected', message: `문항 ${q.id} 가 존재하지 않는 개념을 참조함: ${missing.join(', ')}`, conceptIds: missing });
    }
    const values = (q.choices ?? []).map((ch) => ch.value);
    if (new Set(values).size !== values.length || !values.includes(q.answer)) {
      issues.push({ code: 'invalidAnswerRejected', message: `문항 ${q.id} 의 정답이 선택지에 없거나 선택지가 중복됨` });
    }
    const review = reviewByQuestionId.get(q.id);
    if (q.contentStatus === 'approved' && !REVIEW_CHECKS.every((k) => review?.checks?.[k] === true)) {
      issues.push({ code: 'unreviewedContentRejected', message: `승인 문항 ${q.id} 의 검수 기록이 없거나 불완전함` });
    }
    return issues;
  };

  // 4. 원 기출별 보충 경로 검사
  for (const q of originals) {
    const report = (issue) => errors.push({ ...issue, questionIds: [q.id] });
    questionIssues(q).forEach(report);

    const route = routeByQuestionId.get(q.id);
    const broken = (message) => report({ code: 'brokenRouteRejected', routeId: route?.id, message });
    if (!route) {
      broken(`문항 ${q.id} 의 보충 경로가 없음`);
      continue;
    }

    const routeConceptRefs = [route.coreConceptId, ...(route.prerequisiteConceptIds ?? [])];
    const unknownRefs = routeConceptRefs.filter((id) => !conceptById.has(id));
    if (unknownRefs.length) {
      report({ code: 'unknownConceptRejected', routeId: route.id, message: `경로 ${route.id} 가 존재하지 않는 개념을 참조함: ${unknownRefs.join(', ')}`, conceptIds: unknownRefs });
    }
    if (!(q.conceptIds ?? []).includes(route.coreConceptId)) {
      broken(`경로 ${route.id} 의 핵심 개념이 문항 개념에 없음`);
    }
    // 선수 개념은 핵심 개념에서 도달 가능한 부분 그래프여야 한다
    const reachable = closure([route.coreConceptId]);
    const outside = (route.prerequisiteConceptIds ?? []).filter((id) => conceptById.has(id) && !reachable.has(id));
    if (outside.length) broken(`경로 ${route.id} 의 선수 개념이 핵심 개념의 선수 그래프 밖에 있음: ${outside.join(', ')}`);
    const allowed = new Set(routeConceptRefs);

    const checks = route.conceptCheckQuestionIds ?? [];
    if (checks.length < 1 || checks.length > MAX_CONCEPT_CHECKS) {
      broken(`경로 ${route.id} 의 개념 확인 문항 수는 1~${MAX_CONCEPT_CHECKS}개여야 함 (현재 ${checks.length})`);
    }
    const linked = (id, role) => {
      const linkedQ = questionById.get(id);
      if (!linkedQ || linkedQ.role !== role || linkedQ.contentStatus !== 'approved') {
        broken(`경로 ${route.id} 의 ${role} 문항 ${id} 가 없거나 승인되지 않음`);
        return;
      }
      questionIssues(linkedQ).forEach(report);
      if ((linkedQ.conceptIds ?? []).some((c) => conceptById.has(c) && !allowed.has(c))) {
        broken(`경로 ${route.id} 의 ${role} 문항 ${id} 가 경로 밖 개념을 다룸`);
      }
    };
    checks.forEach((id) => linked(id, 'concept_check'));
    linked(route.spareQuestionId, 'transfer_spare');

    for (const [key, stage] of ROUTE_TEMPLATE_STAGES) {
      const tpl = templateById.get(route[key]);
      if (!tpl || tpl.stage !== stage || tpl.itemCount !== STAGE_ITEM_COUNT[stage]) {
        broken(`경로 ${route.id} 의 ${key}(${route[key]}) 가 없거나 ${stage} ${STAGE_ITEM_COUNT[stage]}문항 틀이 아님`);
        continue;
      }
      const tplMissing = (tpl.conceptIds ?? []).filter((id) => !conceptById.has(id));
      if (tplMissing.length) {
        report({ code: 'unknownConceptRejected', routeId: route.id, message: `틀 ${tpl.id} 가 존재하지 않는 개념을 참조함: ${tplMissing.join(', ')}`, conceptIds: tplMissing });
      } else if (tpl.conceptIds.some((id) => !allowed.has(id))) {
        broken(`틀 ${tpl.id} 가 경로 밖 개념을 다룸`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// 승인되었고 검증 오류가 없는 원 기출 문항만 출제 가능하다.
// pending / link_only / retired 는 contentStatus 가 approved 가 아니므로 제외된다.
export function listAssignableQuestions(catalog) {
  const blocked = new Set(validateCatalog(catalog).errors.flatMap((e) => e.questionIds ?? []));
  return (catalog.questions ?? []).filter(
    (q) => q.role === 'original' && q.contentStatus === 'approved' && !blocked.has(q.id),
  );
}

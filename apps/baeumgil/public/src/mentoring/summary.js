// 멘토 대시보드용 학습 근거 요약. 모든 수치는 풀이 기록(attempts)에서 코드로 집계한다.
// buildLearnerSummary(state, learnerId, { catalog }) -> { timeline, evidence, originalStats, retryStats, transferStats, unmeasuredCount, reviewFlags }

// 요약·AI 출력 어디에도 쓰지 않는 단정적 평가 표현
export const JUDGEMENTAL_TERMS = Object.freeze([
  '찍음', '찍은', '찍었', '찍기', '과신', '의지 부족', '의지가 없', '게으', '불성실', '성의 없', '대충', '산만',
]);

const SKIPPABLE_CONCEPT_SOURCES = {
  concept_check: (route, catalog) => route.conceptCheckQuestionIds.flatMap((id) => questionById(catalog, id)?.conceptIds ?? []),
  foundation_practice: (route, catalog) => templateById(catalog, route.foundationTemplateId)?.conceptIds ?? [],
  similar_practice: (route, catalog) => templateById(catalog, route.similarTemplateId)?.conceptIds ?? [],
};

const questionById = (catalog, id) => catalog?.questions?.find((q) => q.id === id);
const templateById = (catalog, id) => catalog?.templates?.find((t) => t.id === id);
const conceptById = (catalog, id) => catalog?.concepts?.find((c) => c.id === id);

function stats(attempts) {
  const count = (r) => attempts.filter((a) => a.result === r).length;
  const correct = count('correct');
  const incorrect = count('incorrect');
  const attempted = correct + incorrect; // 모름은 분모에서 뺀다
  return { correct, incorrect, abstained: count('abstained'), attempted, rate: attempted ? correct / attempted : null };
}

export function buildLearnerSummary(state, learnerId, { catalog } = {}) {
  const assignmentLearner = new Map((state.assignments ?? []).map((a) => [a.id, a.learnerId]));
  const paths = (state.paths ?? []).filter((p) => (p.learnerId ?? assignmentLearner.get(p.assignmentId)) === learnerId);
  const pathById = new Map(paths.map((p) => [p.id, p]));
  const attempts = (state.attempts ?? []).filter((a) => a.learnerId === learnerId);

  // 풀이 기록 → 화면에 낸 문항 (경로에 남은 인스턴스, 없으면 카탈로그 문항)
  const items = new Map(paths.flatMap((p) => [...(p.pastItems ?? []), ...(p.items ?? [])]).map((i) => [i.id, i]));
  const itemOf = (a) => items.get(a.itemId) ?? questionById(catalog, a.sourceQuestionId) ?? null;
  const conceptName = (id) => conceptById(catalog, id)?.name ?? id;
  const reviewFlags = [];
  const flag = (code, extra) => reviewFlags.push({ code, ...extra });

  /* ---------- 단계별 정답률 ---------- */
  const byStage = (stage) => attempts.filter((a) => a.stage === stage);
  const originalStats = stats(byStage('original_attempt'));
  const retryStats = stats(byStage('original_retry'));

  // 독립 적용: 처음 본 문항 + 힌트·해설·멘토 도움 없음
  const excluded = { previouslySeen: 0, historyUnknown: 0, assisted: 0 };
  const independent = [];
  for (const a of byStage('transfer_check')) {
    const path = pathById.get(a.pathId);
    const assisted = a.helpUsed || a.mentorAssisted === true
      || (path?.mentorRequests ?? []).some((r) => r.stage === 'transfer_check');
    const base = { pathId: a.pathId, attemptId: a.id };
    if (a.noveltyAtPresentation === 'already_seen') {
      excluded.previouslySeen++;
      flag('transfer_previously_seen', base);
    } else if (a.noveltyAtPresentation !== 'first_seen') {
      excluded.historyUnknown++;
      flag('transfer_history_unknown', base);
    } else if (assisted) {
      excluded.assisted++;
      flag('transfer_assisted', base);
    } else {
      independent.push(a);
    }
  }
  const transferStats = { ...stats(independent), excluded };
  let unmeasuredCount = excluded.previouslySeen + excluded.historyUnknown + excluded.assisted;

  for (const p of paths) {
    if (p.transferStatus === 'not_measured') {
      unmeasuredCount++;
      flag('transfer_not_measured', { pathId: p.id, reason: p.transferUnavailableReason ?? null });
    }
    if (p.status === 'needs_mentor') flag('needs_mentor', { pathId: p.id });
    for (const stage of p.skippedStageIds ?? []) flag('stage_skipped', { pathId: p.id, stage });
    for (const o of p.overrides ?? []) flag('mentor_override', { pathId: p.id, from: o.from, to: o.to });
  }

  /* ---------- 개념 근거 ---------- */
  const direct = new Map(); // conceptId → { correct, incorrect, abstained, attemptIds }
  const inferred = new Map(); // conceptId → { sources:Set, fromMisconception:boolean }
  const skippedConcepts = new Set();

  const infer = (conceptId, source, fromMisconception) => {
    const entry = inferred.get(conceptId) ?? { sources: new Set(), fromMisconception: false };
    entry.sources.add(source);
    entry.fromMisconception ||= fromMisconception;
    inferred.set(conceptId, entry);
  };

  for (const a of attempts) {
    const item = itemOf(a);
    for (const c of item?.conceptIds ?? []) {
      const d = direct.get(c) ?? { correct: 0, incorrect: 0, abstained: 0, attemptIds: [] };
      d[a.result]++;
      d.attemptIds.push(a.id);
      direct.set(c, d);
      // 어려움이 관찰된 개념의 '직접' 선수 개념만 추정한다 (그 이상 전파하지 않음)
      if (a.result !== 'correct') {
        for (const pre of conceptById(catalog, c)?.prerequisiteIds ?? []) infer(pre, `prerequisite:${c}`, false);
      }
    }
    if (a.result === 'incorrect') {
      const misconception = item?.choices?.find((ch) => ch.id === a.choiceId)?.misconceptionConceptId;
      if (misconception) infer(misconception, `misconception:${a.id}`, true);
    }
  }
  for (const p of paths) {
    const route = catalog?.routes?.find((r) => r.id === p.routeId);
    if (!route) continue;
    for (const stage of p.skippedStageIds ?? []) {
      for (const c of SKIPPABLE_CONCEPT_SOURCES[stage]?.(route, catalog) ?? []) skippedConcepts.add(c);
    }
  }

  const conceptIds = [...new Set([...direct.keys(), ...inferred.keys(), ...skippedConcepts])].sort();
  const evidence = conceptIds.map((conceptId) => {
    const d = direct.get(conceptId);
    const inf = inferred.get(conceptId);
    const name = conceptName(conceptId);
    const reasons = [];
    let status;
    if (d) {
      const notCorrect = d.incorrect + d.abstained;
      if (d.correct > 0 && notCorrect > 0) reasons.push('mixed_results');
      else if (d.correct + d.incorrect === 0) reasons.push('insufficient');
      else if (d.incorrect === 0 && inf?.fromMisconception) reasons.push('conflicts_with_inference');
      if (skippedConcepts.has(conceptId)) reasons.push('stage_skipped');
      status = reasons.some((r) => r !== 'stage_skipped') ? 'needs_review' : 'observed';
    } else if (skippedConcepts.has(conceptId)) {
      reasons.push('stage_skipped');
      status = 'needs_review';
    } else {
      status = 'inferred';
    }
    const counts = d ? { correct: d.correct, incorrect: d.incorrect, abstained: d.abstained } : { correct: 0, incorrect: 0, abstained: 0 };
    const inferredFrom = inf ? [...inf.sources].sort() : [];
    return {
      id: `ev-${conceptId}`,
      conceptId,
      conceptName: name,
      status,
      reasons,
      counts,
      attemptIds: d ? [...d.attemptIds] : [],
      inferredFrom,
      observation: describe(status, reasons, counts, inferredFrom, conceptName),
      mentorQuestion: askMentor(status, reasons, counts, name),
    };
  });

  const timeline = attempts.map((a) => ({
    at: a.submittedAt ?? null,
    pathId: a.pathId,
    stage: a.stage,
    attemptId: a.id,
    itemId: a.itemId,
    questionId: a.sourceQuestionId ?? a.itemId,
    conceptIds: itemOf(a)?.conceptIds ?? [],
    result: a.result,
    noveltyAtPresentation: a.noveltyAtPresentation ?? null,
    helpUsed: Boolean(a.helpUsed),
    activeMs: a.activeMs ?? null,
  }));

  return { timeline, evidence, originalStats, retryStats, transferStats, unmeasuredCount, reviewFlags };
}

/* ---------- 문장: 관찰 사실과 확인 질문만 ---------- */

function describe(status, reasons, counts, inferredFrom, conceptName) {
  const total = counts.correct + counts.incorrect + counts.abstained;
  const observed = `직접 응답 ${total}회 (정답 ${counts.correct}, 오답 ${counts.incorrect}, 모름 ${counts.abstained}).`;
  if (status === 'observed') return observed;
  if (status === 'inferred') {
    const why = inferredFrom.map((s) => (s.startsWith('misconception:')
      ? '원 기출에서 고른 오답이 이 개념의 실수 유형과 일치함'
      : `'${conceptName(s.slice('prerequisite:'.length))}' 문항의 오답·모름에서 선수 개념으로 추정함`));
    return `직접 응답 기록 없음. ${[...new Set(why)].join('; ')}.`;
  }
  const notes = {
    mixed_results: '정답과 오답(또는 모름)이 함께 관찰되어 한 가지로 판단하기 어려움.',
    insufficient: '모름 응답만 있어 판단할 근거가 부족함.',
    conflicts_with_inference: '원 기출의 오답 선택지는 이 개념의 실수 유형을 가리키지만, 직접 확인 문항은 정답.',
    stage_skipped: '관련 단계를 건너뛰어 확인되지 않은 부분이 있음.',
  };
  return [total ? observed : '직접 응답 기록 없음.', ...reasons.map((r) => notes[r])].join(' ');
}

function askMentor(status, reasons, counts, name) {
  if (status === 'inferred') return `'${name}' 기초 문제 하나를 함께 풀어 보며 확인해 볼까요?`;
  if (status === 'observed') {
    return counts.incorrect > 0
      ? `'${name}' 문제를 어떤 순서로 풀었는지 말로 설명해 볼래요?`
      : `'${name}' 문제를 숫자만 바꿔도 같은 방법으로 풀 수 있을까요?`;
  }
  if (reasons.includes('conflicts_with_inference')) return `확인 문제는 맞혔는데, 원 기출에서는 '${name}'의 어느 부분이 헷갈렸을까요?`;
  if (reasons.includes('mixed_results')) return `'${name}' 문제 중 맞힌 것과 틀린 것은 무엇이 달랐을까요?`;
  if (reasons.includes('insufficient')) return `'${name}'에서 어느 부분부터 막혔는지 함께 짚어 볼까요?`;
  return `건너뛴 '${name}' 확인 문제를 수업에서 함께 풀어 볼까요?`;
}

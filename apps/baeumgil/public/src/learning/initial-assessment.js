// 첫 수업 시작점을 위한 적응형 초기 진단 (6영역, 최대 30문항). 전체 실력·개념 숙달을 확정하는 검사가 아니다.
// 출제·분기·수준 판정은 learning/diagnostic.js(검정고시 기출 기반 진단)를 그대로 쓰고,
// 여기서는 앱 상태(state.initialAssessments)에 기록·노출 이력·멘토의 시작점 확정을 연결한다.
import { fingerprintQuestion, classifyNovelty } from './exposure.js';
import { applyLearningCommand } from './engine.js';
import { startDiagnostic, submitDiagnostic, diagnosticReport, LEVELS } from './diagnostic.js';
import { listAssignableQuestions } from '../content/catalog.js';

const VERSION = 2; // 1: 고정 7문항(이전), 2: 적응형 6영역
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const validTime = at => typeof at === 'string' && !Number.isNaN(Date.parse(at));
const requireTime = at => { if (!validTime(at)) fail('invalid_time'); };
const latest = (state, learnerId) => (state.initialAssessments ?? []).filter(a => a.learnerId === learnerId && a.version === VERSION).at(-1);
const find = (state, id) => (state.initialAssessments ?? []).find(a => a.id === id && a.version === VERSION) ?? fail('initial_not_found');
const changed = (state, patch, event) => ({ ...state, ...patch, revision: (state.revision ?? 0) + 1, events: [...(state.events ?? []), event] });
const replace = (state, record, patch, event) => changed(state, { ...patch, initialAssessments: state.initialAssessments.map(a => a.id === record.id ? record : a) }, event);
const bankOf = catalog => catalog?.questions ?? fail('catalog_required');
const configOf = catalog => catalog?.diagnostic ?? fail('diagnostic_config_missing');
const questionOf = (catalog, id) => bankOf(catalog).find(q => q.id === id) ?? fail('initial_question_missing');

// 진단 문항을 학생이 앱에서 이미 봤는지 (보충 학습에서 본 기출 포함) — 본 문항은 독립 수행 근거에서 뺀다
function seenDiagnosticIds(state, learnerId, catalog) {
  const config = configOf(catalog);
  const ids = [...new Set(config.domains.flatMap(d => Object.values(d.levels).flat()))];
  return ids.filter(id => classifyNovelty(state, learnerId, fingerprintQuestion(questionOf(catalog, id))) !== 'first_seen');
}

export function startInitialAssessment(state, { learnerId, id, at } = {}, { catalog } = {}) {
  requireTime(at);
  if (!state.learners?.some(l => l.id === learnerId)) fail('learner_not_found');
  if (latest(state, learnerId)) return state;
  if (typeof id !== 'string' || !id.trim() || state.initialAssessments?.some(a => a.id === id)) fail('invalid_initial_id');
  const diagnostic = startDiagnostic(bankOf(catalog), configOf(catalog), { previouslySeen: seenDiagnosticIds(state, learnerId, catalog) });
  const record = { id, learnerId, version: VERSION, status: 'active', diagnostic, presentedQuestionIds: [], startedAt: at, completedAt: null, stopReason: null };
  return changed(state, { initialAssessments: [...(state.initialAssessments ?? []), record] }, { type: 'initialStarted', assessmentId: id });
}

export const currentInitialQuestionId = record => (record?.status === 'active' ? record.diagnostic.currentId : null);

export function presentInitialQuestion(state, { assessmentId, questionId, at } = {}, { catalog } = {}) {
  const record = find(state, assessmentId); requireTime(at);
  if (currentInitialQuestionId(record) !== questionId) fail('initial_question_order');
  if (record.presentedQuestionIds.includes(questionId)) return state;
  const q = questionOf(catalog, questionId);
  const fingerprint = fingerprintQuestion(q);
  const exposure = { id: `initial:${record.id}:${q.id}`, learnerId: record.learnerId, pathId: null, itemId: q.id, sourceQuestionId: q.id,
    stage: 'initial_assessment', fingerprint, noveltyAtPresentation: classifyNovelty(state, record.learnerId, fingerprint), presentedAt: at };
  return replace(state, { ...record, presentedQuestionIds: [...record.presentedQuestionIds, q.id] }, { exposures: [...(state.exposures ?? []), exposure] }, { type: 'initialQuestionPresented', assessmentId });
}

export function submitInitialAnswer(state, { assessmentId, questionId, choiceId = null, abstained = false, helpUsed = false, at } = {}, { catalog } = {}) {
  const record = find(state, assessmentId); requireTime(at);
  if (typeof abstained !== 'boolean' || typeof helpUsed !== 'boolean' || (abstained && choiceId !== null)) fail('invalid_initial_answer');
  const previous = record.diagnostic.attempts.find(a => a.questionId === questionId);
  if (previous) {
    if (previous.choiceId === choiceId && (previous.result === 'abstained') === abstained) return state;
    fail('initial_answer_already_recorded');
  }
  if (currentInitialQuestionId(record) !== questionId) fail('initial_question_order');
  if (!record.presentedQuestionIds.includes(questionId)) fail('initial_not_presented');
  let diagnostic;
  try {
    diagnostic = submitDiagnostic(record.diagnostic, { id: `${assessmentId}:${questionId}`, questionId, choiceId, abstained, helpUsed }, bankOf(catalog), configOf(catalog));
  } catch { fail('invalid_initial_answer'); }
  diagnostic.attempts.at(-1).answeredAt = at;
  const complete = diagnostic.status === 'completed';
  return replace(state, { ...record, diagnostic, status: complete ? 'completed' : 'active', completedAt: complete ? at : null, stopReason: complete ? diagnostic.stopReason : null }, {},
    { type: complete ? 'initialCompleted' : 'initialAnswered', assessmentId });
}

// 학생이 중간에 멈추고 지금까지의 결과를 멘토에게 넘긴다. 다시 이어서 풀 수 있다.
export function pauseInitialAssessment(state, { assessmentId, at } = {}) {
  const record = find(state, assessmentId); requireTime(at);
  if (record.status !== 'active') return state;
  if (!record.diagnostic.attempts.length) fail('initial_no_answers');
  return replace(state, { ...record, status: 'completed', completedAt: at, stopReason: 'user_paused' }, {}, { type: 'initialPaused', assessmentId });
}

export function resumeInitialAssessment(state, { assessmentId, at } = {}) {
  const record = find(state, assessmentId); requireTime(at);
  if (record.stopReason !== 'user_paused' || record.diagnostic.status !== 'active') fail('initial_not_resumable');
  if ((state.startingPoints ?? []).some(p => p.assessmentId === assessmentId)) fail('initial_lesson_already_planned');
  return replace(state, { ...record, status: 'active', completedAt: null, stopReason: null }, {}, { type: 'initialResumed', assessmentId });
}

// 시작 개념(검정고시 단원)에 맞는 첫 문제 후보: 기출 보충 경로의 단원 → 자체 제작 경로의 개념.
// 진단에서 이미 쓴 2025년 1회 진단 문항은 뒤로 미룬다 (학생이 방금 본 문제라 독립 적용 근거가 약하다).
export function initialQuestionOptions(catalog, conceptId) {
  const routeOf = new Map((catalog.routes ?? []).map(r => [r.questionId, r]));
  return listAssignableQuestions(catalog).filter(q => {
    const route = routeOf.get(q.id);
    if (!route) return false;
    if (route.kind === 'exam_pool') return `ged-${route.examUnit}` === conceptId;
    return [route.coreConceptId, ...(route.prerequisiteConceptIds ?? [])].includes(conceptId);
  }).sort((a, b) => (a.role === 'diagnostic') - (b.role === 'diagnostic')
    || (b.reference?.year ?? 0) - (a.reference?.year ?? 0) || (b.reference?.session ?? 0) - (a.reference?.session ?? 0));
}

// 단원 개념 목록 (멘토가 시작 개념을 고를 때). 기출 단원 + 자체 제작 경로 개념
export function initialConceptOptions(catalog) {
  return catalog.concepts.filter(c => initialQuestionOptions(catalog, c.id).length);
}

// 추천: 근거가 가장 약한 영역 → 그 영역에서 가장 낮은 수준의 막힌 문항 → 그 문항의 검정고시 단원
function recommend(record, report, catalog) {
  const measured = report.domains.filter(d => d.attempted);
  if (!measured.length) return null;
  const rank = d => (d.evidence === 'not_demonstrated' ? 0 : d.evidence === 'insufficient' ? 1 : 2) * 10 + d.demonstrated;
  const domain = [...measured].sort((a, b) => rank(a) - rank(b))[0];
  const routeOf = new Map((catalog.routes ?? []).map(r => [r.questionId, r]));
  const unitOf = q => routeOf.get(q.id)?.examUnit ?? (q.fallback_question_id ? routeOf.get(q.fallback_question_id)?.examUnit : null);
  const attempts = record.diagnostic.attempts.filter(a => a.domain === domain.id);
  const stuck = attempts.filter(a => a.result !== 'correct' || !a.independent).sort((a, b) => a.level - b.level);
  const pick = [...stuck, ...attempts].map(a => questionOf(catalog, a.questionId)).find(q => unitOf(q));
  const unit = pick ? unitOf(pick) : null;
  const conceptId = unit ? `ged-${unit}` : null;
  const reason = domain.evidence === 'demonstrated' && domain.demonstrated === 3
    ? '모든 영역에서 고졸 핵심 근거가 있어요. 실제 기출 적용부터 시작해 보세요.'
    : domain.evidence === 'insufficient'
      ? `‘${domain.name}’ 영역은 도움 없이 푼 응답이 부족해 판단을 보류했어요. 첫 수업에서 혼자 풀어 보며 확인해 보세요.`
      : domain.demonstrated === 0
        ? `‘${domain.name}’ 영역은 기초 문제에서도 막힌 부분이 있어요. 막힌 단원부터 함께 살펴보세요.`
        : `‘${domain.name}’ 영역은 ${LEVELS[domain.demonstrated]}까지 혼자 푼 근거가 있어요. 그다음 단계에서 막힌 단원부터 살펴보세요.`;
  return { domainId: domain.id, domainName: domain.name, conceptId, reason, questionIds: conceptId ? initialQuestionOptions(catalog, conceptId).map(q => q.id) : [] };
}

export function initialAssessmentSummary(state, learnerId, { catalog } = {}) {
  const record = latest(state, learnerId);
  if (!record) return null;
  const attempts = record.diagnostic.attempts;
  const counts = Object.fromEntries(['correct', 'incorrect', 'abstained'].map(key => [key, attempts.filter(a => a.result === key).length]));
  counts.total = attempts.length;
  counts.independentCorrect = attempts.filter(a => a.result === 'correct' && a.independent).length;
  const base = { assessmentId: record.id, status: record.status, stopReason: record.stopReason, currentQuestionId: currentInitialQuestionId(record),
    transition: record.diagnostic.transition, domainIndex: record.diagnostic.domainIndex, counts,
    startingPoint: (state.startingPoints ?? []).find(p => p.assessmentId === record.id) ?? null };
  if (!catalog?.diagnostic) return base;
  const report = diagnosticReport(record.diagnostic, bankOf(catalog), configOf(catalog));
  const entries = attempts.map(a => {
    const q = questionOf(catalog, a.questionId);
    return { questionId: a.questionId, domainName: configOf(catalog).domains.find(d => d.id === a.domain)?.name ?? a.domain, level: a.level,
      levelName: LEVELS[a.level], core: q.curriculum?.core ?? '', result: a.result, independent: a.independent, helpUsed: a.helpUsed };
  });
  return { ...base, report, entries, domainCount: configOf(catalog).domains.length, maxQuestions: configOf(catalog).maxQuestions,
    recommendation: record.status === 'completed' ? recommend(record, report, catalog) : null };
}

/** 멘토의 선택과 과제·경로 시작을 하나의 변경으로 처리한다. */
export function planInitialLesson(state, { assessmentId, learnerId = state.learnerId, mentorId = state.mentorId, conceptId, questionId, reason = '', at } = {}, { catalog, rng } = {}) {
  const record = find(state, assessmentId); requireTime(at);
  if (record.status !== 'completed') fail('initial_not_completed');
  if (record.learnerId !== learnerId || !state.learners?.some(l => l.id === learnerId)) fail('learner_mismatch');
  if (!state.mentors?.some(m => m.id === mentorId)) fail('mentor_not_found');
  if (!catalog.concepts.some(c => c.id === conceptId) || !initialQuestionOptions(catalog, conceptId).some(q => q.id === questionId)) fail('initial_question_concept_mismatch');
  if (typeof reason !== 'string' || reason.length > 1000) fail('invalid_initial_reason');
  const previous = state.startingPoints?.find(p => p.assessmentId === assessmentId);
  if (previous) {
    if (previous.conceptId === conceptId && previous.questionId === questionId && previous.mentorId === mentorId && previous.reason === reason.trim()) return state;
    fail('initial_lesson_already_planned');
  }
  const assignmentId = `initial-assignment:${assessmentId}`;
  const pathId = `initial-path:${assessmentId}`;
  if (state.assignments?.some(a => a.id === assignmentId) || state.paths?.some(p => p.id === pathId)) fail('initial_assignment_conflict');
  const assignment = { id: assignmentId, learnerId, mentorId, questionId, assignedAt: at, status: 'assigned', initialAssessmentId: assessmentId, startingConceptId: conceptId };
  const provisional = { ...state, assignments: [...(state.assignments ?? []), assignment] };
  const result = applyLearningCommand(provisional, { type: 'START_PATH', learnerId, pathId, assignmentId, at }, { catalog, rng });
  if (result.events.some(e => e.type === 'commandRejected')) fail('initial_assignment_rejected');
  const decision = { id: `initial-plan:${assessmentId}`, assessmentId, learnerId, mentorId, conceptId, questionId, assignmentId, pathId, reason: reason.trim(), confirmedAt: at };
  return changed(result.state, { startingPoints: [...(state.startingPoints ?? []), decision] }, { type: 'initialLessonPlanned', assessmentId, pathId });
}

/** 저장본의 초기 진단 기록 형태 검사 (카탈로그 없이). 이전 방식(version 1) 기록은 무시 대상으로 허용한다. */
export function validInitialRecords(state) {
  try {
    for (const a of state.initialAssessments ?? []) {
      if (a.version === 1) continue;
      if (a.version !== VERSION || !state.learners?.some(l => l.id === a.learnerId) || !validTime(a.startedAt)) return false;
      if (!['active', 'completed'].includes(a.status) || !Array.isArray(a.presentedQuestionIds)) return false;
      const d = a.diagnostic;
      if (!d || !Array.isArray(d.attempts) || !Array.isArray(d.seenBefore) || !Array.isArray(d.completedDomains)) return false;
      if (a.status === 'completed' ? !validTime(a.completedAt) : a.completedAt !== null) return false;
      if (a.status === 'active' && (d.status !== 'active' || !d.currentId)) return false;
      if (!d.attempts.every(x => a.presentedQuestionIds.includes(x.questionId) && ['correct', 'incorrect', 'abstained'].includes(x.result))) return false;
    }
    for (const p of state.startingPoints ?? []) {
      const record = state.initialAssessments?.find(a => a.id === p.assessmentId);
      if (!record || record.status !== 'completed' || record.learnerId !== p.learnerId || !state.mentors?.some(m => m.id === p.mentorId)) return false;
      if (!state.paths?.some(path => path.id === p.pathId) || !state.assignments?.some(a => a.id === p.assignmentId && a.questionId === p.questionId)) return false;
      if (typeof p.conceptId !== 'string' || typeof p.reason !== 'string' || !validTime(p.confirmedAt)) return false;
    }
    return true;
  } catch { return false; }
}

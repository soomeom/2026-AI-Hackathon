// 첫 수업 시작점을 위한 고정 7문항. 전체 실력·개념 숙달을 확정하는 검사가 아니다.
import { gradeAnswer } from './grading.js';
import { fingerprintQuestion, classifyNovelty } from './exposure.js';
import { applyLearningCommand } from './engine.js';
import { listAssignableQuestions } from '../content/catalog.js';

const VERSION = 1;
const question = (id, conceptId, prompt, values, answer) => ({
  id, kind: 'authored', conceptIds: [conceptId], prompt, answer,
  choices: values.map((value, i) => ({ id: 'abcd'[i], value })),
});
const QUESTIONS = [
  question('initial-int-add', 'c-int-addsub', '(-7) - (-4) 의 값은?', ['-11', '-3', '3', '11'], '-3'),
  question('initial-int-mul', 'c-int-mul', '(-6) × (-2) 의 값은?', ['-12', '-8', '8', '12'], '12'),
  question('initial-frac', 'c-frac-reciprocal', '3/5 ÷ 9/10 의 값은?', ['2/3', '27/50', '3/2', '6/5'], '2/3'),
  question('initial-rat', 'c-rat-calc', '(-2/3) × 3 + 5 의 값은?', ['-7', '-3', '3', '7'], '3'),
  question('initial-distribute', 'c-distribute-sign', '-2(x + 3) 을 바르게 전개한 것은?', ['-2x + 6', '-2x - 6', '2x - 6', '-2x - 3'], '-2x - 6'),
  question('initial-transpose', 'c-eq-transpose', 'x + 6 = -2 일 때, x 의 값은?', ['4', '-4', '-8', '8'], '-8'),
  question('initial-eq', 'c-eq-solve', '방정식 3(x - 1) = x + 7 의 해는?', ['2', '3', '4', '5'], '5'),
];
export const initialQuestions = () => structuredClone(QUESTIONS);
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const validTime = at => typeof at === 'string' && !Number.isNaN(Date.parse(at));
const latest = (state, learnerId) => (state.initialAssessments ?? []).filter(a => a.learnerId === learnerId).at(-1);
const find = (state, id) => (state.initialAssessments ?? []).find(a => a.id === id) ?? fail('initial_not_found');
const changed = (state, patch, event) => ({ ...state, ...patch, revision: (state.revision ?? 0) + 1, events: [...(state.events ?? []), event] });
const replace = (state, record, patch, event) => changed(state, { ...patch, initialAssessments: state.initialAssessments.map(a => a.id === record.id ? record : a) }, event);
const requireTime = at => { if (!validTime(at)) fail('invalid_time'); };

export function startInitialAssessment(state, { learnerId, id, at } = {}) {
  requireTime(at);
  if (!state.learners?.some(l => l.id === learnerId)) fail('learner_not_found');
  if (latest(state, learnerId)) return state;
  if (typeof id !== 'string' || !id.trim() || state.initialAssessments?.some(a => a.id === id)) fail('invalid_initial_id');
  const record = { id, learnerId, version: VERSION, status: 'active', questionIds: QUESTIONS.map(q => q.id), presentedQuestionIds: [], answers: [], startedAt: at, completedAt: null };
  return changed(state, { initialAssessments: [...(state.initialAssessments ?? []), record] }, { type: 'initialStarted', assessmentId: id });
}

export function presentInitialQuestion(state, { assessmentId, questionId, at } = {}) {
  const record = find(state, assessmentId); requireTime(at);
  if (record.status !== 'active' || record.questionIds[record.answers.length] !== questionId) fail('initial_question_order');
  if (record.presentedQuestionIds.includes(questionId)) return state;
  const q = QUESTIONS.find(q => q.id === questionId);
  const fingerprint = fingerprintQuestion(q);
  const exposure = { id: `initial:${record.id}:${q.id}`, learnerId: record.learnerId, pathId: null, itemId: q.id, sourceQuestionId: q.id,
    stage: 'initial_assessment', fingerprint, noveltyAtPresentation: classifyNovelty(state, record.learnerId, fingerprint), presentedAt: at };
  return replace(state, { ...record, presentedQuestionIds: [...record.presentedQuestionIds, q.id] }, { exposures: [...(state.exposures ?? []), exposure] }, { type: 'initialQuestionPresented', assessmentId });
}

export function submitInitialAnswer(state, { assessmentId, questionId, choiceId = null, abstained = false, at } = {}) {
  const record = find(state, assessmentId); requireTime(at);
  if (typeof abstained !== 'boolean' || (abstained && choiceId !== null)) fail('invalid_initial_answer');
  const previous = record.answers.find(a => a.questionId === questionId);
  if (previous) {
    if (previous.choiceId === choiceId && previous.abstained === abstained) return state;
    fail('initial_answer_already_recorded');
  }
  if (record.status !== 'active' || record.questionIds[record.answers.length] !== questionId) fail('initial_question_order');
  if (!record.presentedQuestionIds.includes(questionId)) fail('initial_not_presented');
  const result = gradeAnswer(QUESTIONS.find(q => q.id === questionId), { choiceId, abstained });
  const answers = [...record.answers, { questionId, choiceId, abstained, result, answeredAt: at }];
  const complete = answers.length === QUESTIONS.length;
  return replace(state, { ...record, answers, status: complete ? 'completed' : 'active', completedAt: complete ? at : null }, {}, { type: complete ? 'initialCompleted' : 'initialAnswered', assessmentId });
}

export function initialQuestionOptions(catalog, conceptId) {
  return listAssignableQuestions(catalog).filter(q => {
    const route = catalog.routes.find(r => r.questionId === q.id);
    return route && [route.coreConceptId, ...route.prerequisiteConceptIds].includes(conceptId);
  });
}

export function initialAssessmentSummary(state, learnerId, { catalog } = {}) {
  const record = latest(state, learnerId);
  if (!record) return null;
  const entries = QUESTIONS.map(q => {
    const answer = record.answers.find(a => a.questionId === q.id);
    return { questionId: q.id, prompt: q.prompt, conceptId: q.conceptIds[0], conceptName: catalog?.concepts.find(c => c.id === q.conceptIds[0])?.name ?? q.conceptIds[0], result: answer?.result ?? 'pending', choiceId: answer?.choiceId ?? null };
  });
  const counts = Object.fromEntries(['correct', 'incorrect', 'abstained', 'pending'].map(key => [key, entries.filter(e => e.result === key).length]));
  const candidate = entries.find(e => ['incorrect', 'abstained'].includes(e.result)) ?? entries.at(-1);
  const recommendation = record.status === 'completed' ? {
    conceptId: candidate.conceptId,
    reason: counts.incorrect + counts.abstained ? '추가 확인이 필요한 기초 개념부터 함께 살펴보세요.' : '이번에 확인한 기초를 실제 문제에 적용하며 시작점을 확인해 보세요.',
    questionIds: catalog ? initialQuestionOptions(catalog, candidate.conceptId).map(q => q.id) : [],
  } : null;
  return { assessmentId: record.id, status: record.status, entries, counts, recommendation,
    startingPoint: (state.startingPoints ?? []).find(p => p.assessmentId === record.id) ?? null };
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

/** schemaVersion 1의 새 선택 필드만 검사한다. 과거 저장본의 필드 부재는 허용한다. */
export function validInitialRecords(state) {
  try {
    for (const a of state.initialAssessments ?? []) {
      if (a.version !== VERSION || !state.learners?.some(l => l.id === a.learnerId) || !validTime(a.startedAt)) return false;
      if (JSON.stringify(a.questionIds) !== JSON.stringify(QUESTIONS.map(q => q.id))) return false;
      if (!Array.isArray(a.answers) || a.answers.length > QUESTIONS.length || !Array.isArray(a.presentedQuestionIds)) return false;
      const expectedShown = a.answers.length + (a.presentedQuestionIds.length > a.answers.length ? 1 : 0);
      if (JSON.stringify(a.presentedQuestionIds) !== JSON.stringify(a.questionIds.slice(0, expectedShown))) return false;
      if (a.status !== (a.answers.length === QUESTIONS.length ? 'completed' : 'active')) return false;
      if (a.status === 'completed' ? !validTime(a.completedAt) : a.completedAt !== null) return false;
      for (const [i, answer] of a.answers.entries()) {
        if (answer.questionId !== a.questionIds[i] || typeof answer.abstained !== 'boolean' || !validTime(answer.answeredAt)) return false;
        if (answer.abstained && answer.choiceId !== null) return false;
        if (gradeAnswer(QUESTIONS[i], answer) !== answer.result) return false;
      }
    }
    for (const p of state.startingPoints ?? []) {
      const record = state.initialAssessments?.find(a => a.id === p.assessmentId);
      if (!record || record.status !== 'completed' || record.learnerId !== p.learnerId || !state.mentors?.some(m => m.id === p.mentorId)) return false;
      if (!state.paths?.some(path => path.id === p.pathId) || !state.assignments?.some(a => a.id === p.assignmentId && a.questionId === p.questionId)) return false;
      if (!QUESTIONS.some(q => q.conceptIds.includes(p.conceptId)) || typeof p.reason !== 'string' || !validTime(p.confirmedAt)) return false;
    }
    return true;
  } catch { return false; }
}

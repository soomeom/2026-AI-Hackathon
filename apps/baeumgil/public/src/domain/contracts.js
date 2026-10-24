import { validInitialRecords } from '../learning/initial-assessment.js';
import { validAIState } from '../learning/ai-practice.js';
import {validHintUsage} from '../learning/hints.js';
import {validGoalMessages} from '../learning/weekly-goal.js';

export const SCHEMA_VERSION = 1;
const OPTIONAL_COLLECTIONS = ['initialAssessments', 'startingPoints', 'generatedPractice'];
const COLLECTIONS = ['learners', 'mentors', 'assignments', 'paths', 'attempts', 'exposures', 'evidence', 'sessions', 'logs', 'aiArtifacts', 'events', 'processedCommandIds', ...OPTIONAL_COLLECTIONS];
const IDENTIFIED = COLLECTIONS.filter(name => !['events', 'processedCommandIds'].includes(name));
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** 기존 엔진의 동적 필드를 제거하지 않는 공통 로컬 상태. */
export function createInitialState(overrides = {}) {
  return {
    schemaVersion: SCHEMA_VERSION, revision: 0, activeRole: 'mentor', historyIntegrity: 'complete',
    learnerId: 'learner-1', mentorId: 'mentor-1',
    ...Object.fromEntries(COLLECTIONS.map(name => [name, []])),
    learners: [{ id: 'learner-1', name: '하늘(가명)', schoolLevel: 'high', isDemo: true }],
    mentors: [{ id: 'mentor-1', name: '김멘토(가명)', isDemo: true }],
    ...structuredClone(overrides),
  };
}

export function validateState(value) {
  const errors = [];
  if (!plainObject(value)) return { ok: false, errors: ['state_must_be_object'] };
  if (value.schemaVersion !== SCHEMA_VERSION) errors.push('unsupported_schema');
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) errors.push('invalid_revision');
  if (!['complete', 'unknown'].includes(value.historyIntegrity)) errors.push('invalid_history_integrity');
  if (!['mentor', 'mentee'].includes(value.activeRole)) errors.push('invalid_role');
  for (const name of COLLECTIONS) {
    if (value[name] === undefined && OPTIONAL_COLLECTIONS.includes(name)) continue;
    if (!Array.isArray(value[name])) { errors.push(`${name}_must_be_array`); continue; }
    if (!IDENTIFIED.includes(name)) continue;
    const ids = new Set();
    for (const entry of value[name]) {
      if (!plainObject(entry) || typeof entry.id !== 'string' || !entry.id.trim()) errors.push(`${name}_invalid_id`);
      else if (ids.has(entry.id)) errors.push(`${name}_duplicate_id`);
      else ids.add(entry.id);
    }
  }
  if (!validInitialRecords(value)) errors.push('invalid_initial_records');
  if (!validAIState(value)) errors.push('invalid_ai_practice');
  if (!validHintUsage(value)) errors.push('invalid_hint_usage');
  if (!validGoalMessages(value)) errors.push('invalid_goal_messages');
  // 선택적 공유 안내만 추가 검증한다. 필드가 없는 이전 저장본은 그대로 유효하다.
  if (value.guardianMessages !== undefined && (!Array.isArray(value.guardianMessages) || !value.guardianMessages.every(m =>
    plainObject(m) && Array.isArray(value.learners) && value.learners.some(l=>l?.id===m.learnerId)
    && Array.isArray(value.mentors) && value.mentors.some(p=>p?.id===m.mentorId)
    && typeof m.text==='string' && Boolean(m.text.trim()) && m.text.length<=500
    && typeof m.sharedAt==='string' && !Number.isNaN(Date.parse(m.sharedAt))))) errors.push('invalid_guardian_messages');
  return { ok: errors.length === 0, errors };
}

/** AI 공급자 호출 이전의 경계 검사. 교육적 판단은 공동 검증 모듈과 멘토가 담당한다. */
export function validateAIInput(input) {
  const errors = [];
  if (!plainObject(input)) return { ok: false, errors: ['input_must_be_object'] };
  if (!['lesson_plan', 'log_narrative','hint'].includes(input.kind)) errors.push('invalid_kind');
  if(input.kind==='hint'&&(!Number.isInteger(input.facts?.hintStep)||input.facts.hintStep<1||input.facts.hintStep>3||!['catalog','generated'].includes(input.hintSource?.kind)))errors.push('invalid_hint_input');
  if (input.contractVersion !== 1) errors.push('unsupported_ai_contract');
  if (typeof input.learnerAlias !== 'string' || !input.learnerAlias.trim()) errors.push('invalid_alias');
  if (!plainObject(input.facts)) errors.push('invalid_facts');
  for (const key of ['allowedConceptIds', 'allowedQuestionIds', 'allowedEvidenceIds']) {
    if (!Array.isArray(input[key]) || input[key].length > 1000 || input[key].some(id => typeof id !== 'string' || !id.trim() || id.length > 200)) errors.push(`invalid_${key}`);
  }
  if (typeof input.note !== 'string' || input.note.length > 10000) errors.push('invalid_note');
  if (!plainObject(input.constraints) || input.constraints.language !== 'ko'
      || typeof input.constraints.forbidAffectiveStatements !== 'boolean'
      || (typeof input.note === 'string' && !input.note.trim() && !input.constraints.forbidAffectiveStatements)) errors.push('invalid_constraints');
  if (input.requestId !== null && input.requestId !== undefined && (typeof input.requestId !== 'string' || input.requestId.length > 200)) errors.push('invalid_request_id');
  if (input.inputRevision !== null && input.inputRevision !== undefined && (!Number.isSafeInteger(input.inputRevision) || input.inputRevision < 0)) errors.push('invalid_input_revision');
  return { ok: errors.length === 0, errors };
}

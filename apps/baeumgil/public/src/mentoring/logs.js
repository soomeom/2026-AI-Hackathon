import { buildLearnerSummary } from './summary.js';

export class LogError extends Error {
  constructor(code) { super(code); this.name = 'LogError'; this.code = code; }
}
const reject = code => { throw new LogError(code); };
const text = value => typeof value === 'string' ? value.trim() : '';
const findSession = (state, id) => state.sessions.find(session => session.id === id) ?? reject('session_not_found');
const latestLog = (state, sessionId) => (state.logs ?? []).filter(log => log.sessionId === sessionId).sort((a, b) => b.revision - a.revision)[0];
function dateIsValid(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function nextState(state, event) {
  const next = structuredClone(state);
  next.sessions ??= []; next.logs ??= []; next.events ??= [];
  next.revision = (next.revision ?? 0) + 1;
  next.events.push(event);
  return next;
}

/** 실제 회기는 명시적으로 입력한다. 학습 완료 이벤트만으로 만들지 않는다. */
export function saveSession(state, input) {
  if (!input || !text(input.id)) reject('session_id_required');
  if (!(state.learners ?? []).some(learner => learner.id === input.learnerId)) reject('learner_not_found');
  if (!(state.mentors ?? []).some(mentor => mentor.id === input.mentorId)) reject('mentor_not_found');
  if (!dateIsValid(input.localDate)) reject('invalid_session_date');
  const attendance = input.attendance ?? 'not_recorded';
  if (!['attended', 'absent', 'canceled', 'not_recorded'].includes(attendance)) reject('invalid_attendance');
  const actualMinutes = input.actualMinutes ?? null;
  if (actualMinutes !== null && (!Number.isSafeInteger(actualMinutes) || actualMinutes < 0)) reject('invalid_minutes');
  if (!Array.isArray(input.pathIds ?? []) || (input.pathIds ?? []).some(id => typeof id !== 'string')) reject('invalid_paths');
  const pathIds = [...new Set(input.pathIds ?? [])].sort();
  for (const id of pathIds) {
    const path = (state.paths ?? []).find(item => item.id === id) ?? reject('path_not_found');
    const learnerId = path.learnerId ?? state.assignments?.find(assignment => assignment.id === path.assignmentId)?.learnerId;
    if (learnerId !== input.learnerId) reject('path_learner_mismatch');
  }
  const previous = (state.sessions ?? []).find(session => session.id === input.id);
  if (previous && (previous.learnerId !== input.learnerId || previous.mentorId !== input.mentorId)) reject('session_identity_change');
  const data = { id: input.id, learnerId: input.learnerId, mentorId: input.mentorId, localDate: input.localDate, attendance, actualMinutes, pathIds, note: text(input.note) };
  if (previous && Object.entries(data).every(([key, value]) => JSON.stringify(previous[key]) === JSON.stringify(value))) return state;
  const session = { ...data, version: (previous?.version ?? 0) + 1 };
  const next = nextState(state, { type: 'sessionSaved', sessionId: input.id, previous: previous ? structuredClone(previous) : null, current: structuredClone(session) });
  if (previous) next.sessions[next.sessions.findIndex(item => item.id === input.id)] = session;
  else next.sessions.push(session);
  return next;
}

/** 일지 AI는 전체 학생 기록 대신 이 스냅샷을 buildAIInput에 전달한다. */
export function createSessionSnapshot(state, sessionId) {
  const session = findSession(state, sessionId);
  const pathIds = new Set(session.pathIds);
  const next = structuredClone(state);
  next.paths = (next.paths ?? []).filter(path => pathIds.has(path.id));
  next.attempts = (next.attempts ?? []).filter(attempt => pathIds.has(attempt.pathId) && attempt.learnerId === session.learnerId);
  next.exposures = (next.exposures ?? []).filter(exposure => exposure.learnerId === session.learnerId && pathIds.has(exposure.pathId));
  next.sessions = [structuredClone(session)];
  next.learners = (next.learners ?? []).filter(learner => learner.id === session.learnerId);
  next.mentors = (next.mentors ?? []).filter(mentor => mentor.id === session.mentorId);
  return next;
}

function learningSnapshot(state, sessionId) {
  const snapshot = createSessionSnapshot(state, sessionId);
  return { historyIntegrity: snapshot.historyIntegrity ?? 'unknown', paths: snapshot.paths, attempts: snapshot.attempts, exposures: snapshot.exposures };
}
function sourceMatches(state, session, log) {
  return log.sessionVersion === session.version && log.learningSnapshot !== undefined
    && JSON.stringify(log.learningSnapshot) === JSON.stringify(learningSnapshot(state, session.id));
}

export function buildLogFacts(state, sessionId, { catalog } = {}) {
  const session = findSession(state, sessionId);
  const latest = latestLog(state, sessionId);
  return {
    sessionId, learnerId: session.learnerId, localDate: session.localDate,
    attendance: session.attendance, actualMinutes: session.actualMinutes, note: session.note,
    sessionVersion: session.version, templateStatus: 'unverified',
    requiresReview: Boolean(latest && (latest.status !== 'confirmed' || !sourceMatches(state, session, latest))),
    learning: buildLearnerSummary(createSessionSnapshot(state, sessionId), session.learnerId, { catalog }),
  };
}

export function confirmLog(state, { sessionId, content, reviewed, at = new Date().toISOString() } = {}) {
  const session = findSession(state, sessionId);
  if (session.attendance !== 'attended') reject('attendance_required');
  if (!Number.isSafeInteger(session.actualMinutes) || session.actualMinutes <= 0) reject('positive_minutes_required');
  if (reviewed !== true) reject('review_required');
  if (!text(content)) reject('content_required');
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) reject('invalid_confirmation_time');
  const previous = latestLog(state, sessionId);
  if (previous?.status === 'confirmed' && sourceMatches(state, session, previous) && previous.content === text(content)) return state;
  const revision = (previous?.revision ?? 0) + 1;
  const next = nextState(state, { type: 'logConfirmed', sessionId, revision, at });
  next.logs.push({
    id: `${sessionId}:log:${revision}`, sessionId, revision, status: 'confirmed', content: text(content),
    sessionVersion: session.version, sessionSnapshot: structuredClone(session), learningSnapshot: learningSnapshot(state, sessionId), confirmedAt: at,
    supersedesId: previous?.id ?? null, reviewed: true,
  });
  return next;
}

export function retractLog(state, { sessionId, reason, at = new Date().toISOString() } = {}) {
  findSession(state, sessionId);
  if (!text(reason)) reject('retraction_reason_required');
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) reject('invalid_retraction_time');
  const previous = latestLog(state, sessionId);
  if (!previous || previous.status !== 'confirmed') reject('confirmed_log_required');
  const next = nextState(state, { type: 'logRetracted', sessionId, logId: previous.id, reason: text(reason), at });
  const log = next.logs.find(item => item.id === previous.id);
  log.status = 'retracted'; log.retractionReason = text(reason); log.retractedAt = at;
  return next;
}

export function buildMonthlyLedger(state, month) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) reject('invalid_month');
  const latestBySession = new Map();
  for (const log of state.logs ?? []) {
    const current = latestBySession.get(log.sessionId);
    if (!current || log.revision > current.revision) latestBySession.set(log.sessionId, log);
  }
  const rows = [];
  for (const log of latestBySession.values()) {
    const currentSession = (state.sessions ?? []).find(session => session.id === log.sessionId);
    const snapshot = log.sessionSnapshot;
    if (log.status !== 'confirmed' || !snapshot || !currentSession || !sourceMatches(state, currentSession, log)) continue;
    if (snapshot.localDate.slice(0, 7) !== month || snapshot.attendance !== 'attended' || snapshot.actualMinutes <= 0) continue;
    rows.push({ id: log.id, sessionId: log.sessionId, revision: log.revision, date: snapshot.localDate, learnerId: snapshot.learnerId, mentorId: snapshot.mentorId, actualMinutes: snapshot.actualMinutes, content: log.content, confirmedAt: log.confirmedAt });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
  return { month, timezone: 'Asia/Seoul', rows, totalMinutes: rows.reduce((total, row) => total + row.actualMinutes, 0), sessionCount: rows.length };
}

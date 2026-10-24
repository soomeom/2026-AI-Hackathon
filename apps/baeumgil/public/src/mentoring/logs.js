// 멘토링 회기·활동일지·월별 대장 규칙 (담당: 지훈, PRD FR-07·FR-08)
// 상태를 바꾸지 않는 순수 함수만 둔다. state.sessions / state.logs 배열을 다룬다.
// 저장은 state/persistence.js, 일지에 넣을 사실 요약은 mentoring/summary.js(다은·수영)가 만든다.

import {
  ATTENDANCE,
  ERROR_CODES,
  LOG_STATUSES,
  createId as defaultCreateId,
  fail,
  isLocalDate,
  succeed,
} from '../domain/contracts.js';

export const MENTORING_COMMANDS = Object.freeze({
  CREATE_SESSION: 'CREATE_SESSION',
  UPDATE_SESSION: 'UPDATE_SESSION',
  // 열린 초안이 있으면 고치고, 없으면 새 개정본 초안을 만든다
  SAVE_LOG_DRAFT: 'SAVE_LOG_DRAFT',
  CONFIRM_LOG: 'CONFIRM_LOG',
});

const ATTENDANCE_VALUES = new Set(Object.values(ATTENDANCE));
// note는 AI 입력(ai/contracts.js buildAIInput)이 session.note로 읽는다
const SESSION_FIELDS = ['localDate', 'attendance', 'activityMinutes', 'linkedPathIds', 'note'];
const DRAFT_FIELDS = ['factSummary', 'aiDraft', 'mentorText'];
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * @returns {{ ok: true, value: { state: object, events: object[] } } | { ok: false, error: object }}
 */
export function applyMentoringCommand(state, command, { now = () => new Date(), createId = defaultCreateId } = {}) {
  const handler = COMMAND_HANDLERS[command?.type];
  if (!handler) {
    return fail(ERROR_CODES.UNKNOWN_COMMAND);
  }
  return handler(state, command, { at: now().toISOString(), createId });
}

const COMMAND_HANDLERS = {
  [MENTORING_COMMANDS.CREATE_SESSION]: createSession,
  [MENTORING_COMMANDS.UPDATE_SESSION]: updateSession,
  [MENTORING_COMMANDS.SAVE_LOG_DRAFT]: saveLogDraft,
  [MENTORING_COMMANDS.CONFIRM_LOG]: confirmLog,
};

// 자율 학습 완료만으로 출석·활동 시간을 만들지 않는다 (AC-11): 기본값은 미기록이다
function createSession(state, command, { at, createId }) {
  const { learnerId, mentorId } = command;
  if (!isNonEmptyString(learnerId) || !isNonEmptyString(mentorId)) {
    return fail(ERROR_CODES.INVALID_COMMAND, { field: 'learnerId/mentorId' });
  }
  const fields = {
    localDate: command.localDate,
    attendance: command.attendance ?? ATTENDANCE.NOT_RECORDED,
    activityMinutes: command.activityMinutes ?? null,
    linkedPathIds: command.linkedPathIds ?? [],
    note: command.note ?? '',
  };
  const invalid = validateSessionFields(fields);
  if (invalid) {
    return invalid;
  }
  const sessionId = command.sessionId ?? createId('session');
  if (findById(state.sessions, sessionId)) {
    return fail(ERROR_CODES.INVALID_COMMAND, { field: 'sessionId', reason: 'duplicate' });
  }
  const session = {
    id: sessionId,
    learnerId,
    mentorId,
    ...fields,
    changeHistory: [],
    createdAt: at,
    updatedAt: at,
  };
  return succeed({
    state: upsert(state, 'sessions', session),
    events: [{ type: 'SESSION_CREATED', sessionId }],
  });
}

function updateSession(state, command, { at }) {
  const session = findById(state.sessions, command.sessionId);
  if (!session) {
    return fail(ERROR_CODES.SESSION_NOT_FOUND);
  }
  const { changes } = command;
  if (!isPlainObject(changes) || Object.keys(changes).some((field) => !SESSION_FIELDS.includes(field))) {
    return fail(ERROR_CODES.INVALID_COMMAND, { field: 'changes' });
  }
  const invalid = validateSessionFields(changes);
  if (invalid) {
    return invalid;
  }
  const history = Object.entries(changes)
    .filter(([field, to]) => !sameValue(session[field], to))
    .map(([field, to]) => ({ field, from: session[field], to, changedAt: at }));
  if (history.length === 0) {
    return succeed({ state, events: [] });
  }
  const updated = {
    ...session,
    ...changes,
    changeHistory: [...session.changeHistory, ...history],
    updatedAt: at,
  };
  return succeed({
    state: upsert(state, 'sessions', updated),
    events: [{ type: 'SESSION_UPDATED', sessionId: session.id, fields: history.map((entry) => entry.field) }],
  });
}

function saveLogDraft(state, command, { at, createId }) {
  const session = findById(state.sessions, command.sessionId);
  if (!session) {
    return fail(ERROR_CODES.SESSION_NOT_FOUND);
  }
  if (command.mentorText !== undefined && typeof command.mentorText !== 'string') {
    return fail(ERROR_CODES.INVALID_COMMAND, { field: 'mentorText' });
  }
  if (command.aiDraft !== undefined && command.aiDraft !== null && !isPlainObject(command.aiDraft)) {
    return fail(ERROR_CODES.INVALID_COMMAND, { field: 'aiDraft' });
  }

  const logs = logsForSession(state, session.id);
  const openDraft = logs.find((log) => log.status === LOG_STATUSES.DRAFT);
  if (openDraft) {
    const updated = { ...openDraft, ...pickDefined(command, DRAFT_FIELDS), updatedAt: at };
    return succeed({
      state: upsert(state, 'logs', updated),
      events: [{ type: 'LOG_DRAFT_SAVED', logId: updated.id, sessionId: session.id, revision: updated.revision, created: false }],
    });
  }

  // 확정 후 수정은 새 개정본으로 만든다. 이전 확정본은 그대로 보존한다 (FR-07)
  const latestConfirmed = latestConfirmedLog(logs);
  const log = {
    id: command.logId ?? createId('log'),
    sessionId: session.id,
    revision: logs.reduce((max, entry) => Math.max(max, entry.revision), 0) + 1,
    status: LOG_STATUSES.DRAFT,
    factSummary: command.factSummary ?? latestConfirmed?.factSummary ?? null,
    aiDraft: command.aiDraft ?? null,
    mentorText: command.mentorText ?? latestConfirmed?.mentorText ?? '',
    replacesLogId: latestConfirmed?.id ?? null,
    confirmed: null,
    createdAt: at,
    updatedAt: at,
  };
  if (findById(state.logs, log.id)) {
    return fail(ERROR_CODES.INVALID_COMMAND, { field: 'logId', reason: 'duplicate' });
  }
  return succeed({
    state: upsert(state, 'logs', log),
    events: [{ type: 'LOG_DRAFT_SAVED', logId: log.id, sessionId: session.id, revision: log.revision, created: true }],
  });
}

// 확정 조건: attended 출석, 양의 정수 활동 시간(분), 검토 확인 (FR-07)
function confirmLog(state, command, { at }) {
  const log = findById(state.logs, command.logId);
  if (!log) {
    return fail(ERROR_CODES.LOG_NOT_FOUND);
  }
  if (log.status !== LOG_STATUSES.DRAFT) {
    return fail(ERROR_CODES.LOG_NOT_DRAFT);
  }
  const session = findById(state.sessions, log.sessionId);
  if (!session) {
    return fail(ERROR_CODES.SESSION_NOT_FOUND);
  }
  if (session.attendance !== ATTENDANCE.ATTENDED) {
    return fail(ERROR_CODES.ATTENDANCE_NOT_ATTENDED);
  }
  if (!Number.isInteger(session.activityMinutes) || session.activityMinutes <= 0) {
    return fail(ERROR_CODES.INVALID_ACTIVITY_MINUTES);
  }
  if (command.reviewed !== true) {
    return fail(ERROR_CODES.REVIEW_REQUIRED);
  }
  if (log.mentorText.trim() === '') {
    return fail(ERROR_CODES.EMPTY_LOG_TEXT);
  }

  // 대장은 확정 시점의 회기 값으로 계산한다
  const confirmed = {
    ...log,
    status: LOG_STATUSES.CONFIRMED,
    confirmed: {
      localDate: session.localDate,
      learnerId: session.learnerId,
      mentorId: session.mentorId,
      attendance: session.attendance,
      activityMinutes: session.activityMinutes,
      confirmedAt: at,
    },
    updatedAt: at,
  };
  return succeed({
    state: upsert(state, 'logs', confirmed),
    events: [{ type: 'LOG_CONFIRMED', logId: log.id, sessionId: session.id, revision: log.revision, replacesLogId: log.replacesLogId }],
  });
}

/** 회기 화면용: 열린 초안, 최신 확정본, 전체 개정 이력 */
export function getSessionLogView(state, sessionId) {
  const revisions = logsForSession(state, sessionId);
  return {
    draft: revisions.find((log) => log.status === LOG_STATUSES.DRAFT) ?? null,
    latestConfirmed: latestConfirmedLog(revisions),
    revisions,
  };
}

/**
 * 월별 대장 (FR-08). 회기마다 최신 확정 개정본 하나만 센다.
 * 초안·미확정 회기는 빠지고, month는 회기의 한국 날짜 기준 'YYYY-MM'이다.
 */
export function buildMonthlyLedger(state, { month, mentorId } = {}) {
  if (typeof month !== 'string' || !MONTH_PATTERN.test(month)) {
    return fail(ERROR_CODES.INVALID_COMMAND, { field: 'month' });
  }
  const latestBySession = new Map();
  for (const log of state.logs ?? []) {
    if (log.status !== LOG_STATUSES.CONFIRMED) {
      continue;
    }
    const current = latestBySession.get(log.sessionId);
    if (!current || log.revision > current.revision) {
      latestBySession.set(log.sessionId, log);
    }
  }

  const rows = [];
  for (const log of latestBySession.values()) {
    const snapshot = log.confirmed;
    if (!snapshot.localDate.startsWith(`${month}-`)) {
      continue;
    }
    if (mentorId && snapshot.mentorId !== mentorId) {
      continue;
    }
    rows.push({
      sessionId: log.sessionId,
      logId: log.id,
      revision: log.revision,
      localDate: snapshot.localDate,
      learnerId: snapshot.learnerId,
      learnerName: findById(state.learners, snapshot.learnerId)?.name ?? snapshot.learnerId,
      mentorId: snapshot.mentorId,
      activityMinutes: snapshot.activityMinutes,
      content: log.mentorText,
    });
  }
  rows.sort((a, b) => a.localDate.localeCompare(b.localDate) || a.sessionId.localeCompare(b.sessionId));

  return succeed({
    month,
    rows,
    sessionCount: rows.length,
    totalMinutes: rows.reduce((sum, row) => sum + row.activityMinutes, 0),
  });
}

/** 표 붙여넣기용 탭 구분 텍스트 */
export function formatLedgerAsTsv(ledger) {
  const header = ['날짜', '멘티', '활동 시간(분)', '내용', '일지 참조'];
  const body = ledger.rows.map((row) => [
    row.localDate,
    row.learnerName,
    String(row.activityMinutes),
    row.content,
    `${row.logId} (개정 ${row.revision})`,
  ]);
  const total = ['합계', `${ledger.sessionCount}회`, String(ledger.totalMinutes), '', ''];
  return [header, ...body, total].map((cells) => cells.map(cleanCell).join('\t')).join('\n');
}

function validateSessionFields(fields) {
  if ('localDate' in fields && !isLocalDate(fields.localDate)) {
    return fail(ERROR_CODES.INVALID_LOCAL_DATE);
  }
  if ('attendance' in fields && !ATTENDANCE_VALUES.has(fields.attendance)) {
    return fail(ERROR_CODES.INVALID_COMMAND, { field: 'attendance' });
  }
  if (
    'activityMinutes' in fields &&
    fields.activityMinutes !== null &&
    !(Number.isInteger(fields.activityMinutes) && fields.activityMinutes >= 0)
  ) {
    return fail(ERROR_CODES.INVALID_ACTIVITY_MINUTES);
  }
  if ('linkedPathIds' in fields && !(Array.isArray(fields.linkedPathIds) && fields.linkedPathIds.every(isNonEmptyString))) {
    return fail(ERROR_CODES.INVALID_COMMAND, { field: 'linkedPathIds' });
  }
  if ('note' in fields && typeof fields.note !== 'string') {
    return fail(ERROR_CODES.INVALID_COMMAND, { field: 'note' });
  }
  return null;
}

function logsForSession(state, sessionId) {
  return (state.logs ?? []).filter((log) => log.sessionId === sessionId).sort((a, b) => a.revision - b.revision);
}

function latestConfirmedLog(sortedLogs) {
  return sortedLogs.filter((log) => log.status === LOG_STATUSES.CONFIRMED).at(-1) ?? null;
}

function findById(list, id) {
  return (list ?? []).find((entry) => entry.id === id) ?? null;
}

// 같은 ID가 있으면 그 자리를 바꾸고, 없으면 뒤에 붙인다
function upsert(state, collection, entity) {
  const list = state[collection] ?? [];
  const index = list.findIndex((entry) => entry.id === entity.id);
  const next = index === -1 ? [...list, entity] : list.map((entry, i) => (i === index ? entity : entry));
  return { ...state, [collection]: next };
}

function pickDefined(source, fields) {
  return Object.fromEntries(fields.filter((field) => source[field] !== undefined).map((field) => [field, source[field]]));
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function cleanCell(value) {
  return String(value).replace(/[\t\r\n]+/g, ' ').trim();
}

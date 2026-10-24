// 배움길 공통 데이터 계약 (초안, 담당: 지훈)
// 화면·학습 엔진·저장·서버가 같은 이름을 쓰도록 ID·상태·오류 형식을 한곳에 모은다.
// 값을 바꾸려면 관련 담당자와 먼저 합의한다 (팀 역할 문서 4·6절).

export const SCHEMA_VERSION = 1;
export const SEOUL_TIME_ZONE = 'Asia/Seoul';

// 시연용 대표 ID (팀 역할 문서 6절)
export const DEMO_IDS = Object.freeze({
  learner: 'learner-1',
  mentor: 'mentor-1',
  assignment: 'assignment-1',
  path: 'path-1',
});

// 학습 단계 (PRD 7절). 값은 학습 엔진(learning/engine.js)의 STAGES와 같다.
export const STAGES = Object.freeze({
  ORIGINAL_ATTEMPT: 'original_attempt',
  CONCEPT_CHECK: 'concept_check',
  FOUNDATION_PRACTICE: 'foundation_practice',
  SIMILAR_PRACTICE: 'similar_practice',
  ORIGINAL_RETRY: 'original_retry',
  TRANSFER_CHECK: 'transfer_check',
  COMPLETED: 'completed',
  NEEDS_MENTOR: 'needs_mentor',
});

// 학습 경로 상태 (path.status)
export const PATH_STATUSES = Object.freeze({
  ACTIVE: 'active',
  COMPLETED: 'completed',
  NEEDS_MENTOR: 'needs_mentor',
  PAUSED: 'paused',
});

// 새 적용 확인 상태 (path.transferStatus, PRD FR-04)
export const TRANSFER_STATUSES = Object.freeze({
  PENDING: 'pending',
  MEASURED: 'measured',
  NOT_MEASURED: 'not_measured',
});

export const ATTEMPT_RESULTS = Object.freeze({
  CORRECT: 'correct',
  INCORRECT: 'incorrect',
  ABSTAINED: 'abstained',
});

// 문항 표시 전 신규 여부 (PRD 9절 QuestionExposure)
export const EXPOSURE_NOVELTY = Object.freeze({
  FIRST_SEEN: 'first_seen',
  ALREADY_SEEN: 'already_seen',
  UNKNOWN: 'unknown',
});

export const EVIDENCE_TYPES = Object.freeze({
  OBSERVED: 'observed',
  INFERRED: 'inferred',
  NEEDS_REVIEW: 'needs_review',
});

export const CONTENT_STATUSES = Object.freeze({
  PENDING: 'pending',
  LINK_ONLY: 'link_only',
  APPROVED: 'approved',
  RETIRED: 'retired',
});

// 문항 종류 (question.kind): 이용 조건을 확인한 공식 기출만 'official', 팀 자체 제작은 'authored' (PRD 1.2)
export const QUESTION_KINDS = Object.freeze({
  OFFICIAL: 'official',
  AUTHORED: 'authored',
});

export const ATTENDANCE = Object.freeze({
  ATTENDED: 'attended',
  ABSENT: 'absent',
  CANCELED: 'canceled',
  NOT_RECORDED: 'not_recorded',
});

export const LOG_STATUSES = Object.freeze({
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
});

export const ERROR_CODES = Object.freeze({
  // 저장 (FR-09)
  STORAGE_UNAVAILABLE: 'storage_unavailable',
  STORAGE_QUOTA_EXCEEDED: 'storage_quota_exceeded',
  REVISION_CONFLICT: 'revision_conflict',
  UNSUPPORTED_SCHEMA: 'unsupported_schema',
  CORRUPTED_DATA: 'corrupted_data',
  INVALID_STATE: 'invalid_state',
  RESET_NOT_CONFIRMED: 'reset_not_confirmed',
  // 회기·일지 (FR-07)
  UNKNOWN_COMMAND: 'unknown_command',
  INVALID_COMMAND: 'invalid_command',
  INVALID_LOCAL_DATE: 'invalid_local_date',
  SESSION_NOT_FOUND: 'session_not_found',
  LOG_NOT_FOUND: 'log_not_found',
  LOG_NOT_DRAFT: 'log_not_draft',
  ATTENDANCE_NOT_ATTENDED: 'attendance_not_attended',
  INVALID_ACTIVITY_MINUTES: 'invalid_activity_minutes',
  REVIEW_REQUIRED: 'review_required',
  EMPTY_LOG_TEXT: 'empty_log_text',
  // AI (PRD 10.2)
  INVALID_REQUEST: 'invalid_request',
  AI_NOT_CONFIGURED: 'ai_not_configured',
  AI_TIMEOUT: 'ai_timeout',
  AI_RATE_LIMITED: 'ai_rate_limited',
  AI_PROVIDER_ERROR: 'ai_provider_error',
  AI_INVALID_OUTPUT: 'ai_invalid_output',
  AI_CANCELED: 'ai_canceled',
});

// 화면에 그대로 보여 줄 수 있는 기본 문구. 화면 문구는 FE가 바꿔도 된다.
export const ERROR_MESSAGES = Object.freeze({
  storage_unavailable: '이 브라우저에 저장하지 못했어요.',
  storage_quota_exceeded: '이 브라우저에 저장하지 못했어요. 저장 공간이 부족해요.',
  revision_conflict: '다른 곳에서 먼저 바뀐 기록이 있어요. 최신 기록을 다시 불러와 주세요.',
  unsupported_schema: '이 버전에서 읽을 수 없는 저장 기록이 있어요. 기존 기록은 그대로 두었어요.',
  corrupted_data: '저장된 기록을 읽지 못했어요. 기존 기록은 그대로 두었어요.',
  invalid_state: '저장할 수 없는 형식의 기록이에요.',
  reset_not_confirmed: '시연 데이터 초기화는 확인을 받은 뒤에만 할 수 있어요.',
  unknown_command: '알 수 없는 요청이에요.',
  invalid_command: '요청 내용이 올바르지 않아요.',
  invalid_local_date: '회기 날짜 형식이 올바르지 않아요.',
  session_not_found: '회기 기록을 찾을 수 없어요.',
  log_not_found: '활동일지를 찾을 수 없어요.',
  log_not_draft: '이미 확정된 일지예요. 수정하려면 새 개정본을 만들어 주세요.',
  attendance_not_attended: '출석한 회기만 확정할 수 있어요.',
  invalid_activity_minutes: '실제 활동 시간(분)을 1 이상의 정수로 입력해 주세요.',
  review_required: '작성 내용을 검토했다는 확인이 필요해요.',
  empty_log_text: '일지 내용을 입력해 주세요.',
  invalid_request: 'AI 요청 형식이 올바르지 않아요.',
  ai_not_configured: 'AI 키가 서버에 설정되지 않았어요.',
  ai_timeout: 'AI 응답이 15초 안에 오지 않았어요. 다시 시도하거나 직접 작성해 주세요.',
  ai_rate_limited: 'AI 무료 호출 한도를 넘었어요. 잠시 뒤 다시 시도하거나 직접 작성해 주세요.',
  ai_provider_error: 'AI 서비스에서 오류가 났어요. 다시 시도하거나 직접 작성해 주세요.',
  ai_invalid_output: 'AI 응답 형식이 올바르지 않아 사용하지 않았어요.',
  ai_canceled: 'AI 요청을 취소했어요.',
});

// 모든 담당 모듈이 쓰는 결과 형식: { ok: true, value } | { ok: false, error: { code, message } }
export function succeed(value) {
  return { ok: true, value };
}

export function fail(code, detail = {}) {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] ?? code, ...detail } };
}

export function createId(prefix) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

// 저장되는 앱 전체 기록. 학습 엔진·요약·AI 입력이 읽는 모양 그대로이며, 각 컬렉션은 배열이다.
// 엔진이 processedCommandIds, historyIntegrity 같은 필드를 더 붙일 수 있다.
export function createEmptyAppState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    savedAt: null,
    learnerId: null, // 지금 시연 중인 학생
    mentorId: null,
    learners: [], // { id, name, schoolLevel, goal, isDemo }
    mentors: [], // { id, name, isDemo }
    assignments: [], // { id, learnerId, mentorId, questionId, status, assignedAt }
    paths: [], // 학습 경로 (learning/engine.js)
    attempts: [], // 풀이 기록 (learning/engine.js)
    exposures: [], // 문항 노출 기록 (learning/engine.js)
    sessions: [], // 실제 멘토링 회기 (mentoring/logs.js)
    logs: [], // 활동일지 개정본 (mentoring/logs.js)
    aiArtifacts: [], // AI 결과와 채택 여부
  };
}

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value) {
  if (typeof value !== 'string' || !LOCAL_DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

// 회기 날짜·월별 집계 기준 (PRD 1.2: Asia/Seoul)
export function toSeoulLocalDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

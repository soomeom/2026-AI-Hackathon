// 브라우저 저장 어댑터 (담당: 지훈, PRD FR-09)
// 화면·엔진은 localStorage를 직접 쓰지 않고 이 모듈만 사용한다.
// 모든 함수는 Promise를 돌려준다. 나중에 서버 저장(/api/state)으로 바꿔도 호출 방식과 결과 형식은 그대로다.

import {
  ERROR_CODES,
  SCHEMA_VERSION,
  createEmptyAppState,
  fail,
  succeed,
} from '../domain/contracts.js';

export const STORAGE_KEY = 'baeumgil:app-state';

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // 일부 브라우저는 저장소 접근 자체를 막으면 예외를 던진다
    return null;
  }
}

function isQuotaError(error) {
  return (
    error?.name === 'QuotaExceededError' ||
    error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error?.code === 22 ||
    error?.code === 1014
  );
}

function parseStoredState(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return fail(ERROR_CODES.CORRUPTED_DATA);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return fail(ERROR_CODES.CORRUPTED_DATA);
  }
  if (data.schemaVersion !== SCHEMA_VERSION) {
    return typeof data.schemaVersion === 'number'
      ? fail(ERROR_CODES.UNSUPPORTED_SCHEMA, { storedSchemaVersion: data.schemaVersion })
      : fail(ERROR_CODES.CORRUPTED_DATA);
  }
  if (!Number.isInteger(data.revision) || data.revision < 0) {
    return fail(ERROR_CODES.CORRUPTED_DATA);
  }
  return succeed(data);
}

function isSavableState(state) {
  return (
    state !== null &&
    typeof state === 'object' &&
    state.schemaVersion === SCHEMA_VERSION &&
    Number.isInteger(state.revision) &&
    state.revision >= 0
  );
}

/**
 * @param {object} [options]
 * @param {Storage|null} [options.storage] 생략하면 브라우저 localStorage, 테스트에서는 가짜 저장소를 넣는다
 * @param {string} [options.key]
 * @param {() => Date} [options.now]
 */
export function createPersistence({ storage = defaultStorage(), key = STORAGE_KEY, now = () => new Date() } = {}) {
  function readRaw() {
    if (!storage) {
      return fail(ERROR_CODES.STORAGE_UNAVAILABLE);
    }
    try {
      return succeed(storage.getItem(key));
    } catch {
      return fail(ERROR_CODES.STORAGE_UNAVAILABLE);
    }
  }

  function writeRaw(serialized) {
    try {
      storage.setItem(key, serialized);
      return succeed(null);
    } catch (error) {
      return fail(isQuotaError(error) ? ERROR_CODES.STORAGE_QUOTA_EXCEEDED : ERROR_CODES.STORAGE_UNAVAILABLE);
    }
  }

  /**
   * 새로고침 뒤 마지막 저장 상태를 읽는다.
   * 저장된 기록이 없으면 빈 상태를 돌려주고, 읽을 수 없는 기록은 오류로 알린다(지우지 않음).
   */
  async function load() {
    const raw = readRaw();
    if (!raw.ok) {
      return raw;
    }
    if (raw.value === null) {
      return succeed({ state: createEmptyAppState(), source: 'empty' });
    }
    const parsed = parseStoredState(raw.value);
    if (!parsed.ok) {
      return parsed;
    }
    return succeed({ state: parsed.value, source: 'stored' });
  }

  /**
   * state.revision은 마지막으로 load/save해서 받은 값이어야 한다.
   * 성공하면 revision이 1 오른 state를 돌려주므로, 이후에는 반환된 state를 써야 한다.
   */
  async function save(state) {
    if (!isSavableState(state)) {
      return fail(ERROR_CODES.INVALID_STATE);
    }
    const raw = readRaw();
    if (!raw.ok) {
      return raw;
    }
    let storedRevision = 0;
    if (raw.value !== null) {
      const stored = parseStoredState(raw.value);
      if (!stored.ok) {
        // 읽을 수 없는 기록을 조용히 덮어쓰지 않는다
        return stored;
      }
      storedRevision = stored.value.revision;
    }
    if (state.revision !== storedRevision) {
      return fail(ERROR_CODES.REVISION_CONFLICT, { storedRevision, expectedRevision: state.revision });
    }

    const next = { ...state, revision: storedRevision + 1, savedAt: now().toISOString() };
    let serialized;
    try {
      serialized = JSON.stringify(next);
    } catch {
      return fail(ERROR_CODES.INVALID_STATE);
    }
    const written = writeRaw(serialized);
    if (!written.ok) {
      return written;
    }
    return succeed({ state: next });
  }

  /**
   * 시연 데이터 초기화. 화면에서 사용자가 명시적으로 확인한 뒤 confirmed: true로 호출한다.
   * initialState를 주면 그 상태로 다시 시작한다.
   */
  async function reset({ confirmed = false, initialState = createEmptyAppState() } = {}) {
    if (confirmed !== true) {
      return fail(ERROR_CODES.RESET_NOT_CONFIRMED);
    }
    if (!storage) {
      return fail(ERROR_CODES.STORAGE_UNAVAILABLE);
    }
    const fresh = { ...initialState, schemaVersion: SCHEMA_VERSION, revision: 0, savedAt: now().toISOString() };
    const written = writeRaw(JSON.stringify(fresh));
    if (!written.ok) {
      return written;
    }
    return succeed({ state: fresh });
  }

  // 읽을 수 없는 기록을 내려받아 보관할 수 있도록 원문을 그대로 돌려준다
  async function backupRaw() {
    return readRaw();
  }

  return { load, save, reset, backupRaw };
}

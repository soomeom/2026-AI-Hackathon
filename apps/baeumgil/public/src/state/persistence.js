import { validateState } from '../domain/contracts.js';
import { restoreAIState } from '../learning/ai-practice.js';

export const STORAGE_KEY = 'baeumgil:mvp:v1';

export function loadState(storage) {
  let raw;
  try { raw = storage.getItem(STORAGE_KEY); }
  catch { return { status: 'recovery_required', state: null, raw: null, reason: 'storage_unavailable' }; }
  if (raw === null) return { status: 'empty', state: null, raw: null, reason: null };
  let state;
  try { state = JSON.parse(raw); }
  catch { return { status: 'recovery_required', state: null, raw, reason: 'invalid_json' }; }
  state = restoreAIState(state);
  const validation = validateState(state);
  if (!validation.ok) return { status: 'recovery_required', state: null, raw, reason: validation.errors.includes('unsupported_schema') ? 'unsupported_schema' : 'invalid_state' };
  return { status: 'ready', state, raw: null, reason: null };
}

/** 낙관적 revision 검사. 호출자는 변경된 상태의 revision을 직접 증가시킨다. */
export function saveState(storage, state, expectedRevision) {
  if (!validateState(state).ok) return { ok: false, reason: 'invalid_state' };
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return { ok: false, reason: 'invalid_revision' };
  const current = loadState(storage);
  if (current.status === 'recovery_required') return { ok: false, reason: current.reason };
  if ((current.state?.revision ?? 0) !== expectedRevision) return { ok: false, reason: 'conflict' };
  if (state.revision <= expectedRevision) return { ok: false, reason: 'revision_not_advanced' };
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { return { ok: false, reason: 'storage_unavailable' }; }
  return { ok: true, reason: null, revision: state.revision };
}

export function resetState(storage, { confirmed = false, expectedRevision } = {}) {
  if (confirmed !== true) return { ok: false, reason: 'confirmation_required' };
  if (expectedRevision !== undefined) {
    const current = loadState(storage);
    if (current.status === 'recovery_required') return { ok: false, reason: current.reason };
    if ((current.state?.revision ?? 0) !== expectedRevision) return { ok: false, reason: 'conflict' };
  }
  try { storage.removeItem(STORAGE_KEY); }
  catch { return { ok: false, reason: 'storage_unavailable' }; }
  return { ok: true, reason: null };
}

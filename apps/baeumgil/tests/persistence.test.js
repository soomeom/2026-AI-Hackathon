import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../public/src/domain/contracts.js';
import { STORAGE_KEY, loadState, saveState, resetState } from '../public/src/state/persistence.js';

function storage(initialRaw = null, options = {}) {
  let raw = initialRaw;
  return {
    getItem(key) { assert.equal(key, STORAGE_KEY); if (options.failRead) throw new Error('blocked'); return raw; },
    setItem(key, value) { assert.equal(key, STORAGE_KEY); if (options.failWrite) throw new Error('quota'); raw = value; },
    removeItem() { if (options.failWrite) throw new Error('blocked'); raw = null; },
  };
}

test('첫 저장과 다시 읽기에서 미제출 노출·경로·도움·메모를 보존한다', () => {
  const target = storage();
  assert.equal(loadState(target).status, 'empty');
  const state = createInitialState({ revision: 1, exposures: [{ id: 'seen-1', fingerprint: 'same-question' }], paths: [{ id: 'path-1', status: 'paused', items: [{ id: 'item-1', helpUsed: true }] }], sessions: [{ id: 'session-1', note: '풀이 메모' }] });
  assert.equal(saveState(target, state, 0).ok, true);
  const loaded = loadState(target);
  assert.equal(loaded.status, 'ready');
  assert.deepEqual(loaded.state, state);
  assert.equal(state.revision, 1);
});

test('이전 revision으로 저장하면 충돌을 반환하고 최신 값을 덮어쓰지 않는다', () => {
  const target = storage();
  assert.equal(saveState(target, createInitialState({ revision: 1 }), 0).ok, true);
  assert.equal(saveState(target, createInitialState({ revision: 2 }), 0).reason, 'conflict');
  assert.equal(loadState(target).state.revision, 1);
  assert.equal(saveState(target, createInitialState({ revision: 1 }), 1).reason, 'revision_not_advanced');
  assert.equal(saveState(target, createInitialState({ revision: 2 }), 1).ok, true);
});

test('손상·다른 버전 데이터는 원문을 보존하고 자동 초기화하거나 덮어쓰지 않는다', () => {
  for (const raw of ['{broken', JSON.stringify({ ...createInitialState(), schemaVersion: 99 })]) {
    const target = storage(raw);
    const result = loadState(target);
    assert.equal(result.status, 'recovery_required');
    assert.equal(result.raw, raw);
    assert.equal(result.state, null);
    assert.equal(saveState(target, createInitialState({ revision: 1 }), 0).ok, false);
    assert.equal(target.getItem(STORAGE_KEY), raw);
  }
});

test('저장 공간·읽기 실패를 성공으로 표시하지 않고 입력 상태를 변경하지 않는다', () => {
  const state = createInitialState({ revision: 1 });
  assert.equal(saveState(storage(null, { failWrite: true }), state, 0).reason, 'storage_unavailable');
  assert.equal(loadState(storage(null, { failRead: true })).status, 'recovery_required');
  assert.equal(state.revision, 1);
  assert.equal(state.historyIntegrity, 'complete');
});

test('명시적 초기화 확인이 없거나 revision이 달라지면 데이터 삭제를 거부한다', () => {
  const target = storage(JSON.stringify(createInitialState({ revision: 3 })));
  assert.equal(resetState(target, { confirmed: false }).ok, false);
  assert.equal(resetState(target, { confirmed: true, expectedRevision: 2 }).reason, 'conflict');
  assert.equal(loadState(target).state.revision, 3);
  assert.equal(resetState(target, { confirmed: true, expectedRevision: 3 }).ok, true);
  assert.equal(loadState(target).status, 'empty');
});

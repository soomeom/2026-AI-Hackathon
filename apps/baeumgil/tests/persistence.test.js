import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ERROR_CODES, createEmptyAppState } from '../public/src/domain/contracts.js';
import { createDemoAppState } from '../public/src/domain/seed.js';
import { STORAGE_KEY, createPersistence } from '../public/src/state/persistence.js';
import { MemoryStorage } from './memory-storage.js';

const fixedNow = () => new Date('2026-10-24T05:00:00.000Z');

test('저장된 기록이 없으면 빈 상태를 돌려준다', async () => {
  const persistence = createPersistence({ storage: new MemoryStorage(), now: fixedNow });
  const result = await persistence.load();
  assert.equal(result.ok, true);
  assert.equal(result.value.source, 'empty');
  assert.equal(result.value.state.revision, 0);
  assert.deepEqual(result.value.state.paths, []);
});

test('저장한 기록을 새로고침 뒤 그대로 다시 읽는다', async () => {
  const storage = new MemoryStorage();
  const persistence = createPersistence({ storage, now: fixedNow });
  const saved = await persistence.save(createDemoAppState());
  assert.equal(saved.ok, true);
  assert.equal(saved.value.state.revision, 1);
  assert.equal(saved.value.state.savedAt, '2026-10-24T05:00:00.000Z');

  const reloaded = await createPersistence({ storage, now: fixedNow }).load();
  assert.equal(reloaded.value.source, 'stored');
  assert.deepEqual(reloaded.value.state, saved.value.state);
});

test('오래된 revision으로 저장하면 충돌로 거부하고 기존 기록을 유지한다', async () => {
  const storage = new MemoryStorage();
  const persistence = createPersistence({ storage, now: fixedNow });
  const first = await persistence.save(createEmptyAppState());
  const second = await persistence.save(first.value.state);
  assert.equal(second.ok, true);

  const stale = await persistence.save(first.value.state);
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, ERROR_CODES.REVISION_CONFLICT);
  assert.equal(stale.error.storedRevision, 2);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).revision, 2);
});

test('손상된 기록은 읽기·저장 모두 오류로 알리고 덮어쓰지 않는다', async () => {
  const storage = new MemoryStorage({ [STORAGE_KEY]: '{not json' });
  const persistence = createPersistence({ storage, now: fixedNow });

  assert.equal((await persistence.load()).error.code, ERROR_CODES.CORRUPTED_DATA);
  assert.equal((await persistence.save(createEmptyAppState())).error.code, ERROR_CODES.CORRUPTED_DATA);
  assert.equal(storage.getItem(STORAGE_KEY), '{not json');
  assert.equal((await persistence.backupRaw()).value, '{not json');
});

test('읽을 수 없는 스키마 버전은 덮어쓰지 않는다', async () => {
  const raw = JSON.stringify({ schemaVersion: 99, revision: 3 });
  const storage = new MemoryStorage({ [STORAGE_KEY]: raw });
  const persistence = createPersistence({ storage, now: fixedNow });

  const loaded = await persistence.load();
  assert.equal(loaded.error.code, ERROR_CODES.UNSUPPORTED_SCHEMA);
  assert.equal(loaded.error.storedSchemaVersion, 99);
  assert.equal((await persistence.save(createEmptyAppState())).error.code, ERROR_CODES.UNSUPPORTED_SCHEMA);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});

test('저장 공간이 부족하면 저장 실패 문구와 함께 실패를 돌려준다', async () => {
  const storage = new MemoryStorage();
  storage.setItem = () => {
    throw new DOMException('full', 'QuotaExceededError');
  };
  const result = await createPersistence({ storage, now: fixedNow }).save(createEmptyAppState());
  assert.equal(result.ok, false);
  assert.equal(result.error.code, ERROR_CODES.STORAGE_QUOTA_EXCEEDED);
  assert.match(result.error.message, /이 브라우저에 저장하지 못했어요/);
});

test('저장소에 접근할 수 없으면 storage_unavailable을 돌려준다', async () => {
  const blocked = {
    getItem() {
      throw new DOMException('denied', 'SecurityError');
    },
  };
  assert.equal((await createPersistence({ storage: blocked }).load()).error.code, ERROR_CODES.STORAGE_UNAVAILABLE);
  assert.equal((await createPersistence({ storage: null }).save(createEmptyAppState())).error.code, ERROR_CODES.STORAGE_UNAVAILABLE);
});

test('형식이 맞지 않는 상태는 저장하지 않는다', async () => {
  const persistence = createPersistence({ storage: new MemoryStorage(), now: fixedNow });
  assert.equal((await persistence.save({ revision: 0 })).error.code, ERROR_CODES.INVALID_STATE);
  assert.equal((await persistence.save(null)).error.code, ERROR_CODES.INVALID_STATE);
});

test('시연 초기화는 확인 없이는 실행하지 않는다', async () => {
  const storage = new MemoryStorage();
  const persistence = createPersistence({ storage, now: fixedNow });
  await persistence.save(createDemoAppState());

  const refused = await persistence.reset();
  assert.equal(refused.error.code, ERROR_CODES.RESET_NOT_CONFIRMED);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).revision, 1);
});

test('확인을 받은 초기화는 손상 기록도 새 시연 상태로 바꾼다', async () => {
  const storage = new MemoryStorage({ [STORAGE_KEY]: '{not json' });
  const persistence = createPersistence({ storage, now: fixedNow });

  const reset = await persistence.reset({ confirmed: true, initialState: createDemoAppState() });
  assert.equal(reset.ok, true);
  assert.equal(reset.value.state.revision, 0);

  const loaded = await persistence.load();
  assert.equal(loaded.ok, true);
  assert.equal(loaded.value.state.learners[0].name, '하늘');
  assert.equal((await persistence.save(loaded.value.state)).value.state.revision, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createDemoState } from '../public/src/state/store.js';
import { makeCatalog } from './fixtures.js';

const catalog = makeCatalog();
const clock = (start = Date.parse('2026-10-24T05:00:00Z')) => {
  let t = start;
  return { now: () => new Date(t).toISOString(), advance: (ms) => { t += ms; } };
};
const setup = () => {
  const c = clock();
  const store = createStore({ initialState: createDemoState(), catalog, rng: () => 0.25, now: c.now });
  const pathId = store.assignQuestion({ questionId: 'q-eq-1' });
  return { store, pathId, clock: c };
};
const pathOf = (store, id) => store.getState().paths.find((p) => p.id === id);

test('문항을 지정하면 과제와 경로가 생기고 기출 풀이 단계에서 시작한다', () => {
  const { store, pathId } = setup();
  const state = store.getState();
  assert.equal(state.assignments.length, 1);
  assert.equal(state.assignments[0].questionId, 'q-eq-1');
  assert.equal(pathOf(store, pathId).stage, 'original_attempt');
  // 같은 문항을 다시 지정하면 이전 경로를 덮어쓰지 않고 새 경로를 만든다
  const second = store.assignQuestion({ questionId: 'q-eq-1' });
  assert.notEqual(second, pathId);
  assert.equal(store.getState().paths.length, 2);
});

test('rerenderDoesNotPresentTwice', () => {
  const { store, pathId } = setup();
  const itemId = pathOf(store, pathId).items[0].id;
  store.dispatch({ type: 'PRESENT_QUESTION', pathId, itemId });
  const before = store.getState().exposures.length;
  store.dispatch({ type: 'PRESENT_QUESTION', pathId, itemId });
  assert.equal(store.getState().exposures.length, before);
});

test('거부된 명령은 상태와 revision 을 바꾸지 않고 구독자에게 알리지 않는다', () => {
  const { store, pathId } = setup();
  let calls = 0;
  store.subscribe(() => calls++);
  const before = store.getState();
  const events = store.dispatch({ type: 'ADVANCE', pathId });
  assert.equal(events[0].type, 'commandRejected');
  assert.equal(store.getState(), before);
  assert.equal(calls, 0);
});

test('같은 명령 ID 를 두 번 보내도 한 번만 반영된다 (버튼 연타)', () => {
  const { store, pathId } = setup();
  const item = pathOf(store, pathId).items[0];
  store.dispatch({ type: 'PRESENT_QUESTION', pathId, itemId: item.id });
  const submit = { id: 'click-1', type: 'SUBMIT_ANSWER', pathId, itemId: item.id, submissionId: 'sub-1', choiceId: 'c' };
  store.dispatch(submit);
  const revision = store.getState().revision;
  store.dispatch(submit);
  assert.equal(store.getState().attempts.length, 1);
  assert.equal(store.getState().revision, revision);
});

test('hiddenTabStopsActiveTime', () => {
  const { store, pathId, clock: c } = setup();
  const item = pathOf(store, pathId).items[0];
  store.dispatch({ type: 'PRESENT_QUESTION', pathId, itemId: item.id });
  c.advance(10_000);
  store.dispatch({ type: 'SET_VISIBILITY', pathId, visible: false });
  c.advance(60_000);
  store.dispatch({ type: 'SET_VISIBILITY', pathId, visible: true });
  c.advance(10_000);
  store.dispatch({ type: 'SUBMIT_ANSWER', pathId, itemId: item.id, submissionId: 'sub-1', choiceId: 'c' });
  assert.equal(store.getState().attempts[0].activeMs, 20_000);
});

test('변경될 때마다 revision 이 오르고 구독자가 새 상태와 이벤트를 받는다', () => {
  const { store, pathId } = setup();
  const seen = [];
  store.subscribe((state, events) => seen.push([state.revision, events[0].type]));
  const revision = store.getState().revision;
  const itemId = pathOf(store, pathId).items[0].id;
  store.dispatch({ type: 'PRESENT_QUESTION', pathId, itemId });
  assert.deepEqual(seen, [[revision + 1, 'questionPresented']]);
});

test('replaceState 로 저장본을 불러오면 그대로 이어서 진행한다', () => {
  const { store, pathId } = setup();
  const saved = structuredClone(store.getState());
  const other = createStore({ initialState: createDemoState(), catalog, rng: () => 0.25 });
  other.replaceState(saved);
  assert.equal(pathOf(other, pathId).stage, 'original_attempt');
  const itemId = pathOf(other, pathId).items[0].id;
  assert.equal(other.dispatch({ type: 'PRESENT_QUESTION', pathId, itemId })[0].type, 'questionPresented');
});

test('화면 상태는 공통 계약을 통과하고 변경마다 저장할 수 있다', async () => {
  const { validateState } = await import('../public/src/domain/contracts.js');
  const { saveState, loadState } = await import('../public/src/state/persistence.js');
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const store = createStore({ initialState: createDemoState(), catalog, rng: () => 0.25 });
  assert.deepEqual(validateState(store.getState()).errors, []);
  let saved = 0;
  store.subscribe((state) => {
    const result = saveState(storage, state, saved);
    assert.equal(result.ok, true, result.reason);
    saved = state.revision;
  });
  const pathId = store.assignQuestion({ questionId: 'q-rat-1' });
  store.dispatch({ type: 'PRESENT_QUESTION', pathId, itemId: pathOf(store, pathId).items[0].id });
  const loaded = loadState(storage);
  assert.equal(loaded.status, 'ready');
  assert.equal(loaded.state.revision, store.getState().revision);
  assert.equal(loaded.state.exposures.length, 1);
});

test('update 는 엔진 밖 변경(회기 저장 등)을 반영하고 revision 을 한 번만 올린다', async () => {
  const { saveSession } = await import('../public/src/mentoring/logs.js');
  const { store, pathId } = setup();
  const before = store.getState().revision;
  store.update((s) => saveSession(s, { id: 'session-1', learnerId: 'learner-1', mentorId: 'mentor-1', localDate: '2026-10-24', attendance: 'attended', actualMinutes: 40, pathIds: [pathId], note: '' }));
  assert.equal(store.getState().revision, before + 1);
  assert.equal(store.getState().sessions.length, 1);
  store.update((s) => ({ ...s, aiArtifacts: [{ id: 'ai-1' }] }));
  assert.equal(store.getState().revision, before + 2);
});

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

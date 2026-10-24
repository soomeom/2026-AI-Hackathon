import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeCatalogParts } from '../public/src/content/catalog.js';
import { makeCatalog } from './fixtures.js';
import { createDemoState, createStore } from '../public/src/state/store.js';
import { saveSession, confirmLog } from '../public/src/mentoring/logs.js';
import { STORAGE_KEY } from '../public/src/state/persistence.js';
import { DEMO_SESSION_KEY } from '../public/src/state/demo-session.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
};
const click = (node, dataset = {}) => {
  const event = { target: { closest: () => ({ dataset, disabled: false }) } };
  if (node.onclick) node.onclick(event);
  for (const listener of node.listeners.click ?? []) listener(event);
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const enterMath = (h, role) => {
  click(h.app, { enterRole: role });
  assert.match(h.app.innerHTML, /어떤 과목을 함께 배울까요/);
  click(h.app, { subjectId: 'math' });
};
let bootId = 0;

// DOM 경계만 대체하고 app.js와 실제 저장·학습·화면 코드를 실행한다.
async function boot(t, { saved, local = memoryStorage(), tab = memoryStorage(), confirm = () => true, catalog = makeCatalog() } = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      id, innerHTML: '', textContent: '', hidden: false, value: '', listeners: {}, fields: [],
      classList: { toggle() {} }, setAttribute() {}, focus() {},
      addEventListener(event, handler) { (this.listeners[event] ??= []).push(handler); },
      querySelectorAll() { return this.fields; }, querySelector(selector) { return node(selector.slice(1)); },
    });
    return nodes.get(id);
  };
  if (saved) local.setItem(STORAGE_KEY, JSON.stringify(saved));
  const original = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch };
  globalThis.document = { hidden: false, getElementById: node, querySelector: () => node('legacy-roles'), querySelectorAll: () => [], addEventListener() {} };
  globalThis.window = { localStorage: local, sessionStorage: tab, confirm, addEventListener() {}, location: { reload() {} } };
  globalThis.fetch = async url => ({ ok: true, json: async () => url === '/api/health'
    ? { ai: { configured: false } }
    : url.includes('exam-bank') ? {} : catalog });
  t.after(() => { Object.assign(globalThis, original); });
  await import(`../public/app.js?demo-entry-test=${++bootId}`);
  await tick();
  return { node, app: node('app'), local, tab, saved: () => JSON.parse(local.getItem(STORAGE_KEY)) };
}

function seeded() {
  const store = createStore({ initialState: createDemoState(), catalog: makeCatalog() });
  store.assignQuestion({ questionId: 'q-eq-1' });
  let state = saveSession(store.getState(), { id: 'session-1', learnerId: 'learner-1', mentorId: 'mentor-1', localDate: '2026-10-24', attendance: 'attended', actualMinutes: 40, pathIds: [], note: '기존 회기' });
  return confirmLog(state, { sessionId: 'session-1', content: '기존 확정 일지', reviewed: true });
}

test('real app starts at entry, role changes retain a submitted answer and existing confirmed logs', async t => {
  const initial = seeded();
  const h = await boot(t, { saved: initial });
  assert.match(h.app.innerHTML, /멘토로 체험하기/);
  enterMath(h, 'learner'); await tick();
  assert.match(h.app.innerHTML, /제출하기/);
  assert.doesNotMatch(h.app.innerHTML, /첫 수준 확인 시작/);
  click(h.app, { choice: 'c' }); click(h.app, { action: 'submit' });
  assert.equal(h.saved().attempts.length, 1);
  click(h.node('change-role'));
  assert.match(h.app.innerHTML, /멘토로 체험하기/);
  assert.equal(h.saved().paths[0].visible, false);
  enterMath(h, 'mentor');
  assert.match(h.app.innerHTML, /오늘 확인할 것/);
  assert.equal(h.saved().attempts[0].choiceId, 'c');
  assert.deepEqual(h.saved().logs, initial.logs);
  assert.deepEqual(h.saved().sessions, initial.sessions);
  assert.match(h.node('current-profile').textContent, /멘토/);
  click(h.node('change-role')); enterMath(h, 'learner');
  assert.equal(h.saved().attempts.length, 1);
});

test('refresh restores a tab role, returning to entry removes it, and another tab starts at entry', async t => {
  const local = memoryStorage(), tab = memoryStorage();
  const first = await boot(t, { local, tab });
  enterMath(first, 'mentor');
  const refreshed = await boot(t, { local, tab });
  assert.match(refreshed.app.innerHTML, /오늘 확인할 것/);
  const other = await boot(t, { local });
  assert.match(other.app.innerHTML, /멘토로 체험하기/);
  click(refreshed.node('change-role'));
  const exited = await boot(t, { local, tab });
  assert.match(exited.app.innerHTML, /멘토로 체험하기/);
});

test('canceling a dirty form exit keeps the mentor screen; accepted exit preserves log draft', async t => {
  let allowExit = false, prompts = 0;
  const h = await boot(t, { saved: seeded(), confirm: () => { prompts++; return allowExit; } });
  enterMath(h, 'mentor'); click(h.app, { goto: 'sessions' });
  h.app.oninput({ target: { id: 'log-content', value: '작성 중인 일지 초안' } });
  h.app.fields = [{ tagName: 'TEXTAREA', value: '저장 전 회기 메모', defaultValue: '' }];
  click(h.node('change-role'));
  assert.equal(prompts, 1);
  assert.match(h.app.innerHTML, /회기 목록/);
  allowExit = true; click(h.node('change-role'));
  assert.match(h.app.innerHTML, /멘토로 체험하기/);
  h.app.fields = [];
  enterMath(h, 'mentor'); click(h.app, { goto: 'sessions' });
  assert.match(h.app.innerHTML, /작성 중인 일지 초안/);
  assert.equal(h.saved().logs[0].content, '기존 확정 일지');
});

test('learner solving time excludes time on entry and mentor screens', async t => {
  const initial = seeded();
  const start = Date.parse('2026-10-24T10:00:00Z');
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const h = await boot(t, { saved: initial });
  enterMath(h, 'learner'); await tick();
  t.mock.timers.tick(10000);
  click(h.node('change-role'));
  t.mock.timers.tick(60000);
  enterMath(h, 'mentor');
  t.mock.timers.tick(60000);
  click(h.node('change-role')); enterMath(h, 'learner'); await tick();
  t.mock.timers.tick(5000);
  click(h.app, { choice: 'c' }); click(h.app, { action: 'submit' });
  assert.equal(h.saved().attempts[0].activeMs, 15000);
});

test('adaptive assessment survives role changes and refresh, then mentor assignment opens learner practice', async t => {
  const catalog = mergeCatalogParts(['questions', 'concepts', 'routes', 'review', 'exam-bank'].map(name =>
    JSON.parse(readFileSync(new URL(`../public/src/content/${name}.json`, import.meta.url), 'utf8'))));
  const h = await boot(t, { catalog });
  enterMath(h, 'learner');
  assert.match(h.app.innerHTML, /6개 영역/);
  click(h.app, { initialAction: 'start' });
  const questionId = h.saved().initialAssessments[0].diagnostic.currentId;
  click(h.app, { initialAction: 'unknown', initialQuestion: questionId });
  const assessment = h.saved().initialAssessments[0];
  assert.equal(assessment.diagnostic.attempts.length, 1);
  click(h.node('change-subject'));
  assert.match(h.app.innerHTML, /어떤 과목을 함께 배울까요/);
  assert.deepEqual(h.saved().initialAssessments[0], assessment);
  click(h.app, { subjectId: 'math' });
  click(h.node('change-role')); enterMath(h, 'mentor');
  assert.match(h.app.innerHTML, /1문제 응답/);
  click(h.node('change-role')); enterMath(h, 'learner');
  assert.deepEqual(h.saved().initialAssessments[0], assessment);
  const restored = await boot(t, { catalog, local: h.local, tab: h.tab });
  assert.match(restored.app.innerHTML, /2번째 문제/);
  assert.deepEqual(restored.saved().initialAssessments[0], assessment);
  click(restored.app, { initialAction: 'pause' });
  const paused = restored.saved().initialAssessments[0];
  click(restored.node('change-role')); enterMath(restored, 'mentor');
  assert.match(restored.app.innerHTML, /첫 수준 확인 결과/);
  click(restored.app, { initialAction: 'plan' });
  assert.equal(restored.saved().paths.length, 1);
  click(restored.node('change-role')); enterMath(restored, 'learner'); await tick();
  assert.match(restored.app.innerHTML, /제출하기/);
  assert.deepEqual(restored.saved().initialAssessments[0], paused);
});

test('subject selection gates exposure and unsupported clicks; math return retains records and excludes idle time', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-24T12:00:00Z') });
  const initial = seeded();
  const h = await boot(t, { saved: initial });
  click(h.app, { enterRole: 'learner' });
  assert.match(h.app.innerHTML, /어떤 과목을 함께 배울까요/);
  assert.equal(h.node('reset').hidden, true);
  assert.equal(h.saved().exposures.length, initial.exposures.length);
  click(h.app, { subjectId: 'english' });
  assert.match(h.app.innerHTML, /어떤 과목을 함께 배울까요/);
  t.mock.timers.tick(60000);
  click(h.app, { subjectId: 'math' }); await tick();
  assert.match(h.node('current-profile').textContent, /수학/);
  t.mock.timers.tick(10000);
  click(h.node('reset')); // only first confirmation
  click(h.node('change-subject'));
  assert.equal(h.saved().paths[0].visible, false);
  assert.equal(h.node('reset').textContent, '시연 초기화');
  t.mock.timers.tick(60000);
  click(h.app, { subjectId: 'math' }); await tick();
  t.mock.timers.tick(5000);
  click(h.app, { choice: 'c' }); click(h.app, { action: 'submit' });
  assert.equal(h.saved().attempts[0].activeMs, 15000);
  assert.deepEqual(h.saved().sessions, initial.sessions);
  assert.deepEqual(h.saved().logs, initial.logs);
});

test('old role-only sessions restore subject selection and subject exit remains there after refresh', async t => {
  const tab = memoryStorage(), local = memoryStorage();
  tab.setItem(DEMO_SESSION_KEY, JSON.stringify({version:1,role:'mentor'}));
  const h = await boot(t, { tab, local });
  assert.match(h.app.innerHTML, /수학 지도 시작/);
  assert.equal(h.saved(), null);
  click(h.app, { subjectId:'math' });
  assert.match(h.app.innerHTML, /오늘 확인할 것/);
  click(h.node('change-subject'));
  const restored = await boot(t, { tab, local });
  assert.match(restored.app.innerHTML, /수학 지도 시작/);
  assert.equal(restored.node('change-subject').hidden, true);
});

test('subject exit cancel keeps session input and accepted exit retains the log draft', async t => {
  let allow = false;
  const h = await boot(t, { saved:seeded(), confirm:()=>allow });
  enterMath(h,'mentor'); click(h.app,{goto:'sessions'});
  h.app.oninput({target:{id:'log-content',value:'과목 이동 전 일지 초안'}});
  h.app.fields = [{tagName:'TEXTAREA',value:'미저장 회기',defaultValue:''}];
  const before = h.tab.getItem(DEMO_SESSION_KEY);
  click(h.node('change-subject'));
  assert.equal(h.tab.getItem(DEMO_SESSION_KEY), before);
  assert.equal(h.app.fields[0].value,'미저장 회기');
  assert.match(h.app.innerHTML,/회기 목록/);
  allow = true; click(h.node('change-subject'));
  assert.match(h.app.innerHTML,/수학 지도 시작/);
  h.app.fields = []; click(h.app,{subjectId:'math'}); click(h.app,{goto:'sessions'});
  assert.match(h.app.innerHTML,/과목 이동 전 일지 초안/);
  assert.equal(h.saved().logs[0].content,'기존 확정 일지');
});

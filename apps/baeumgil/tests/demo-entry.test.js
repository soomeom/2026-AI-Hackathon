import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSession, DEMO_SESSION_KEY, prepareDemoRole, cancelPendingDemoAI } from '../public/src/state/demo-session.js';
import { renderDemoEntry, hasUnsavedSessionForm } from '../public/src/ui/demo-entry.js';
import { createDemoState } from '../public/src/state/store.js';
import { STORAGE_KEY } from '../public/src/state/persistence.js';
import { isInitialAssessmentVisible } from '../public/src/ui/initial-assessment.js';
import { runAI } from '../public/src/ui/ai-panel.js';
import { aiInput, aiOutput } from './backend-ai-fixtures.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
};

test('entry role survives a reload of the same tab while a fresh tab starts without a role', () => {
  const storage = memoryStorage();
  const session = createDemoSession(storage);
  assert.equal(session.role, null);
  session.enter('mentor');
  assert.equal(createDemoSession(storage).role, 'mentor');
  assert.equal(createDemoSession(memoryStorage()).role, null);
  session.leave();
  assert.equal(createDemoSession(storage).role, null);
});

test('legacy global role, corrupt state and invalid roles never grant a demo entry', () => {
  const storage = memoryStorage();
  storage.setItem('baeumgil:ui:role', 'mentor');
  assert.equal(createDemoSession(storage).role, null);
  for (const value of ['{', '{"version":1,"role":"admin"}', '{"version":2,"role":"mentor"}']) {
    storage.setItem(DEMO_SESSION_KEY, value);
    assert.equal(createDemoSession(storage).role, null);
  }
  const session = createDemoSession(storage);
  session.enter('learner');
  assert.throws(() => session.enter('admin'));
  assert.equal(session.role, 'learner');
});

test('blocked tab storage still allows entry and exit for this page without claiming persistence', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  for (const storage of [null, blocked]) {
    const session = createDemoSession(storage);
    session.enter('learner');
    assert.equal(session.role, 'learner');
    assert.equal(session.persistent, false);
    session.leave();
    assert.equal(session.role, null);
  }
});

test('role changes preserve saved attempts, initial assessment, sessions and logs byte for byte', () => {
  const storage = memoryStorage();
  const state = createDemoState();
  state.attempts.push({ id: 'attempt-existing', result: 'incorrect' });
  state.initialAssessments.push({ id: 'initial-existing', answers: [{ result: 'correct' }] });
  state.sessions.push({ id: 'session-existing', actualMinutes: 40 });
  state.logs.push({ id: 'log-existing', content: '보존할 활동일지' });
  const saved = JSON.stringify(state);
  storage.setItem(STORAGE_KEY, saved);
  const ui = { logDraft: { 'session-existing': '아직 확정하지 않은 초안' } };
  const session = createDemoSession(storage);
  for (const role of ['mentor', 'learner', 'mentor']) {
    session.enter(role);
    prepareDemoRole(ui, state, role);
    session.leave();
  }
  assert.equal(storage.getItem(STORAGE_KEY), saved);
  assert.equal(JSON.stringify(state), saved);
  assert.equal(ui.logDraft['session-existing'], '아직 확정하지 않은 초안');
});

test('learner entry prioritizes their ongoing assignment and bypasses optional initial assessment', () => {
  const state = createDemoState();
  state.paths = [
    { id: 'other', learnerId: 'other-learner', status: 'active' },
    { id: 'done', learnerId: state.learnerId, status: 'completed' },
    { id: 'resume', learnerId: state.learnerId, status: 'paused' },
  ];
  const ui = { learnerPathId: 'done', initialAssessmentOpen: true };
  prepareDemoRole(ui, state, 'learner');
  assert.equal(ui.learnerPathId, 'resume');
  assert.equal(isInitialAssessmentVisible(state, ui), false);
});

test('without an assignment learner entry retains the initial check/result flow; mentor enters home', () => {
  const state = createDemoState();
  const ui = { initialAssessmentDismissed: true, initialAssessmentOpen: true, mentorTab: 'sessions' };
  prepareDemoRole(ui, state, 'learner');
  assert.equal(isInitialAssessmentVisible(state, ui), true);
  prepareDemoRole(ui, state, 'mentor');
  assert.equal(ui.mentorTab, 'home');
});

test('entry buttons select only supported roles and profile names are escaped', () => {
  const root = { innerHTML: '', onclick: null };
  const state = createDemoState();
  state.mentors[0].name = '<img src=x onerror=bad()>';
  const roles = [];
  renderDemoEntry({ root, state, onEnter: role => roles.push(role), persistent: true });
  assert.match(root.innerHTML, /멘토로 체험하기/);
  assert.match(root.innerHTML, /멘티로 체험하기/);
  assert.match(root.innerHTML, /&lt;img/);
  assert.doesNotMatch(root.innerHTML, /<img src=x/);
  for (const role of ['mentor', 'learner', 'admin']) root.onclick({ target: { closest: () => ({ dataset: { enterRole: role } }) } });
  assert.deepEqual(roles, ['mentor', 'learner']);
});

test('unsaved session form guard detects edited notes, attendance and linked paths, not unchanged fields', () => {
  const note = { tagName: 'TEXTAREA', value: '', defaultValue: '' };
  const attendance = { tagName: 'SELECT', options: [{ selected: true, defaultSelected: true }, { selected: false, defaultSelected: false }] };
  const path = { tagName: 'INPUT', type: 'checkbox', checked: true, defaultChecked: true };
  const root = { querySelectorAll: () => [note, attendance, path] };
  assert.equal(hasUnsavedSessionForm(root), false);
  note.value = '수업 중 관찰'; assert.equal(hasUnsavedSessionForm(root), true);
  note.value = '';
  path.checked = false; assert.equal(hasUnsavedSessionForm(root), true);
  path.checked = true;
  attendance.options[0].selected = false; attendance.options[1].selected = true;
  assert.equal(hasUnsavedSessionForm(root), true);
});

test('entry guidance agrees with the current assessment flow for legacy seven-question records', () => {
  const state = createDemoState();
  state.initialAssessments = [{ id: 'legacy', learnerId: state.learnerId, version: 1, status: 'completed' }];
  const root = { innerHTML: '' };
  renderDemoEntry({ root, state, onEnter() {}, persistent: true });
  assert.doesNotMatch(root.innerHTML, /멘토의 문제 지정을 기다려요/);
  assert.match(root.innerHTML, /시작점을 찾아요/);
  assert.equal(state.initialAssessments[0].id, 'legacy');
});

test('leaving invalidates a pending AI response even when the provider ignores cancellation', async t => {
  let resolveResponse;
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = () => new Promise(resolve => { resolveResponse = resolve; });
  let state = { attempts: [], sessions: [], aiArtifacts: [] };
  const ui = { ai: {}, logDraft: { session: '소중한 초안' } };
  const pending = runAI({ key: 'lesson', kind: 'lesson_plan', buildInput: () => aiInput(), ctx: {
    ui, getState: () => state, update: fn => { state = fn(state); }, rerender() {},
  } });
  const signal = ui.ai.lesson.controller.signal;
  cancelPendingDemoAI(ui);
  assert.equal(signal.aborted, true);
  resolveResponse({ ok: true, json: async () => ({ status: 'ok', output: aiOutput() }) });
  await pending;
  assert.equal(state.aiArtifacts.length, 0);
  assert.equal(ui.ai.lesson.status, 'canceled');
  assert.equal(ui.logDraft.session, '소중한 초안');
});

test('choosing 60s or older recommends large text without storing the age band or entering a role', () => {
  const root = { innerHTML: '', onclick: null };
  const state = createDemoState();
  const roles = [], calls = [];
  const display = { largeText: false, setLargeText(value) { calls.push(value); this.largeText = value; } };
  const press = dataset => root.onclick({ target: { closest: () => ({ dataset }) } });
  renderDemoEntry({ root, state, onEnter: role => roles.push(role), persistent: true, display });
  assert.match(root.innerHTML, /연령대는 저장하지 않아요/);
  assert.doesNotMatch(root.innerHTML, /role="dialog"/);
  press({ ageBand: 'adult' });
  assert.doesNotMatch(root.innerHTML, /큰 글씨로 볼까요/);
  press({ ageBand: 'senior' });
  assert.match(root.innerHTML, /role="dialog"[^>]*aria-modal="true"/);
  assert.match(root.innerHTML, /큰 글씨로 볼까요/);
  press({ enterRole: 'guardian' });
  assert.deepEqual(roles, [], 'the open recommendation blocks role entry');
  root.onkeydown({ key: 'Escape' });
  assert.doesNotMatch(root.innerHTML, /큰 글씨로 볼까요/);
  assert.deepEqual(calls, []);
  press({ ageBand: 'senior' });
  press({ displayChoice: 'accept' });
  assert.deepEqual(calls, [true]);
  assert.doesNotMatch(root.innerHTML, /role="dialog"/);
  assert.match(root.innerHTML, /큰 글씨로 바꿨어요/);
  press({ ageBand: 'senior' });
  assert.doesNotMatch(root.innerHTML, /role="dialog"/, 'no recommendation when large text is already on');
  assert.match(root.innerHTML, /이미 큰 글씨로 보고 있어요/);
  press({ enterRole: 'learner' });
  assert.deepEqual(roles, ['learner']);
  assert.ok(!JSON.stringify(state).includes('senior'));
});

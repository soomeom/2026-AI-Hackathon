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
  assert.match(root.innerHTML, /멘토로 바로 들어가기/);
  assert.match(root.innerHTML, /멘티로 바로 들어가기/);
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

test('login screen enters only with a matching demo account and keeps the typed id on failure', () => {
  const fields = { 'login-id': { value: '' }, 'login-password': { value: '' } };
  const root = { innerHTML: '', querySelector: sel => fields[sel.slice(1)] ?? { focus() {} } };
  const roles = [];
  const press = dataset => root.onclick({ target: { closest: () => ({ dataset }) } });
  renderDemoEntry({ root, state: createDemoState(), onEnter: r => roles.push(r), persistent: true });
  assert.match(root.innerHTML, /id="login-form"/);
  assert.match(root.innerHTML, /mentor01/); assert.match(root.innerHTML, /실제 서비스 비밀번호가 아니에요/);
  press({ authAction: 'login' });
  assert.match(root.innerHTML, /아이디와 비밀번호를 입력해 주세요/);
  fields['login-id'].value = 'learner01'; fields['login-password'].value = 'wrong';
  press({ authAction: 'login' });
  assert.match(root.innerHTML, /아이디 또는 비밀번호가 맞지 않아요/);
  assert.match(root.innerHTML, /value="learner01"/); assert.deepEqual(roles, []);
  fields['login-password'].value = 'learner1234';
  root.onsubmit({ preventDefault() {} });
  assert.deepEqual(roles, ['learner']);
});

function signupHarness(display) {
  const fields = {};
  let focused = null;
  const get = id => (fields[id] ??= { value: '', checked: false, focus() { focused = id; } });
  const root = { innerHTML: '', querySelector: sel => get(sel.slice(1)) };
  const entered = [];
  const press = dataset => root.onclick({ target: { closest: () => ({ dataset }) }, preventDefault() {} });
  renderDemoEntry({ root, state: createDemoState(), onEnter: r => entered.push(r), persistent: true, display });
  press({ authAction: 'signup' });
  return { fields, get, root, entered, press, focused: () => focused };
}

test('signup validation errors keep entered values except passwords and focus the first invalid field', () => {
  const h = signupHarness();
  assert.match(h.root.innerHTML, /id="signup-form"/);
  h.get('signup-name').value = '하늘이'; h.get('signup-password').value = 'abc12345';
  h.press({ authAction: 'signup-submit' });
  assert.match(h.root.innerHTML, /아이디는 영문 소문자와 숫자 4~16자예요\./);
  assert.match(h.root.innerHTML, /aria-invalid="true"/);
  assert.match(h.root.innerHTML, /id="signup-name"[^>]*value="하늘이"/);
  assert.doesNotMatch(h.root.innerHTML, /id="signup-password"[^>]*value=/);
  assert.doesNotMatch(h.root.innerHTML, /abc12345/);
  assert.equal(h.focused(), 'signup-login-id');
  h.press({ authAction: 'login-view' });
});

test('a valid signup only shows the prototype notice and enters nothing', () => {
  const h = signupHarness();
  h.press({ signupRole: 'learner' });
  assert.match(h.root.innerHTML, /data-signup-role="learner" aria-pressed="true"/);
  Object.assign(h.get('signup-name'), { value: '하늘이' });
  h.get('signup-age').value = 'teen'; h.get('signup-region').value = '춘천시';
  h.get('signup-login-id').value = 'newkid01';
  h.get('signup-password').value = 'abc12345'; h.get('signup-password-confirm').value = 'abc12345';
  h.get('signup-agree').checked = true;
  h.root.onsubmit({ preventDefault() {} });
  assert.match(h.root.innerHTML, /실제 계정은 만들어지지 않았어요/);
  assert.deepEqual(h.entered, []);
  h.press({ authAction: 'login-view' });
  assert.match(h.root.innerHTML, /id="login-form"/);
  h.press({ authAction: 'signup' });
  assert.doesNotMatch(h.root.innerHTML, /하늘이/);
  h.press({ authAction: 'login-view' });
});

test('choosing 60 or older in signup opens the large text recommendation', () => {
  const display = { largeText: false, setLargeText() {} };
  const h = signupHarness(display);
  h.get('signup-name').value = '하늘이';
  h.root.onchange({ target: { dataset: { signupAge: '' }, value: 'senior' } });
  assert.match(h.root.innerHTML, /큰 글씨로 볼까요/);
  assert.match(h.root.innerHTML, /id="signup-age"[^>]*>[^]*<option value="senior" selected>/);
  const before = h.root.innerHTML;
  h.press({ authAction: 'signup-submit' });
  h.press({ signupRole: 'mentor' });
  assert.equal(h.root.innerHTML, before);
  h.press({ displayChoice: 'dismiss' });
  assert.doesNotMatch(h.root.innerHTML, /role="dialog"/);
  h.press({ authAction: 'login-view' });
});

test('changing the signup role after typing a password explains why it was cleared and under14 shows the guardian consent', () => {
  const h = signupHarness();
  h.get('signup-password').value = 'abc12345';
  h.press({ signupRole: 'guardian' });
  assert.match(h.root.innerHTML, /비밀번호를 다시 입력해 주세요/);
  assert.match(h.root.innerHTML, /aria-required="true"/);
  assert.doesNotMatch(h.root.innerHTML, /signup-guardian-agree/);
  h.root.onchange({ target: { dataset: { signupAge: '' }, value: 'under14' } });
  assert.match(h.root.innerHTML, /id="signup-guardian-agree"/);
  h.press({ authAction: 'login-view' });
});

test('signup role click and age change return focus to the control, and a role error is tied to the role group', () => {
  const display = { largeText: false, setLargeText() {} };
  const h = signupHarness(display);
  h.press({ signupRole: 'mentor' });
  assert.equal(h.focused(), 'data-signup-role="mentor"]');
  h.root.onchange({ target: { dataset: { signupAge: '' }, value: 'teen' } });
  assert.equal(h.focused(), 'signup-age');
  h.root.onchange({ target: { dataset: { signupAge: '' }, value: 'senior' } });
  assert.match(h.root.innerHTML, /큰 글씨로 볼까요/);
  assert.equal(h.focused(), 'large-text-accept', 'dialog keeps focus');
  h.press({ displayChoice: 'dismiss' });
  h.press({ authAction: 'login-view' });
  h.press({ authAction: 'signup' });
  h.press({ authAction: 'signup-submit' });
  assert.match(h.root.innerHTML, /role="group"[^>]*aria-invalid="true" aria-describedby="signup-role-error"/);
  assert.match(h.root.innerHTML, /id="signup-role-error"/);
  h.press({ authAction: 'login-view' });
});

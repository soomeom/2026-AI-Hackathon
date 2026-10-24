// 앱 진입점: 카탈로그·저장본을 읽고, 저장소를 만들고, 역할에 맞는 화면을 그린다.
// 학습 기록의 원본은 이 브라우저의 localStorage 다 (서버 DB 없음).
import { createStore, createDemoState } from './src/state/store.js';
import { loadState, saveState, resetState, STORAGE_KEY } from './src/state/persistence.js';
import { renderLearner, activeLearnerPath } from './src/ui/learner.js';
import { renderMentor } from './src/ui/mentor.js';
import { esc } from './src/ui/text.js';
import { isInitialAssessmentVisible } from './src/ui/initial-assessment.js';
import { mergeCatalogParts } from './src/content/catalog.js';
import { createDemoSession, prepareDemoRole, cancelPendingDemoAI } from './src/state/demo-session.js';
import { renderDemoEntry, hasUnsavedSessionForm } from './src/ui/demo-entry.js';
import { renderSubjectSelection } from './src/ui/subject-selection.js';
import { isSubjectEnabled } from './src/content/subjects.js';

const CONTENT_FILES = ['questions', 'concepts', 'routes', 'review', 'exam-bank'];

const app = document.getElementById('app');
const saveNote = document.getElementById('save-note');

async function loadCatalog() {
  const parts = await Promise.all(CONTENT_FILES.map(async (name) => {
    const res = await fetch(`./src/content/${name}.json`);
    if (!res.ok) throw new Error(`${name}.json 을 불러오지 못했어요 (${res.status})`);
    return res.json();
  }));
  return mergeCatalogParts(parts);
}

async function loadHealth() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const body = await res.json();
    return { reachable: res.ok, aiConfigured: body.ai?.configured === true, model: body.ai?.model ?? null };
  } catch {
    return { reachable: false, aiConfigured: false, model: null };
  }
}

// localStorage 접근 자체가 막힌 환경(시크릿 창 설정 등)에서도 화면은 동작해야 한다
function getStorage() {
  try { return window.localStorage; } catch { return null; }
}
const storage = getStorage();
const demoSession = createDemoSession((() => { try { return window.sessionStorage; } catch { return null; } })());

const freshUi = () => ({
  selected: {}, help: {}, openEvidence: {}, ai: {}, logDraft: {}, reviewed: {},
  learnerPathId: null, mentorPathId: null, mentorTab: 'home', sessionId: null, editSession: false,
  confirmSkip: null, confirmReset: false, flash: null, overrideError: null, sessionError: null, logError: null,
  ledgerMonth: null, copyFallback: null,
  initialChoices: {}, initialAssessmentOpen: false, initialAssessmentDismissed: false, initialError: null,
  initialAssessmentFor: null, initialConceptId: null, initialQuestionId: null, initialReason: '', initialPlanError: null,
});
const ui = { ...freshUi(), role: demoSession.role, subjectId: demoSession.subjectId, health: null };
const inWorkspace = () => Boolean(ui.role && isSubjectEnabled(ui.subjectId));

const persist = { savedRevision: 0, status: storage ? 'idle' : 'unavailable', blocked: false };

let store;
let catalog;

function showSaveStatus() {
  const text = {
    idle: '이 브라우저에 자동 저장돼요.',
    saved: '이 브라우저에 저장됨.',
    failed: '⚠ 이 브라우저에 저장하지 못했어요. 화면의 내용은 유지돼요.',
    conflict: '⚠ 다른 탭에서 기록이 바뀌었어요. 덮어쓰지 않도록 저장을 멈췄어요. 새로고침해 최신 기록을 여세요.',
    unavailable: '⚠ 이 브라우저는 저장을 쓸 수 없어 새로고침하면 처음부터 시작해요.',
  };
  saveNote.textContent = text[persist.status] ?? '';
  saveNote.classList.toggle('warn-text', ['failed', 'conflict', 'unavailable'].includes(persist.status));
}

function save(state) {
  if (!storage || persist.blocked || state.revision === persist.savedRevision) return;
  const result = saveState(storage, state, persist.savedRevision);
  if (result.ok) {
    persist.savedRevision = state.revision;
    persist.status = 'saved';
  } else if (result.reason === 'conflict') {
    persist.blocked = true;
    persist.status = 'conflict';
  } else {
    persist.status = 'failed';
  }
  showSaveStatus();
}

function render() {
  const state = store.getState();
  document.getElementById('session-controls').hidden = !ui.role;
  document.getElementById('reset').hidden = !inWorkspace();
  document.getElementById('change-subject').hidden = !inWorkspace();
  document.getElementById('reset').textContent = ui.confirmReset ? '정말 초기화할까요? 한 번 더 누르기' : '시연 초기화';
  const person = ui.role === 'mentor' ? state.mentors?.find(p => p.id === state.mentorId) : state.learners?.find(p => p.id === state.learnerId);
  document.getElementById('current-profile').textContent = ui.role ? `${person?.name ?? '시연 계정'} · ${ui.role === 'mentor' ? '멘토' : '멘티'}${inWorkspace() ? ' · 수학' : ''}` : '';
  document.getElementById('entry-session-note').hidden = !ui.role || demoSession.persistent;
  app.onclick = null;
  app.onchange = null;
  app.oninput = null;
  app.classList.toggle('entry-main', !inWorkspace());
  app.classList.toggle('learner-main', inWorkspace() && ui.role === 'learner');
  if (!ui.role) {
    renderDemoEntry({ root: app, state, onEnter: setRole, persistent: demoSession.persistent });
    return;
  }
  if (!inWorkspace()) {
    renderSubjectSelection({ root: app, state, role: ui.role, onSelect: selectSubject });
    return;
  }
  const props = {
    root: app, state, catalog, ui, rerender: render,
    dispatch: store.dispatch, assignQuestion: store.assignQuestion, update: store.update, getState: store.getState,
    startInitialAssessment: store.startInitialAssessment, presentInitialQuestion: store.presentInitialQuestion,
    submitInitialAnswer: store.submitInitialAnswer, planInitialLesson: store.planInitialLesson,
    syncVisibility,
  };
  if (ui.role === 'learner') renderLearner(props);
  else renderMentor(props);
}

// 멘티 화면이 보이지 않을 때(탭 숨김·멘토 화면 전환)는 풀이 시간을 멈춘다
function syncVisibility() {
  const state = store.getState();
  const visiblePath = inWorkspace() && ui.role === 'learner' && !document.hidden && !isInitialAssessmentVisible(state, ui) ? activeLearnerPath(state, ui) : null;
  for (const p of state.paths ?? []) {
    if (!p.routeId || p.status !== 'active') continue;
    const visible = p.id === visiblePath?.id;
    if (p.visible !== visible) store.dispatch({ type: 'SET_VISIBILITY', pathId: p.id, visible });
  }
}

function focusScreen() {
  app.focus({ preventScroll: true });
  window.scrollTo?.({ top: 0, left: 0, behavior: 'instant' });
}

function setRole(role) {
  demoSession.enter(role);
  Object.assign(ui, { role, subjectId: null, confirmReset: false, flash: null });
  syncVisibility();
  render();
  focusScreen();
}

function selectSubject(subjectId) {
  if (!ui.role || !isSubjectEnabled(subjectId)) return;
  demoSession.selectSubject(subjectId);
  ui.subjectId = demoSession.subjectId;
  prepareDemoRole(ui, store.getState(), ui.role);
  syncVisibility();
  render();
  focusScreen();
}

function leaveWorkspace({ changeRole = false } = {}) {
  if (!ui.role) return;
  if (ui.role === 'mentor' && hasUnsavedSessionForm(app)
    && !window.confirm('저장하지 않은 회기 입력이 있어요. 화면을 나가면 이 입력은 사라져요. 계속할까요?\n작성 중인 일지 초안과 저장된 학습 기록은 유지돼요.')) return;
  cancelPendingDemoAI(ui);
  if (changeRole) demoSession.leave();
  else demoSession.clearSubject();
  ui.role = demoSession.role;
  ui.subjectId = demoSession.subjectId;
  ui.confirmReset = false;
  syncVisibility();
  render();
  focusScreen();
}

function resetDemo() {
  if (!inWorkspace()) return;
  if (!ui.confirmReset) { ui.confirmReset = true; render(); return; }
  if (storage) {
    const result = resetState(storage, { confirmed: true });
    if (!result.ok) { ui.confirmReset = false; persist.status = 'failed'; showSaveStatus(); render(); return; }
  }
  cancelPendingDemoAI(ui);
  Object.assign(ui, freshUi(), { flash: '시연 기록을 초기화했어요.' });
  Object.assign(persist, { savedRevision: 0, blocked: false, status: storage ? 'idle' : 'unavailable' });
  store.replaceState(createDemoState());
  showSaveStatus();
}

// 저장본을 읽을 수 없을 때: 자동으로 지우지 않고 원문을 보여 준 뒤 사용자가 고르게 한다
function showRecovery(loaded) {
  app.innerHTML = `<section class="card">
    <h2>저장된 기록을 열 수 없어요</h2>
    <p>이유: ${esc(loaded.reason)}. 기록은 지우지 않았어요. 필요하면 아래 원문을 복사해 보관하세요.</p>
    <textarea rows="8" readonly class="raw">${esc(loaded.raw ?? '')}</textarea>
    <div class="row"><button id="recovery-reset" class="primary">원문을 보관했어요. 새로 시작하기</button></div>
  </section>`;
  document.getElementById('recovery-reset').addEventListener('click', () => {
    resetState(storage, { confirmed: true });
    window.location.reload();
  });
}

async function start() {
  let health;
  try {
    [catalog, health] = await Promise.all([loadCatalog(), loadHealth()]);
  } catch (err) {
    app.innerHTML = `<div class="card error">문항 자료를 불러오지 못했어요. ${esc(err.message)}</div>`;
    return;
  }
  ui.health = health;

  let initial = createDemoState();
  if (storage) {
    const loaded = loadState(storage);
    if (loaded.status === 'recovery_required') { showRecovery(loaded); return; }
    if (loaded.status === 'ready') {
      initial = loaded.state;
      persist.savedRevision = loaded.state.revision;
    }
  }

  store = createStore({ initialState: initial, catalog });
  if (inWorkspace()) prepareDemoRole(ui, initial, ui.role);
  store.subscribe((state) => { save(state); syncVisibility(); render(); });
  showSaveStatus();

  document.getElementById('change-role').addEventListener('click', () => leaveWorkspace({ changeRole: true }));
  document.getElementById('change-subject').addEventListener('click', () => leaveWorkspace());
  document.getElementById('reset').addEventListener('click', resetDemo);
  document.addEventListener('visibilitychange', syncVisibility);
  // 다른 탭이 같은 기록을 바꾸면 이 탭의 쓰기를 멈춘다 (덮어쓰기 방지)
  window.addEventListener('storage', (ev) => {
    if (ev.key !== STORAGE_KEY || persist.blocked) return;
    persist.blocked = true;
    persist.status = 'conflict';
    showSaveStatus();
  });
  render();
  syncVisibility();
}

start();

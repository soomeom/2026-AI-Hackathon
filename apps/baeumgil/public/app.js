// 앱 진입점: 카탈로그를 읽고, 저장소를 만들고, 역할에 맞는 화면을 그린다.
import { createStore, createDemoState } from './src/state/store.js';
import { renderLearner, activeLearnerPath } from './src/ui/learner.js';
import { renderMentor } from './src/ui/mentor.js';

const CONTENT_FILES = ['questions', 'concepts', 'routes', 'review'];
const ROLE_KEY = 'baeumgil:ui:role';

const app = document.getElementById('app');

async function loadCatalog() {
  const parts = await Promise.all(CONTENT_FILES.map(async (name) => {
    const res = await fetch(`./src/content/${name}.json`);
    if (!res.ok) throw new Error(`${name}.json 을 불러오지 못했어요 (${res.status})`);
    return res.json();
  }));
  return Object.assign({}, ...parts);
}

// 역할 선택만 브라우저에 기억한다 (학습 기록 저장은 persistence 연결 후)
const readRole = () => { try { return localStorage.getItem(ROLE_KEY); } catch { return null; } };
const writeRole = (role) => { try { localStorage.setItem(ROLE_KEY, role); } catch { /* 저장 불가여도 화면은 동작 */ } };

const ui = {
  role: readRole() === 'learner' ? 'learner' : 'mentor',
  selected: {},
  help: {},
  openEvidence: {},
  learnerPathId: null,
  mentorPathId: null,
  confirmSkip: null,
  confirmReset: false,
  flash: null,
  overrideError: null,
};

let store;
let catalog;

function render() {
  for (const b of document.querySelectorAll('.roles button')) b.setAttribute('aria-pressed', String(b.dataset.role === ui.role));
  const resetButton = document.getElementById('reset');
  resetButton.textContent = ui.confirmReset ? '정말 초기화할까요? 한 번 더 누르기' : '시연 초기화';
  const props = { root: app, state: store.getState(), catalog, dispatch: store.dispatch, ui, rerender: render };
  if (ui.role === 'learner') renderLearner(props);
  else renderMentor({ ...props, assignQuestion: store.assignQuestion });
}

// 멘티 화면이 보이지 않을 때(탭 숨김·멘토 화면 전환)는 풀이 시간을 멈춘다
function syncVisibility() {
  const state = store.getState();
  const visiblePath = ui.role === 'learner' && !document.hidden ? activeLearnerPath(state, ui) : null;
  for (const p of state.paths ?? []) {
    if (!p.routeId || p.status !== 'active') continue;
    const visible = p.id === visiblePath?.id;
    if (p.visible !== visible) store.dispatch({ type: 'SET_VISIBILITY', pathId: p.id, visible });
  }
}

function setRole(role) {
  ui.role = role;
  ui.flash = null;
  writeRole(role);
  syncVisibility();
  render();
  app.focus();
}

async function start() {
  try {
    catalog = await loadCatalog();
  } catch (err) {
    app.innerHTML = `<div class="card error">문항 자료를 불러오지 못했어요. ${String(err.message)}</div>`;
    return;
  }
  store = createStore({ initialState: createDemoState(), catalog });
  store.subscribe(() => { syncVisibility(); render(); });
  document.getElementById('save-note').textContent = '아직 저장 기능이 연결되지 않아 새로고침하면 처음부터 시작해요.';

  document.querySelector('.roles').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-role]');
    if (b) setRole(b.dataset.role);
  });
  document.getElementById('reset').addEventListener('click', () => {
    if (!ui.confirmReset) { ui.confirmReset = true; render(); return; }
    Object.assign(ui, { confirmReset: false, selected: {}, help: {}, openEvidence: {}, learnerPathId: null, mentorPathId: null, flash: '시연 기록을 초기화했어요.' });
    store.replaceState(createDemoState());
  });
  document.addEventListener('visibilitychange', syncVisibility);
  render();
  syncVisibility();
}

start();

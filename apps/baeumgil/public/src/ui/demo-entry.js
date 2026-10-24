import { esc } from './text.js';
import { initialAssessmentSummary } from '../learning/initial-assessment.js';
import { learnerPaths } from '../learning/assignments.js';
import { authenticate, DEMO_ACCOUNTS } from '../auth/accounts.js';

// 회기 입력 폼은 아직 저장소에 반영되지 않았으므로 나가기 전에 확인한다.
// 활동일지 내용은 기존 ui.logDraft에 보관되며 이 검사 대상이 아니다.
export function hasUnsavedSessionForm(root) {
  return [...root.querySelectorAll('.form input, .form select, .form textarea')].some(field => {
    if (field.tagName === 'SELECT') return [...field.options].some(option => option.selected !== option.defaultSelected);
    if (field.type === 'checkbox' || field.type === 'radio') return field.checked !== field.defaultChecked;
    return field.value !== field.defaultValue;
  });
}

// 연령대는 추천에만 쓰고 저장하지 않는다. 화면을 다시 그려도 이번 방문 동안만 유지된다.
const AGE_BANDS = [['teen', '10대'], ['adult', '20~50대'], ['senior', '60대 이상']];
const entryView = { ageBand: null, recommend: false, notice: '', view: 'login', loginId: '', loginError: '', signupValues: {}, signupErrors: {} };
const LOGIN_ERRORS = { empty: '아이디와 비밀번호를 입력해 주세요.', mismatch: '아이디 또는 비밀번호가 맞지 않아요.' };
const QUICK = { mentor: '멘토로 바로 들어가기', learner: '멘티로 바로 들어가기', guardian: '보호자로 바로 들어가기' };

function ageSection(display) {
  if (!display) return '';
  const options = AGE_BANDS.map(([id, label]) =>
    `<button class="secondary" data-age-band="${id}" aria-pressed="${entryView.ageBand === id}">${label}</button>`).join('');
  return `<section class="entry-age" aria-labelledby="entry-age-title">
      <h2 id="entry-age-title">보기 편한 글씨를 추천해 드려요 <small>(선택)</small></h2>
      <p class="muted small">연령대를 고르면 알맞은 글씨 크기를 추천해요. 연령대는 저장하지 않아요.</p>
      <div class="entry-age-options" role="group" aria-label="연령대">${options}</div>
      <p class="entry-age-notice small" role="status">${entryView.notice}</p>
    </section>`;
}

function recommendDialog(display) {
  if (!display || !entryView.recommend || display.largeText) return '';
  return `<div class="entry-recommend-backdrop">
      <div class="entry-recommend" role="dialog" aria-modal="true" aria-labelledby="recommend-title" aria-describedby="recommend-desc">
        <span class="pill primary">큰 글씨 추천</span>
        <h2 id="recommend-title">큰 글씨로 볼까요?</h2>
        <p id="recommend-desc">글씨와 버튼이 커져서 읽고 누르기 편해요.<br>위쪽 '큰글씨' 버튼으로 언제든 되돌릴 수 있어요.</p>
        <div class="row"><button id="large-text-accept" class="primary large" data-display-choice="accept">큰 글씨로 보기</button>
          <button class="secondary large" data-display-choice="dismiss">지금 글씨로 계속</button></div>
      </div>
    </div>`;
}

function loginCard() {
  return `<section class="auth-card" aria-labelledby="login-title">
      <h2 id="login-title">로그인</h2>
      <form id="login-form" novalidate>
        <label class="auth-field" for="login-id">아이디
          <input id="login-id" name="loginId" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(entryView.loginId)}"></label>
        <label class="auth-field" for="login-password">비밀번호
          <input id="login-password" name="password" type="password" autocomplete="current-password"></label>
        <button type="submit" class="primary large" data-auth-action="login">로그인</button>
        <p id="login-error" class="auth-error" role="alert">${esc(entryView.loginError)}</p>
      </form>
      <p class="auth-switch">처음이신가요? <button type="button" class="ghost" data-auth-action="signup">회원가입</button></p>
    </section>`;
}

function demoAccounts(state) {
  const learner = state.learners?.find(person => person.id === state.learnerId);
  const mentor = state.mentors?.find(person => person.id === state.mentorId);
  const names = { mentor: mentor?.name ?? '김멘토(가명)', learner: learner?.name ?? '하늘(가명)', guardian: `${learner?.name ?? '하늘(가명)'}의 보호자` };
  const paths = learnerPaths(state);
  const assessment = initialAssessmentSummary(state, state.learnerId);
  const learnerNext = paths.length ? '지정된 문제와 학습 기록을 이어서 볼 수 있어요.'
    : assessment?.status === 'completed' ? '첫 수준 확인 결과를 보고 멘토의 문제 지정을 기다려요.'
      : assessment ? '진행하던 첫 수준 확인을 이어서 할 수 있어요.' : '영역별 첫 수준 확인으로 배움의 시작점을 찾아요.';
  const rows = DEMO_ACCOUNTS.map(account => `<li class="demo-account">
        <span class="demo-account-role">${esc(account.label)} <small class="muted">${esc(names[account.role])}</small></span>
        <span class="demo-account-cred">아이디 <code>${esc(account.loginId)}</code> · 비밀번호 <code>${esc(account.password)}</code>${account.role === 'learner' ? `<small class="muted">${learnerNext}</small>` : ''}</span>
        <button type="button" class="secondary small" data-enter-role="${account.role}">${QUICK[account.role] ?? '바로 들어가기'}</button>
      </li>`).join('');
  return `<section class="demo-accounts" aria-labelledby="demo-accounts-title">
      <h2 id="demo-accounts-title">시연 계정</h2>
      <p class="muted small">심사·체험용 공개 계정이에요. 실제 서비스 비밀번호가 아니에요.</p>
      <ul class="demo-account-list">${rows}</ul>
      <p class="muted small">${esc(learner?.name ?? '하늘(가명)')} 학생 기록은 역할을 바꿔도 그대로 이어져요.</p>
    </section>`;
}

function signupPlaceholder() {
  return `<section id="signup-placeholder" class="auth-card"><h2>회원가입</h2>
      <button type="button" class="secondary" data-auth-action="login-view">로그인으로 돌아가기</button></section>`;
}

export function renderDemoEntry({ root, state, onEnter, persistent, display }) {
  const login = entryView.view === 'login';
  root.innerHTML = `<section class="demo-entry" aria-labelledby="entry-title">
    <div class="entry-intro">
      <span class="pill primary">배움길</span>
      <h1 id="entry-title">배움은 함께,<br>시작은 나에게 맞게.</h1>
      <p>로그인하고 오늘의 배움을 이어가요.</p>
    </div>
    ${login ? loginCard() : signupPlaceholder()}
    ${ageSection(display)}
    ${login ? demoAccounts(state) : ''}
    <div class="entry-footnote">
      ${persistent ? '' : '<p class="warn-text small" role="status">이 환경에서는 로그인 상태를 저장할 수 없어 새로고침하면 다시 로그인해야 할 수 있어요.</p>'}
    </div>
  </section>${recommendDialog(display)}`;
  const redraw = () => {
    renderDemoEntry({ root, state, onEnter, persistent, display });
    if (entryView.recommend && !display.largeText) root.querySelector?.('#large-text-accept')?.focus?.();
  };
  const attemptLogin = () => {
    const loginId = root.querySelector?.('#login-id')?.value ?? '';
    const password = root.querySelector?.('#login-password')?.value ?? '';
    const result = authenticate(loginId, password);
    if (!result.ok) {
      entryView.loginId = loginId;
      entryView.loginError = LOGIN_ERRORS[result.reason] ?? LOGIN_ERRORS.mismatch;
      redraw();
      root.querySelector?.('#login-password')?.focus?.();
      return;
    }
    entryView.loginId = '';
    entryView.loginError = '';
    entryView.notice = '';
    onEnter(result.role);
  };
  root.onsubmit = event => {
    event?.preventDefault?.();
    if (entryView.recommend) return;
    attemptLogin();
  };
  root.onclick = event => {
    const button = event.target.closest('button[data-enter-role], button[data-age-band], button[data-display-choice], button[data-auth-action]');
    const { enterRole: role, ageBand, displayChoice, authAction } = button?.dataset ?? {};
    if (display && displayChoice) {
      entryView.recommend = false;
      if (displayChoice === 'accept') display.setLargeText(true);
      entryView.notice = displayChoice === 'accept' ? '큰 글씨로 바꿨어요.' : '지금 글씨로 계속해요. 위쪽 ‘큰글씨’ 버튼으로 언제든 바꿀 수 있어요.';
      redraw();
      return;
    }
    if (display && AGE_BANDS.some(([id]) => id === ageBand)) {
      entryView.ageBand = ageBand;
      entryView.recommend = ageBand === 'senior' && !display.largeText;
      entryView.notice = ageBand === 'senior' && display.largeText ? '이미 큰 글씨로 보고 있어요.' : '';
      redraw();
      return;
    }
    if (entryView.recommend) return;
    if (authAction === 'login') { event.preventDefault?.(); attemptLogin(); return; }
    if (authAction === 'signup' || authAction === 'login-view') {
      entryView.view = authAction === 'signup' ? 'signup' : 'login';
      entryView.loginError = '';
      redraw();
      return;
    }
    if (!['mentor','learner','guardian'].includes(role)) return;
    entryView.notice = '';
    entryView.loginId = '';
    entryView.loginError = '';
    onEnter(role);
  };
  root.onkeydown = event => {
    if (event.key !== 'Escape' || !entryView.recommend) return;
    entryView.recommend = false;
    entryView.notice = '지금 글씨로 계속해요. 위쪽 ‘큰글씨’ 버튼으로 언제든 바꿀 수 있어요.';
    redraw();
  };
}

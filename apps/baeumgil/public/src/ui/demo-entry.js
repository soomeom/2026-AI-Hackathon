import { esc, ICON } from './text.js';
import { initialAssessmentSummary } from '../learning/initial-assessment.js';

// 회기 입력 폼은 아직 저장소에 반영되지 않았으므로 나가기 전에 확인한다.
// 활동일지 내용은 기존 ui.logDraft에 보관되며 이 검사 대상이 아니다.
export function hasUnsavedSessionForm(root) {
  return [...root.querySelectorAll('.form input, .form select, .form textarea')].some(field => {
    if (field.tagName === 'SELECT') return [...field.options].some(option => option.selected !== option.defaultSelected);
    if (field.type === 'checkbox' || field.type === 'radio') return field.checked !== field.defaultChecked;
    return field.value !== field.defaultValue;
  });
}

export function renderDemoEntry({ root, state, onEnter, persistent }) {
  const mentor = state.mentors?.find(person => person.id === state.mentorId);
  const learner = state.learners?.find(person => person.id === state.learnerId);
  const paths = (state.paths ?? []).filter(path => path.learnerId === state.learnerId);
  const assessment = initialAssessmentSummary(state, state.learnerId);
  const learnerNext = paths.length ? '지정된 문제와 학습 기록을 이어서 볼 수 있어요.'
    : assessment?.status === 'completed' ? '첫 수준 확인 결과를 보고 멘토의 문제 지정을 기다려요.'
      : assessment ? '진행하던 첫 수준 확인을 이어서 할 수 있어요.' : '영역별 첫 수준 확인으로 배움의 시작점을 찾아요.';

  root.innerHTML = `<section class="demo-entry" aria-labelledby="entry-title">
    <div class="entry-intro">
      <span class="pill primary">배움길 체험</span>
      <h1 id="entry-title">배움은 함께,<br>시작은 나에게 맞게.</h1>
      <p>학생의 배움을 잇고, 멘토의 준비를 돕는 배움길.<br>어떤 역할로 함께할까요?</p>
    </div>
    <div class="entry-roles">
      <article class="entry-card entry-mentor">
        <span class="entry-icon" aria-hidden="true">${ICON.target}</span>
        <h2>배움을 이끄는 멘토</h2>
        <p>학생의 학습을 확인하고<br>다음 수업을 준비해요.</p>
        <div class="entry-profile"><span class="entry-avatar" aria-hidden="true">M</span><span><b>${esc(mentor?.name ?? '김멘토(가명)')}</b><small>멘토 시연 계정</small></span></div>
        <button class="primary large" data-enter-role="mentor">멘토로 체험하기 ${ICON.arrow}</button>
        <p class="entry-next">학습 현황 · AI 수업 준비 · 활동일지</p>
      </article>
      <article class="entry-card entry-learner">
        <span class="entry-icon" aria-hidden="true">${ICON.book}</span>
        <h2>한 걸음씩 배우는 멘티</h2>
        <p>나에게 맞는 문제를 풀고<br>배움을 이어가요.</p>
        <div class="entry-profile"><span class="entry-avatar" aria-hidden="true">L</span><span><b>${esc(learner?.name ?? '하늘(가명)')}</b><small>멘티 시연 계정</small></span></div>
        <button class="large" data-enter-role="learner">멘티로 체험하기 ${ICON.arrow}</button>
        <p class="entry-next">${learnerNext}</p>
      </article>
      <article class="entry-card entry-guardian"><span class="entry-icon" aria-hidden="true">${ICON.book}</span><h2>함께 응원하는 보호자</h2><p>최근 참여와 확인된 변화를 보고<br>다음 배움을 응원해요.</p><div class="entry-profile"><span class="entry-avatar" aria-hidden="true">G</span><span><b>${esc(learner?.name??'하늘(가명)')}의 보호자</b><small>보호자 시연 화면</small></span></div><button class="large" data-enter-role="guardian">보호자로 체험하기 ${ICON.arrow}</button><p class="entry-next">학습 참여 · 개념별 변화 · 다음 배움길</p></article>
    </div>
    <div class="entry-footnote"><p>역할을 바꿔도 기존 학습 기록은 그대로 이어져요.</p>
      <p class="muted small">가상 계정을 사용하는 시연입니다. 기록은 이 브라우저에 저장됩니다.</p>
      ${persistent ? '' : '<p class="warn-text small" role="status">이 환경에서는 입장한 역할을 저장할 수 없어 새로고침하면 다시 선택해야 할 수 있어요.</p>'}
    </div>
  </section>`;
  root.onclick = event => {
    const button = event.target.closest('button[data-enter-role]');
    const role = button?.dataset.enterRole;
    if (['mentor','learner','guardian'].includes(role)) onEnter(role);
  };
}

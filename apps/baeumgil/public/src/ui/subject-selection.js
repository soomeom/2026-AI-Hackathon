import { SUBJECTS, isSubjectEnabled } from '../content/subjects.js';
import { esc, ICON } from './text.js';

export function renderSubjectSelection({ root, state, role, onSelect }) {
  const hasRecords = ['paths', 'initialAssessments', 'sessions'].some(key =>
    (state[key] ?? []).some(record => record.learnerId === state.learnerId));
  root.innerHTML = `<section class="subject-selection" aria-labelledby="subject-title">
    <div class="entry-intro"><span class="pill primary">과목 선택</span>
      <h1 id="subject-title">어떤 과목을 함께 배울까요?</h1>
      <p>지금은 수학을 체험할 수 있어요.<br>다른 과목도 준비하고 있어요.</p>
    </div>
    <div class="subject-grid">${SUBJECTS.map(subject => `<article class="subject-card ${subject.enabled ? 'subject-ready' : 'subject-upcoming'}">
      <span class="pill ${subject.enabled ? 'primary' : 'neutral'}">${subject.enabled ? '학습 가능' : '준비 중'}</span>
      <h2>${esc(subject.name)}</h2>
      <p>${subject.enabled ? '나에게 맞는 문제부터<br>차근차근 배움을 이어가요.' : '아직 학습할 수 없어요.'}</p>
      ${subject.enabled ? `<p class="muted small">${hasRecords ? '기존 학습 기록을 이어갈 수 있어요.' : '첫 수준 확인으로 시작점을 찾아요.'}</p>
        <button class="primary large" data-subject-id="${subject.id}">${role === 'mentor' ? '수학 지도 시작' : role === 'guardian' ? '수학 학습 소식 보기' : '수학 학습 시작'} ${ICON.arrow}</button>` : ''}
    </article>`).join('')}</div>
    <p class="entry-footnote">과목 선택 화면으로 돌아와도 학습 기록은 그대로 유지돼요.</p>
  </section>`;
  root.onclick = event => {
    const button = event.target.closest('button[data-subject-id]');
    if (button && isSubjectEnabled(button.dataset.subjectId)) onSelect(button.dataset.subjectId);
  };
}

import { initialQuestions, initialAssessmentSummary, initialQuestionOptions } from '../learning/initial-assessment.js';
import { esc, ICON } from './text.js';

const LABEL = { correct: '이번 문항 정답', incorrect: '추가 확인', abstained: '모름', pending: '아직 확인 전' };
const conceptName = (catalog, id) => catalog.concepts.find(c => c.id === id)?.name ?? id;
const hasPath = state => (state.paths ?? []).some(p => p.learnerId === state.learnerId);
const caveat = '현재 지원하는 기초 개념 7개를 한 문제씩 확인해요. 전체 수학 실력이나 개념 숙달을 확정하는 검사가 아니에요.';
const resultTable = summary => `<div class="scroll-x"><table class="table initial-results"><caption class="sr-only">초기 수준 확인의 개념별 응답 결과</caption>
  <thead><tr><th scope="col">확인한 개념</th><th scope="col">이번 응답</th></tr></thead>
  <tbody>${summary.entries.map(e => `<tr><th scope="row">${esc(e.conceptName)}</th><td><span class="pill ${e.result === 'correct' ? 'ok' : e.result === 'pending' ? 'neutral' : 'warn'}">${LABEL[e.result]}</span></td></tr>`).join('')}</tbody></table></div>`;

export function isInitialAssessmentVisible(state, ui) {
  const summary = initialAssessmentSummary(state, state.learnerId);
  return Boolean(ui.initialAssessmentOpen || (!summary?.startingPoint && !ui.initialAssessmentDismissed));
}

export function renderInitialAssessment(props) {
  const state = props.getState(); const { root, catalog, ui } = props;
  if (!isInitialAssessmentVisible(state, ui)) return false;
  const summary = initialAssessmentSummary(state, state.learnerId, { catalog });
  const dismiss = hasPath(state) ? '<button class="ghost" data-initial-action="dismiss">기존 학습 이어가기</button>' : '';
  let html;
  if (!summary) {
    html = `<section class="card question-card initial-intro"><span class="pill primary">첫 멘토링 준비</span>
      <h2>우리, 어디부터 시작할까요?</h2><p>첫 수준 확인으로 멘토에게 지금 필요한 도움을 알려 주세요.</p>
      <div class="initial-facts"><span>7문제</span><span>시간 제한 없음</span><span>모름 선택 가능</span></div>
      <p class="muted">정수·분수 계산부터 일차방정식까지 짧게 확인해요. 잘 모르겠으면 편하게 표시해 주세요.</p>
      <p class="muted small">${caveat} 자체 제작 문항이며 공식 기출은 아니에요. 응답은 이 브라우저에 저장되고 멘토가 볼 수 있어요.</p>
      <div class="action-bar"><button class="primary large" data-initial-action="start">첫 수준 확인 시작 ${ICON.arrow}</button>${dismiss}</div></section>`;
  } else if (summary.status === 'active') {
    const record = state.initialAssessments.find(a => a.id === summary.assessmentId);
    const q = initialQuestions()[record.answers.length];
    if (!record.presentedQuestionIds.includes(q.id)) {
      props.presentInitialQuestion({ assessmentId: record.id, questionId: q.id });
      return true;
    }
    const selected = ui.initialChoices?.[q.id];
    html = `<section class="card question-card"><div class="question-top"><span class="pill primary">첫 수준 확인</span><span>${record.answers.length + 1} / 7</span></div>
      <progress class="initial-progress" value="${record.answers.length}" max="7" aria-label="응답한 초기 확인 문제 수"></progress>
      <p class="muted small">시간 제한은 없어요. 정답과 해설은 테스트를 마친 뒤 멘토와 함께 확인해요.</p>
      <h2 class="prompt" id="initial-prompt" tabindex="-1">${esc(q.prompt)}</h2>
      <div class="choices" role="radiogroup" aria-labelledby="initial-prompt">${q.choices.map((c, i) => `<button class="choice${selected === c.id ? ' selected' : ''}" role="radio" aria-checked="${selected === c.id}" data-initial-question="${q.id}" data-initial-choice="${c.id}"><span class="key" aria-hidden="true">${'ABCD'[i]}</span><span>${esc(c.value)}</span></button>`).join('')}</div>
      <div class="action-bar"><button class="primary large" data-initial-question="${q.id}" data-initial-action="submit" ${selected ? '' : 'disabled'}>답 제출하고 계속 ${ICON.arrow}</button>
      <button class="ghost" data-initial-question="${q.id}" data-initial-action="unknown">잘 모르겠어요</button></div><p class="muted small">응답은 자동 저장돼요. 나중에 같은 브라우저에서 이어서 풀 수 있어요.</p></section>`;
  } else {
    const point = summary.startingPoint;
    html = `<section class="card question-card"><span class="pill ok">7문제 확인 완료</span><h2>첫 수업을 위한 준비가 끝났어요</h2>
      <p>정답 ${summary.counts.correct} · 추가 확인 ${summary.counts.incorrect} · 모름 ${summary.counts.abstained}</p>
      <p class="muted">${point ? `멘토가 첫 수업 시작 개념을 ‘${esc(conceptName(catalog, point.conceptId))}’로 정했어요.` : '멘토가 결과를 보고 첫 수업 시작점과 문제를 정할 거예요. 멘토 화면에서 결과를 확인할 수 있어요.'}</p>
      ${resultTable(summary)}<p class="muted small">${caveat}</p><div class="action-bar">${dismiss}</div></section>`;
  }
  root.innerHTML = `<div class="page-head"><h2>나의 첫 배움길</h2></div>${html}${ui.initialError ? `<p class="msg warn" role="alert">${esc(ui.initialError)}</p>` : ''}`;
  root.onclick = event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    ui.initialError = null;
    try {
      if (button.dataset.initialChoice) {
        ui.initialChoices ??= {};
        const current = initialAssessmentSummary(props.getState(), state.learnerId, { catalog });
        const id = current.entries.find(e => e.result === 'pending')?.questionId;
        if (id !== button.dataset.initialQuestion) return;
        ui.initialChoices[id] = button.dataset.initialChoice;
      } else if (button.dataset.initialAction === 'start') {
        ui.initialAssessmentOpen = true; props.startInitialAssessment();
      } else if (['submit', 'unknown'].includes(button.dataset.initialAction)) {
        const current = initialAssessmentSummary(props.getState(), state.learnerId, { catalog });
        const id = current.entries.find(e => e.result === 'pending')?.questionId;
        if (!id || id !== button.dataset.initialQuestion) return;
        const unknown = button.dataset.initialAction === 'unknown';
        props.submitInitialAnswer({ assessmentId: current.assessmentId, questionId: id, choiceId: unknown ? null : ui.initialChoices?.[id] ?? null, abstained: unknown });
        ui.initialChoices = {};
      } else if (button.dataset.initialAction === 'dismiss') {
        ui.initialAssessmentOpen = false; ui.initialAssessmentDismissed = true;
      } else return;
    } catch { ui.initialError = '응답을 처리하지 못했어요. 현재 문제를 다시 확인해 주세요.'; }
    props.syncVisibility?.();
    props.rerender();
    root.querySelector?.('#initial-prompt')?.focus();
  };
  return true;
}

export function initialAssessmentPanel(state, catalog, ui) {
  const summary = initialAssessmentSummary(state, state.learnerId, { catalog });
  if (!summary) return `<section class="card"><h3>${ICON.target} 첫 수준 확인</h3><p class="muted">아직 시작하지 않았어요. 멘티 화면에서 7문제 확인을 시작할 수 있어요.</p><p class="muted small">${caveat}</p></section>`;
  if (summary.status !== 'completed') return `<section class="card"><h3>${ICON.target} 첫 수준 확인 · 진행 중</h3><p>${7 - summary.counts.pending} / 7문제 응답 · 완료되면 시작점을 선택할 수 있어요.</p></section>`;
  if (ui.initialAssessmentFor !== summary.assessmentId) {
    Object.assign(ui, { initialAssessmentFor: summary.assessmentId, initialConceptId: null, initialQuestionId: null, initialReason: '', initialPlanError: null });
  }
  const point = summary.startingPoint;
  const concepts = catalog.concepts.filter(c => initialQuestionOptions(catalog, c.id).length);
  const selectedConcept = ui.initialConceptId ?? summary.recommendation.conceptId;
  const questions = initialQuestionOptions(catalog, selectedConcept);
  const selectedQuestion = questions.find(q => q.id === ui.initialQuestionId)?.id ?? questions[0]?.id;
  return `<section class="card initial-mentor"><h3>${ICON.target} 첫 수준 확인 결과</h3>
    <p>정답 ${summary.counts.correct} · 추가 확인 ${summary.counts.incorrect} · 모름 ${summary.counts.abstained}</p>
    <p class="muted small">${caveat}</p>${resultTable(summary)}
    ${point ? `<div class="initial-decision"><b>첫 수업 시작 개념: ${esc(conceptName(catalog, point.conceptId))}</b><p>첫 문제: ${esc(catalog.questions.find(q => q.id === point.questionId)?.prompt ?? point.questionId)}</p>
      ${point.reason ? `<p class="muted">선택 이유: ${esc(point.reason)}</p>` : ''}<button class="ghost" data-goto="learning" data-path="${esc(point.pathId)}">지정한 학습 열기 ${ICON.arrow}</button></div>` : `
      <div class="msg"><b>추천: ${esc(conceptName(catalog, summary.recommendation.conceptId))}</b><p>${esc(summary.recommendation.reason)} 추천은 바꿀 수 있어요.</p></div>
      <div class="grid"><label class="field">첫 수업 시작 개념<select id="initial-concept">${concepts.map(c => `<option value="${esc(c.id)}" ${selectedConcept === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field">첫 문제<select id="initial-question">${questions.map(q => `<option value="${esc(q.id)}" ${selectedQuestion === q.id ? 'selected' : ''}>${esc(q.reference?.questionType ?? q.prompt)}</option>`).join('')}</select></label></div>
      <label class="field">선택 이유 (선택)<textarea id="initial-reason" rows="2" maxlength="1000" placeholder="첫 수업에서 함께 확인할 내용을 적어 주세요.">${esc(ui.initialReason ?? '')}</textarea></label>
      <p class="muted small">시작 개념은 멘토의 수업 계획으로 남아요. 멘티는 지정된 첫 문제를 풀고 기존 개념 확인·보충 학습으로 이어가요. 문항은 자체 제작한 기초 문제예요.</p>
      ${ui.initialPlanError ? `<p class="msg warn" role="alert">${esc(ui.initialPlanError)}</p>` : ''}
      <button class="primary" data-initial-action="plan" ${questions.length ? '' : 'disabled'}>멘토가 확정하고 첫 문제 지정</button>`}</section>`;
}

export function handleInitialAssessmentAction(button, props) {
  if (button.dataset.initialAction !== 'plan') return false;
  const { ui, catalog } = props;
  const summary = initialAssessmentSummary(props.getState(), props.getState().learnerId, { catalog });
  try {
    const conceptId = ui.initialConceptId ?? summary.recommendation.conceptId;
    const choices = initialQuestionOptions(catalog, conceptId);
    const questionId = choices.find(q => q.id === ui.initialQuestionId)?.id ?? choices[0]?.id;
    const pathId = props.planInitialLesson({ assessmentId: summary.assessmentId, conceptId, questionId, reason: ui.initialReason ?? '' });
    Object.assign(ui, { mentorPathId: pathId, learnerPathId: pathId, initialAssessmentOpen: false, initialAssessmentDismissed: false, initialPlanError: null, flash: '첫 수업 시작점과 문제를 지정했어요.' });
  } catch { ui.initialPlanError = '시작점과 문제를 지정하지 못했어요. 결과와 선택한 문항을 다시 확인해 주세요.'; }
  props.syncVisibility?.();
  props.rerender();
  return true;
}

export function initialLearningNote(state, catalog) {
  const summary = initialAssessmentSummary(state, state.learnerId, { catalog });
  return `<section class="initial-learning-note"><div>${summary?.startingPoint ? `<span class="muted small">첫 수업 시작 개념</span><br><b>${esc(conceptName(catalog, summary.startingPoint.conceptId))}</b>` : '<span>첫 수준 확인으로 시작점을 함께 정해요.</span>'}</div><button class="ghost small" data-action="initial-open">${summary?.status === 'completed' ? '초기 확인 결과' : '첫 수준 확인'}</button></section>`;
}

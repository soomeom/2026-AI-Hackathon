// 멘티 화면 (Brilliant 참고: 한 번에 한 문제, 진행 표시, 답한 뒤 바로 피드백 → 계속).
// 채점·다음 단계 계산은 하지 않고 엔진 결과만 보여 준다.
// renderLearner({ root, state, catalog, dispatch, ui, rerender })

import { renderPathResult } from './learning-overview.js';
import { renderInitialAssessment, initialLearningNote } from './initial-assessment.js';
import { esc, FLOW, STAGE_LABEL, REASON_TEXT, SKIPPABLE, ORIGIN_LABEL, ICON, mathHtml, choiceHtml, sourceLabel, questionBodyHtml, questionLabelHtml } from './text.js';

const LEARN_STAGES = FLOW.filter((s) => s !== 'completed');
const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
const STAGE_HINT = {
  original_attempt: '먼저 혼자 풀어 봐요.',
  concept_check: '어느 부분에서 막혔는지 짧게 확인해요.',
  foundation_practice: '필요한 기초를 작은 문제로 연습해요.',
  similar_practice: '같은 방법을 숫자가 다른 문제에 적용해요.',
  original_retry: '처음 틀린 문제에 다시 도전해요.',
  transfer_check: '처음 보는 문제로 혼자 풀 수 있는지 확인해요.',
};
const FEEDBACK = {
  correct: { title: '정답이에요!', text: '좋아요. 이 방법을 기억해 두세요.' },
  incorrect: { title: '이번엔 아니에요', text: '괜찮아요. 틀린 부분이 다음 연습의 출발점이 돼요.' },
  abstained: { title: '모른다고 표시했어요', text: '솔직하게 표시해 줘서 좋아요. 멘토도 이 기록을 함께 봐요.' },
};

const questionOf = (catalog, id) => catalog.questions.find((q) => q.id === id);
const conceptName = (catalog, id) => catalog.concepts.find((c) => c.id === id)?.name ?? id;

export function activeLearnerPath(state, ui) {
  const paths = (state.paths ?? []).filter((p) => p.learnerId === state.learnerId);
  return paths.find((p) => p.id === ui.learnerPathId) ?? paths.find((p) => p.status === 'active' || p.status === 'paused') ?? paths.at(-1);
}

export function renderLearner(props) {
  if (renderInitialAssessment(props)) return;
  const { root, state, catalog, dispatch, ui, rerender } = props;

  const learner = state.learners?.find((l) => l.id === state.learnerId);
  const paths = (state.paths ?? []).filter((p) => p.learnerId === state.learnerId);
  const path = activeLearnerPath(state, ui);
  const terminal = path && ['completed', 'needs_mentor'].includes(path.stage);

  let html = terminal ? `<p class="meta">이번 학습 · ${questionLabelHtml(questionOf(catalog, path.questionId), catalog)}</p>` : `<div class="page-head"><h2>${esc(learner?.name ?? '학습자')}님의 배움길</h2></div>${initialLearningNote(state, catalog)}`;
  if (!path) {
    root.innerHTML = `${html}<div class="card empty">${ICON.book}<p><b>멘토가 지정한 문제가 아직 없어요.</b></p>
      <p class="muted">멘토 화면에서 문제를 지정하면 여기에 나타나요.</p></div>`;
    root.onclick = null;
    return;
  }

  if (paths.length > 1) {
    html += `<div class="tabs" role="tablist" aria-label="지정된 문제">${paths.map((p) => `
      <button role="tab" aria-selected="${p.id === path.id}" data-path="${esc(p.id)}">
        ${questionLabelHtml(questionOf(catalog, p.questionId), catalog)} <span class="muted small">· ${STAGE_LABEL[p.stage] ?? ''}</span>
      </button>`).join('')}</div>`;
  }

  html += terminal ? `${renderPathResult(path, paths)}<button class="ghost" data-action="initial-open">첫 수준 확인 결과 보기</button>` : progress(path) + body(path, catalog, ui);
  root.innerHTML = html;

  root.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.action === 'initial-open') { ui.initialAssessmentOpen = true; props.syncVisibility?.(); rerender(); return; }
    if (b.dataset.resultPath) {
      if (!paths.some(p => p.id === b.dataset.resultPath && ['active','paused'].includes(p.status))) return;
      ui.learnerPathId = b.dataset.resultPath; ui.feedback = null;
      props.syncVisibility?.(); rerender(); root.querySelector?.('#q-prompt')?.focus?.(); return;
    }
    if (b.dataset.action === 'result-roadmap') {
      ui.learnerTab = 'roadmap'; props.syncVisibility?.(); rerender(); root.querySelector?.('#map-heading')?.focus?.(); return;
    }
    const item = path.items.find((i) => !i.answered);
    const send = (cmd) => dispatch({ pathId: path.id, ...cmd });
    if (b.dataset.path) { ui.learnerPathId = b.dataset.path; ui.feedback = null; props.syncVisibility?.(); rerender(); return; }
    if (b.dataset.choice) { ui.selected[item.id] = b.dataset.choice; rerender(); return; }
    switch (b.dataset.action) {
      case 'submit':
        ui.feedback = { pathId: path.id, itemId: item.id };
        send({ type: 'SUBMIT_ANSWER', itemId: item.id, submissionId: `${item.id}:submit`, choiceId: ui.selected[item.id] });
        break;
      case 'abstain':
        ui.feedback = { pathId: path.id, itemId: item.id };
        send({ type: 'SUBMIT_ANSWER', itemId: item.id, submissionId: `${item.id}:submit`, abstained: true });
        break;
      case 'continue': ui.feedback = null; break;
      case 'hint':
        ui.help[item.id] = Math.max(ui.help[item.id] ?? 0, 1);
        send({ type: 'USE_HELP', itemId: item.id, helpType: 'hint' });
        break;
      case 'solution':
        ui.help[item.id] = 2;
        send({ type: 'USE_HELP', itemId: item.id, helpType: 'solution' });
        break;
      case 'mentor':
        send({ type: 'REQUEST_MENTOR', reason: '학생이 도움을 요청함' });
        ui.flash = '멘토에게 도움 요청을 남겼어요. 다음 수업에서 함께 봐요.';
        break;
      case 'pause': send({ type: 'PAUSE' }); break;
      case 'resume': send({ type: 'RESUME' }); break;
      case 'next': ui.feedback = null; send({ type: 'ADVANCE' }); break;
      case 'skip-ask': ui.confirmSkip = path.id; break;
      case 'skip-cancel': ui.confirmSkip = null; break;
      case 'skip':
        ui.confirmSkip = null;
        ui.feedback = null;
        send({ type: 'ADVANCE', mode: 'skip' });
        break;
      default: return;
    }
    rerender();
  };

  // 화면에 처음 보이는 문항은 노출을 기록한다 (렌더링이 반복돼도 엔진이 한 번만 기록)
  const item = path.items.find((i) => !i.answered);
  if (item && !showingFeedback(path, ui) && !item.presentedAt && path.status === 'active' && ui.role === 'learner' && !document.hidden) {
    queueMicrotask(() => dispatch({ type: 'PRESENT_QUESTION', pathId: path.id, itemId: item.id }));
  }
}

const showingFeedback = (path, ui) => ui.feedback?.pathId === path.id && path.items.some((i) => i.id === ui.feedback.itemId && i.answered);

function progress(path) {
  const visited = new Set((path.stageHistory ?? []).map((h) => h.to));
  const nowIndex = LEARN_STAGES.indexOf(path.stage);
  const cls = (s, i) => {
    if ((path.skippedStageIds ?? []).includes(s)) return 'skipped';
    if (path.stage === 'completed') return visited.has(s) ? 'done' : '';
    if (s === path.stage) return 'now';
    return visited.has(s) || (nowIndex > i && nowIndex !== -1) ? 'done' : '';
  };
  const label = path.stage === 'completed' ? '오늘의 배움길 완료'
    : path.stage === 'needs_mentor' ? '멘토와 함께 확인'
      : `${nowIndex + 1}단계 · ${STAGE_LABEL[path.stage]}`;
  return `<section class="progress" aria-label="학습 진행">
    <div class="progress-head"><b>${label}</b><span class="muted small">${path.stage === 'foundation_practice' ? `${path.foundationRound}회차 연습` : ''}</span></div>
    <ol class="segments">${LEARN_STAGES.map((s, i) => `<li class="${cls(s, i)}" title="${STAGE_LABEL[s]}"></li>`).join('')}</ol>
    <div class="segment-labels" aria-hidden="true">${LEARN_STAGES.map((s) => `<span class="${s === path.stage ? 'now' : ''}">${STAGE_LABEL[s]}</span>`).join('')}</div>
  </section>`;
}

function body(path, catalog, ui) {
  const flash = ui.flash ? `<div class="msg" role="status">${esc(ui.flash)}</div>` : '';
  ui.flash = null;

  if (path.status === 'paused') {
    return `<section class="card question-card">${flash}<p class="feedback-title">${ICON.pause} 잠시 멈췄어요</p>
      <p class="muted">풀이 시간도 함께 멈춰 있어요. 준비되면 이어서 풀어요.</p>
      <div class="action-bar"><button class="primary large" data-action="resume">${ICON.play} 이어서 풀기</button></div></section>`;
  }
  if (showingFeedback(path, ui)) return feedbackView(path, ui, flash, catalog);

  const item = path.items.find((i) => !i.answered);
  if (!item) return nextView(path, flash);
  const done = path.items.filter((i) => i.answered).length;
  const selected = ui.selected[item.id];
  const help = ui.help[item.id] ?? 0;
  const concepts = [...new Set(item.conceptIds ?? [])].map((id) => conceptName(catalog, id));

  return `<section class="card question-card" aria-labelledby="q-prompt">
    ${flash}
    <div class="chips">
      <span class="pill primary">${ICON.target} ${esc(STAGE_LABEL[path.stage])}</span>
      ${concepts.map((c) => `<span class="pill neutral">${esc(c)}</span>`).join('')}
      <span class="dots" aria-label="${path.items.length}문제 중 ${done + 1}번째">${path.items.map((_, i) => `<i class="${i < done ? 'done' : i === done ? 'now' : ''}"></i>`).join('')}</span>
    </div>
    <p class="meta">${esc(STAGE_HINT[path.stage] ?? '')}</p>
    ${item.reference ? `<p class="source-line">${ICON.doc} ${esc(sourceLabel(item))}</p>` : `<p class="meta">${esc(ORIGIN_LABEL[item.origin] ?? '')}</p>`}
    ${questionBodyHtml(item, { promptId: 'q-prompt' })}
    <div class="choices${item.format === 'image' ? ' compact' : ''}" role="radiogroup" aria-labelledby="q-prompt">${item.choices.map((c, i) => `
      <button role="radio" aria-checked="${selected === c.id}" class="choice${selected === c.id ? ' selected' : ''}" data-choice="${esc(c.id)}"${item.format === 'image' ? ` aria-label="${i + 1}번"` : ''}>
        ${item.format === 'image' ? '' : `<span class="key" aria-hidden="true">${KEYS[i] ?? i + 1}</span>`}<span>${choiceHtml(c)}</span></button>`).join('')}
    </div>
    ${help ? `<div class="solution">${ICON.bulb} ${(help === 1 ? item.solutionSteps.slice(0, 1) : item.solutionSteps).map((s) => mathHtml(s)).join(' → ')}
      <div class="muted small">${help === 1 ? '첫 단계만 보여 줬어요.' : '풀이를 본 문제는 혼자 푼 기록과 구분돼요.'}</div></div>` : ''}
    <div class="action-bar">
      <button class="primary large" data-action="submit" ${selected ? '' : 'disabled'}>제출하기</button>
      <button class="large" data-action="abstain">잘 모르겠어요</button>
    </div>
    <div class="help-row" aria-label="도움">
      ${item.solutionSteps?.length ? `<button class="ghost" data-action="hint">${ICON.bulb} 힌트</button>
      <button class="ghost" data-action="solution">${ICON.book} 풀이 보기</button>` : ''}
      <button class="ghost" data-action="mentor">${ICON.hand} 멘토에게 도움 요청</button>
      <button class="ghost" data-action="pause">${ICON.pause} 잠시 멈추기</button>
      ${SKIPPABLE.includes(path.stage) ? skipControl(path, ui) : ''}
    </div>
  </section>`;
}

function skipControl(path, ui) {
  if (ui.confirmSkip !== path.id) return `<button class="ghost" data-action="skip-ask">${ICON.skip} 이 단계 건너뛰기</button>`;
  return `<div class="msg warn" style="width:100%">이 단계를 건너뛰면 멘토에게 ‘확인 필요’로 표시돼요. 건너뛸까요?
    <div class="row"><button data-action="skip">건너뛰기</button><button class="ghost" data-action="skip-cancel">계속 풀기</button></div></div>`;
}

function feedbackView(path, ui, flash, catalog) {
  const item = path.items.find((i) => i.id === ui.feedback.itemId);
  const fb = FEEDBACK[item.result];
  const last = path.items.every((i) => i.answered);
  const icon = item.result === 'correct' ? ICON.check : item.result === 'incorrect' ? ICON.x : ICON.help;
  return `<section class="feedback ${item.result}" role="status" aria-live="polite">
    ${flash}
    <p class="feedback-title">${icon} ${fb.title}</p>
    <p>${fb.text}</p>
    <p class="muted small">문제: ${questionLabelHtml(item, catalog)}</p>
    ${last ? nextBox(path) : '<div class="action-bar"><button class="primary large" data-action="continue">계속 ' + ICON.arrow + '</button></div>'}
  </section>`;
}

function nextView(path, flash) {
  return `<section class="card question-card">${flash}${nextBox(path)}</section>`;
}

function nextBox(path) {
  const r = path.recommendation;
  if (!r) return '';
  const warn = r.nextStage === 'needs_mentor' || r.mentorCheckSuggested;
  return `<div class="next-box">
    <p><b>${esc(REASON_TEXT[r.reason] ?? '다음 단계로 가요.')}</b></p>
    ${warn && r.mentorCheckSuggested ? '<p class="warn-text small">유사 문제가 어려웠어요. 멘토와 함께 확인하는 것도 좋아요.</p>' : ''}
    <button class="primary large" data-action="next">다음: ${STAGE_LABEL[r.nextStage]} ${ICON.arrow}</button>
  </div>`;
}

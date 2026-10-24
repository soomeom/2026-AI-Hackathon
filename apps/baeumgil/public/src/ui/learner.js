// 멘티 화면. 채점·다음 단계 계산은 하지 않고 엔진 결과만 보여 준다.
// renderLearner({ root, state, catalog, dispatch, ui, rerender })
import { esc, STAGE_LABEL, REASON_TEXT, SKIPPABLE, ORIGIN_LABEL, resultBadge, stepsBar } from './text.js';

const questionOf = (catalog, id) => catalog.questions.find((q) => q.id === id);

export function activeLearnerPath(state, ui) {
  const paths = (state.paths ?? []).filter((p) => p.learnerId === state.learnerId);
  return paths.find((p) => p.id === ui.learnerPathId) ?? paths.find((p) => p.status === 'active' || p.status === 'paused') ?? paths.at(-1);
}

export function renderLearner({ root, state, catalog, dispatch, ui, rerender }) {
  const learner = state.learners?.find((l) => l.id === state.learnerId);
  const paths = (state.paths ?? []).filter((p) => p.learnerId === state.learnerId);
  const path = activeLearnerPath(state, ui);

  let html = `<div class="page-head"><h2>${esc(learner?.name ?? '학습자')}님의 배움길</h2></div>`;
  if (!path) {
    root.innerHTML = `${html}<div class="card empty">멘토가 지정한 문제가 아직 없어요.<br><span class="muted">멘토 화면에서 문제를 지정하면 여기에 나타나요.</span></div>`;
    return;
  }

  if (paths.length > 1) {
    html += `<div class="tabs" role="tablist" aria-label="지정된 문제">${paths.map((p) => `
      <button role="tab" aria-selected="${p.id === path.id}" data-path="${esc(p.id)}">
        ${esc(questionOf(catalog, p.questionId)?.prompt ?? p.questionId)} <span class="muted">· ${STAGE_LABEL[p.stage] ?? ''}</span>
      </button>`).join('')}</div>`;
  }

  html += `<section class="card">${stepsBar(path)}${body(path, catalog, ui)}</section>`;
  root.innerHTML = html;

  root.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    const item = path.items.find((i) => !i.answered);
    const send = (cmd) => dispatch({ pathId: path.id, ...cmd });
    const { action } = b.dataset;
    if (b.dataset.path) { ui.learnerPathId = b.dataset.path; rerender(); return; }
    if (b.dataset.choice) { ui.selected[item.id] = b.dataset.choice; rerender(); return; }
    switch (action) {
      case 'submit':
        send({ type: 'SUBMIT_ANSWER', itemId: item.id, submissionId: `${item.id}:submit`, choiceId: ui.selected[item.id] });
        break;
      case 'abstain':
        send({ type: 'SUBMIT_ANSWER', itemId: item.id, submissionId: `${item.id}:submit`, abstained: true });
        break;
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
        ui.flash = '멘토에게 도움 요청을 남겼어요.';
        break;
      case 'pause': send({ type: 'PAUSE' }); break;
      case 'resume': send({ type: 'RESUME' }); break;
      case 'next': send({ type: 'ADVANCE' }); break;
      case 'skip-ask': ui.confirmSkip = path.id; break;
      case 'skip-cancel': ui.confirmSkip = null; break;
      case 'skip':
        ui.confirmSkip = null;
        send({ type: 'ADVANCE', mode: 'skip' });
        break;
      default: return;
    }
    rerender();
  };

  // 화면에 처음 보이는 문항은 노출을 기록한다 (렌더링이 반복돼도 엔진이 한 번만 기록)
  const item = path.items.find((i) => !i.answered);
  if (item && !item.presentedAt && path.status === 'active' && ui.role === 'learner' && !document.hidden) {
    queueMicrotask(() => dispatch({ type: 'PRESENT_QUESTION', pathId: path.id, itemId: item.id }));
  }
}

function body(path, catalog, ui) {
  const flash = ui.flash ? `<div class="msg" role="status">${esc(ui.flash)}</div>` : '';
  ui.flash = null;

  if (path.status === 'paused') {
    return `<div class="msg">잠시 멈춘 상태예요. 풀이 시간도 멈춰 있어요.
      <div class="row"><button class="primary" data-action="resume">이어서 풀기</button></div></div>`;
  }
  if (path.stage === 'needs_mentor') {
    return `${flash}<div class="msg warn"><b>멘토와 함께 확인해요.</b><br>지금까지 푼 기록은 저장되어 멘토에게 전달돼요.
      ${path.transferStatus === 'not_measured' ? '<br><span class="muted">새 문제를 준비하지 못해 이번 확인은 멘토와 진행해요.</span>' : ''}</div>`;
  }
  if (path.stage === 'completed') return completedView(path);

  const item = path.items.find((i) => !i.answered);
  const done = path.items.filter((i) => i.answered).length;
  const last = [...path.items].reverse().find((i) => i.answered);
  let html = flash;

  if (item) {
    const selected = ui.selected[item.id];
    const help = ui.help[item.id] ?? 0;
    html += `<div class="meta">${STAGE_LABEL[path.stage]}${path.stage === 'foundation_practice' ? ` ${path.foundationRound}회차` : ''}
        · ${done + 1} / ${path.items.length} · ${ORIGIN_LABEL[item.origin] ?? ''}</div>
      ${last ? `<div class="meta">방금 응답: ${resultBadge(last.result)}</div>` : ''}
      <p class="prompt">${esc(item.prompt)}</p>
      <div class="choices" role="radiogroup" aria-label="선택지">${item.choices.map((c) => `
        <button role="radio" aria-checked="${selected === c.id}" class="choice${selected === c.id ? ' selected' : ''}" data-choice="${esc(c.id)}">${esc(c.value)}</button>`).join('')}
      </div>
      <div class="row">
        <button class="primary" data-action="submit" ${selected ? '' : 'disabled'}>제출</button>
        <button data-action="abstain">잘 모르겠어요</button>
      </div>
      <div class="row small">
        <button class="ghost" data-action="hint">힌트</button>
        <button class="ghost" data-action="solution">풀이 보기</button>
        <button class="ghost" data-action="mentor">멘토에게 도움 요청</button>
        <button class="ghost" data-action="pause">잠시 멈추기</button>
      </div>
      ${help ? `<div class="solution">${(help === 1 ? item.solutionSteps.slice(0, 1) : item.solutionSteps).map((s) => `→ ${esc(s)}`).join('<br>')}
        ${help === 1 ? '<br><span class="muted">첫 단계만 보여 줬어요.</span>' : '<br><span class="muted">풀이를 본 문제는 혼자 푼 기록과 구분돼요.</span>'}</div>` : ''}`;
  } else if (path.recommendation) {
    const r = path.recommendation;
    const warn = r.nextStage === 'needs_mentor' || r.mentorCheckSuggested;
    html += `${last ? `<div class="meta">방금 응답: ${resultBadge(last.result)}</div>` : ''}
      <div class="msg ${warn ? 'warn' : ''}" role="status">${esc(REASON_TEXT[r.reason] ?? '다음 단계로 가요.')}
        ${r.mentorCheckSuggested ? '<br>유사 문제가 어려웠어요. 멘토와 함께 확인하는 것도 좋아요.' : ''}
        <div class="row"><button class="primary" data-action="next">다음: ${STAGE_LABEL[r.nextStage]}</button></div>
      </div>`;
  }

  if (SKIPPABLE.includes(path.stage)) {
    html += ui.confirmSkip === path.id
      ? `<div class="msg warn">이 단계를 건너뛰면 멘토에게 ‘확인 필요’로 표시돼요. 건너뛸까요?
          <div class="row"><button data-action="skip">건너뛰기</button><button class="ghost" data-action="skip-cancel">계속 풀기</button></div></div>`
      : '<div class="row small"><button class="ghost" data-action="skip-ask">이 단계 건너뛰기</button></div>';
  }
  return html;
}

function completedView(path) {
  const transfer = path.transferStatus === 'not_measured' ? '<span class="muted">미측정</span>' : resultBadge(path.transferResult);
  const first = (path.pastItems ?? []).find((i) => i.stage === 'original_attempt');
  return `<div class="msg"><b>오늘 학습을 마쳤어요!</b></div>
    <table class="table"><tbody>
      <tr><th scope="row">처음 풀이</th><td>${resultBadge(first?.result)}</td></tr>
      <tr><th scope="row">다시 도전</th><td>${path.retryResult ? resultBadge(path.retryResult) : '<span class="muted">해당 없음</span>'}</td></tr>
      <tr><th scope="row">처음 보는 문제</th><td>${transfer}</td></tr>
    </tbody></table>
    ${path.skippedStageIds?.length ? `<p class="muted">건너뛴 단계: ${path.skippedStageIds.map((s) => STAGE_LABEL[s]).join(', ')}</p>` : ''}
    <p class="muted">결과는 멘토가 다음 수업 준비에 함께 봐요.</p>`;
}

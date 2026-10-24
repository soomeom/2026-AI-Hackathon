// 첫 수준 확인 화면 (적응형 6영역 진단). 멘티: 한 문제씩 풀기 / 멘토: 영역별 결과 확인·시작점 확정.
import {
  initialAssessmentSummary, initialQuestionOptions, initialConceptOptions, pauseInitialAssessment, resumeInitialAssessment,
  openInitialRoadmap, answerInitialRoadmap,
} from '../learning/initial-assessment.js';
import { esc, ICON, questionBodyHtml, choiceHtml, sourceLabel } from './text.js';
import { renderRoadmap, handleRoadmapAction } from './roadmap.js';
import { DIAGNOSTIC_STAGE_NAMES } from '../learning/roadmap.js';
import { renderDiagnosticOverview, nextDiagnosticCard } from './learning-overview.js';
import { levelLadder, ladderCells, ladderLegend, renderDomainSteps } from './visuals.js';
import { domainProgress, renderDomainBars } from './mentor-diagrams.js';

const RESULT = { correct: '정답', incorrect: '추가 확인', abstained: '모름' };
const EVIDENCE_PILL = { demonstrated: 'ok', insufficient: 'warn', not_demonstrated: 'bad' };
const conceptName = (catalog, id) => catalog.concepts.find(c => c.id === id)?.name ?? id;
const hasPath = state => (state.paths ?? []).some(p => p.learnerId === state.learnerId);
const caveat = '선별한 검정고시 기출(2025년 1회)과 기초 확인 문항으로 영역별 시작점을 추정해요. 학년 전체 숙달이나 합격을 판정하는 검사가 아니에요.';
const plainLabel = q => (q.reference?.year ? `${q.reference.year}년 ${q.reference.session}회 ${q.reference.qualification} ${q.reference.questionNumber}번` : String(q.prompt ?? q.id).replace(/\$/g, ''));
const now = () => new Date().toISOString();

export function isInitialAssessmentVisible(state, ui) {
  const summary = initialAssessmentSummary(state, state.learnerId);
  return Boolean(ui.initialAssessmentOpen || (!summary?.startingPoint && !ui.initialAssessmentDismissed));
}

function domainTable(summary, { forMentor }) {
  const ladder = new Map(levelLadder(summary).map(r => [r.id, r]));
  const rows = summary.report.domains.map(d => `<tr><th scope="row">${esc(d.name)}</th>
    <td>${ladderCells(ladder.get(d.id))}</td>
    <td><span class="pill ${d.attempted ? EVIDENCE_PILL[d.evidence] : 'neutral'}">${esc(d.label)}</span>${d.provisional && d.attempted ? ' <span class="muted small">(확인 중단)</span>' : ''}</td>
    ${forMentor ? `<td>${d.correct}/${d.attempted} <span class="muted small">혼자 ${d.independentCorrect}</span></td><td>${d.weak.length ? esc(d.weak.join(', ')) : '<span class="muted">—</span>'}</td>` : ''}</tr>`).join('');
  return `${ladderLegend()}<div class="scroll-x"><table class="table initial-results"><caption class="sr-only">영역별 첫 수준 확인 결과</caption>
    <thead><tr><th scope="col">영역</th><th scope="col">기초·선수·고졸</th><th scope="col">확인 수준</th>${forMentor ? '<th scope="col">응답</th><th scope="col">다시 볼 개념</th>' : ''}</tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

export function renderInitialAssessment(props) {
  const state = props.getState(); const { root, catalog, ui } = props;
  if (!isInitialAssessmentVisible(state, ui)) return false;
  const summary = initialAssessmentSummary(state, state.learnerId, { catalog });
  const dismiss = hasPath(state) ? '<button class="ghost" data-initial-action="dismiss">기존 학습 이어가기</button>' : '';
  let html;
  if (!summary) {
    html = `<section class="card question-card initial-intro"><span class="pill primary">첫 멘토링 준비</span>
      <h2>우리, 어디부터 시작할까요?</h2><p>검정고시 문제로 지금 수학 실력을 영역별로 살펴봐요. 결과는 멘토가 첫 수업을 준비하는 데 써요.</p>
      <div class="initial-facts"><span>6개 영역</span><span>12~${catalog.diagnostic?.maxQuestions??40}문제</span><span>시간 제한 없음</span><span>모름 선택 가능</span></div>
      <p class="muted">고졸 문제부터 시작해요. 어려우면 관련된 중학교 기초 문제로 바뀌니 걱정하지 않아도 돼요.</p>
      <p class="muted small">${caveat} 응답은 이 브라우저에 저장되고 멘토가 볼 수 있어요.</p>
      <div class="action-bar"><button class="primary large" data-initial-action="start">첫 수준 확인 시작 ${ICON.arrow}</button>${dismiss}</div></section>`;
  } else if (summary.status === 'active') {
    const record = state.initialAssessments.find(a => a.id === summary.assessmentId);
    const q = catalog.questions.find(x => x.id === summary.currentQuestionId);
    if (!record.presentedQuestionIds.includes(q.id)) {
      props.presentInitialQuestion({ assessmentId: record.id, questionId: q.id });
      return true;
    }
    const selected = ui.initialChoices?.[q.id];
    const domainName = summary.report.domains[summary.domainIndex]?.name ?? '';
    html = `<section class="card question-card"><div class="chips"><span class="pill primary">첫 수준 확인</span><span class="pill neutral">${esc(domainName)}</span>
        <span class="muted small">영역 ${Math.min(summary.domainIndex + 1, summary.domainCount)}/${summary.domainCount} · ${summary.counts.total + 1}번째 문제 · 최대 ${summary.maxQuestions}문제</span></div>
      ${renderDomainSteps(summary.report.domains, summary.domainIndex)}
      ${summary.counts.total ? `<p class="muted small">${esc(summary.transition)}</p>` : ''}
      ${q.reference ? `<p class="source-line">${ICON.doc} ${esc(sourceLabel(q))}</p>` : '<p class="meta">기초 개념 확인 문항 (자체 제작)</p>'}
      ${questionBodyHtml(q, { promptId: 'initial-prompt' })}
      <div class="choices" role="radiogroup" aria-labelledby="initial-prompt">${q.choices.map((c, i) => `<button class="choice${selected === c.id ? ' selected' : ''}" role="radio" aria-checked="${selected === c.id}" data-initial-question="${q.id}" data-initial-choice="${c.id}"><span class="key" aria-hidden="true">${'ABCD'[i]}</span><span>${choiceHtml(c)}</span></button>`).join('')}</div>
      <label class="check"><input type="checkbox" id="initial-help" ${ui.initialHelp ? 'checked' : ''}> 다른 사람이나 자료의 도움을 받았어요 <span class="muted small">(도움 받은 정답은 혼자 푼 근거와 구분돼요)</span></label>
      <div class="action-bar"><button class="primary large" data-initial-question="${q.id}" data-initial-action="submit" ${selected ? '' : 'disabled'}>답 제출하고 계속 ${ICON.arrow}</button>
      <button class="ghost" data-initial-question="${q.id}" data-initial-action="unknown">잘 모르겠어요</button></div>
      <div class="help-row">${summary.counts.total ? `<button class="ghost" data-initial-action="pause">${ICON.pause} 여기까지 하고 멘토에게 넘기기</button>` : ''}</div>
      <p class="muted small">정답과 해설은 확인을 마친 뒤 멘토와 함께 봐요. 응답은 자동 저장돼요.</p></section>`;
  } else {
    const point = summary.startingPoint;
    const paused = summary.stopReason === 'user_paused';
    html = summary.practice?.cardId ? `<section class="card roadmap-results">${renderRoadmap(summary.roadmap,summary.practice,catalog.questions,ui)}</section>` : ui.initialResultDetails ? `<section class="card overview-result"><button class="ghost" data-initial-action="summary">← 결과 요약</button><h2 id="result-title" tabindex="-1">영역별 결과·응답 기록</h2><span class="pill ${paused ? 'warn' : 'ok'}">${paused ? '중간까지 확인' : '첫 수준 확인 완료'} · ${summary.counts.total}문제</span>
      <p class="meta">현재 추정 수준 티어</p><h2>${esc(summary.report.tier)}</h2>
      <p class="muted">${point ? `멘토가 첫 수업 시작 단원을 ‘${esc(conceptName(catalog, point.conceptId))}’로 정했어요.` : '멘토가 결과를 보고 첫 수업 시작점과 문제를 정할 거예요.'}</p>
      ${domainTable(summary, { forMentor: false })}<p class="muted small">${caveat}</p>
      <details><summary>응답별 기록 보기</summary><ul class="initial-attempts">${summary.entries.map(e => `<li>${esc(e.domainName)} · ${esc(DIAGNOSTIC_STAGE_NAMES[e.stage] ?? e.levelName)} · ${esc(e.core)} — ${RESULT[e.result]} <span class="muted small">${esc(e.questionId)}</span></li>`).join('')}</ul></details></section>` : renderDiagnosticOverview(summary);
    if (!summary.practice?.cardId) html += `<div class="action-bar overview-secondary">${paused && !point ? '<button class="ghost" data-initial-action="resume">중단한 수준 확인 이어서 풀기</button>' : ''}${dismiss}</div>`;
  }
  root.innerHTML = `${summary?.status === 'completed' ? '' : '<div class="page-head"><h2>나의 첫 배움길</h2></div>'}${html}${ui.initialError ? `<p class="msg warn" role="alert">${esc(ui.initialError)}</p>` : ''}`;
  root.onchange = event => { if (event.target.id === 'initial-help') ui.initialHelp = event.target.checked; };
  root.onclick = event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if(handleInitialRoadmapAction(button,props))return;
    ui.initialError = null;
    try {
      const current = initialAssessmentSummary(props.getState(), state.learnerId, { catalog });
      if (button.dataset.initialAction === 'roadmap') {
        ui.learnerTab = 'roadmap';
      } else if (['details','summary'].includes(button.dataset.initialAction)) {
        ui.initialResultDetails = button.dataset.initialAction === 'details';
      } else if (button.dataset.initialAction === 'next-practice') {
        const card = nextDiagnosticCard(current);
        if (!card) return;
        if(props.practice)props.practice.open({assessmentId:current.assessmentId,cardId:card.id,baseQuestionId:card.questionIds[0]});
        else props.update(s => openInitialRoadmap(s, { assessmentId: current.assessmentId, cardId: card.id, questionId: card.questionIds[0], at: now() }, { catalog }));
      } else if (button.dataset.initialChoice) {
        ui.initialChoices ??= {};
        if (current?.currentQuestionId !== button.dataset.initialQuestion) return;
        ui.initialChoices[current.currentQuestionId] = button.dataset.initialChoice;
      } else if (button.dataset.initialAction === 'start') {
        ui.initialAssessmentOpen = true; props.startInitialAssessment();
      } else if (['submit', 'unknown'].includes(button.dataset.initialAction)) {
        const id = current?.currentQuestionId;
        if (!id || id !== button.dataset.initialQuestion) return;
        const unknown = button.dataset.initialAction === 'unknown';
        props.submitInitialAnswer({ assessmentId: current.assessmentId, questionId: id, choiceId: unknown ? null : ui.initialChoices?.[id] ?? null, abstained: unknown, helpUsed: Boolean(ui.initialHelp) });
        ui.initialChoices = {}; ui.initialHelp = false;
      } else if (button.dataset.initialAction === 'pause') {
        ui.initialResultDetails = false;
        props.update(s => pauseInitialAssessment(s, { assessmentId: current.assessmentId, at: now() }));
      } else if (button.dataset.initialAction === 'resume') {
        props.update(s => resumeInitialAssessment(s, { assessmentId: current.assessmentId, at: now() }));
      } else if (button.dataset.initialAction === 'dismiss') {
        ui.initialAssessmentOpen = false; ui.initialAssessmentDismissed = true;
      } else return;
    } catch { ui.initialError = '응답을 처리하지 못했어요. 현재 문제를 다시 확인해 주세요.'; }
    props.syncVisibility?.();
    props.rerender();
    (root.querySelector?.('#initial-prompt') ?? root.querySelector?.('#result-title') ?? root.querySelector?.('#roadmap-title') ?? root.querySelector?.('#map-heading'))?.focus?.();
  };
  return true;
}

export function initialAssessmentPanel(state, catalog, ui, { mode = 'full' } = {}) {
  const summary = initialAssessmentSummary(state, state.learnerId, { catalog });
  if (!summary) return `<section class="card"><h3>${ICON.target} 첫 수준 확인</h3><p class="muted">아직 시작하지 않았어요. 멘티 화면에서 6개 영역 확인을 시작할 수 있어요.</p><p class="muted small">${caveat}</p></section>`;
  if (summary.status !== 'completed') return `<section class="card"><h3>${ICON.target} 첫 수준 확인 · 진행 중</h3><p>${summary.counts.total}문제 응답 · 영역 ${Math.min(summary.domainIndex + 1, summary.domainCount)}/${summary.domainCount} 확인 중. 완료되면 시작점을 정할 수 있어요.</p></section>`;
  if (ui.initialAssessmentFor !== summary.assessmentId) {
    Object.assign(ui, { initialAssessmentFor: summary.assessmentId, initialConceptId: null, initialQuestionId: null, initialReason: '', initialPlanError: null });
  }
  const { report } = summary;
  const point = summary.startingPoint;
  const rec = summary.recommendation;
  const concepts = initialConceptOptions(catalog);
  const selectedConcept = ui.initialConceptId ?? rec?.conceptId ?? concepts[0]?.id;
  const questions = initialQuestionOptions(catalog, selectedConcept);
  const selectedQuestion = questions.find(q => q.id === ui.initialQuestionId)?.id ?? questions[0]?.id;
  const attempts = summary.entries.map(e => `<li><span class="pill ${e.result === 'correct' ? 'ok' : 'warn'}">${RESULT[e.result]}</span>
    ${esc(e.domainName)} · ${esc(DIAGNOSTIC_STAGE_NAMES[e.stage]??e.levelName)} · ${esc(e.core)} <span class="muted small">${esc(e.questionId)} · ${e.result === 'correct' ? (e.independent ? '혼자 처음 풀어 맞힘' : e.helpUsed ? '도움 받아 맞힘' : '이전에 본 문제') : ''}</span></li>`).join('');
  return `<section class="card initial-mentor"><h3>${ICON.target} 첫 수준 확인 결과 ${summary.stopReason === 'user_paused' ? '<span class="pill warn">학생이 중간에 멈춤</span>' : ''}</h3>
    <p class="meta">현재 추정 수준 티어</p><p><b class="initial-tier">${esc(report.tier)}</b></p>
    <p>응답 ${summary.counts.total}문제 · 정답 ${summary.counts.correct} (혼자 처음 풀어 맞힘 ${summary.counts.independentCorrect}) · 추가 확인 ${summary.counts.incorrect} · 모름 ${summary.counts.abstained}</p>
    ${mode === 'plan' ? `${renderDomainBars(domainProgress(summary, catalog))}<button class="ghost" data-goto="assessment">영역별 결과·응답 기록 확인</button>` : `${domainTable(summary, { forMentor: true })}
    <p class="muted small">${esc(report.rule)} ${esc(report.disclaimer)}</p>
    <details><summary>응답별 기록 보기</summary><ul class="initial-attempts">${attempts}</ul></details>
    <div class="row"><button class="ghost small" data-initial-action="export">${ICON.doc} 결과 JSON 저장</button><button class="ghost small" data-goto="roadmap">맞춤형 학습 로드맵 보기</button></div>`}
    ${mode === 'report' ? '<button class="primary" data-goto="planning">수업 준비하기</button>' : point ? `<div class="initial-decision"><b>첫 수업 시작 단원: ${esc(conceptName(catalog, point.conceptId))}</b><p>첫 문제: ${esc(plainLabel(catalog.questions.find(q => q.id === point.questionId) ?? { id: point.questionId }))}</p>
      ${point.reason ? `<p class="muted">선택 이유: ${esc(point.reason)}</p>` : ''}<button class="ghost" data-goto="learning" data-path="${esc(point.pathId)}">지정한 학습 열기 ${ICON.arrow}</button></div>` : `
      ${rec ? `<div class="msg"><b>추천: ${esc(rec.domainName)} → ${esc(conceptName(catalog, rec.conceptId))}</b><p>${esc(rec.reason)} 추천은 바꿀 수 있어요.</p></div>` : ''}
      <div class="grid"><label class="field">첫 수업 시작 단원<select id="initial-concept">${concepts.map(c => `<option value="${esc(c.id)}" ${selectedConcept === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field">첫 문제 (${questions.length}개)<select id="initial-question">${questions.map(q => `<option value="${esc(q.id)}" ${selectedQuestion === q.id ? 'selected' : ''}>${esc(plainLabel(q))}${q.role === 'diagnostic' ? ' · 진단에 쓴 문제' : ''}</option>`).join('')}</select></label></div>
      <label class="field">선택 이유 (선택)<textarea id="initial-reason" rows="2" maxlength="1000" placeholder="첫 수업에서 함께 확인할 내용을 적어 주세요.">${esc(ui.initialReason ?? '')}</textarea></label>
      <p class="muted small">시작 단원은 멘토의 수업 계획으로 남아요. 멘티는 지정된 기출을 풀고 개념 확인·보충 학습으로 이어가요. 진단에 쓴 문제는 이미 본 문제라 뒤로 미뤘어요.</p>
      ${ui.initialPlanError ? `<p class="msg warn" role="alert">${esc(ui.initialPlanError)}</p>` : ''}
      <button class="primary" data-initial-action="plan" ${questions.length ? '' : 'disabled'}>멘토가 확정하고 첫 문제 지정</button>`}</section>`;
}

function exportResult(summary) {
  const blob = new Blob([JSON.stringify({ exportedAt: now(), report: summary.report, attempts: summary.entries, roadmap: summary.roadmap, practice: summary.practice }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `baeumgil-initial-${summary.assessmentId}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function handleInitialAssessmentAction(button, props) {
  if(handleInitialRoadmapAction(button,props))return true;
  const action = button.dataset.initialAction;
  if (!['plan', 'export'].includes(action)) return false;
  const { ui, catalog } = props;
  const summary = initialAssessmentSummary(props.getState(), props.getState().learnerId, { catalog });
  if (action === 'export') { exportResult(summary); return true; }
  try {
    const conceptId = ui.initialConceptId ?? summary.recommendation?.conceptId ?? initialConceptOptions(catalog)[0]?.id;
    const choices = initialQuestionOptions(catalog, conceptId);
    const questionId = choices.find(q => q.id === ui.initialQuestionId)?.id ?? choices[0]?.id;
    const pathId = props.planInitialLesson({ assessmentId: summary.assessmentId, conceptId, questionId, reason: ui.initialReason ?? '' });
    Object.assign(ui, { mentorPathId: pathId, learnerPathId: pathId, initialAssessmentOpen: false, initialAssessmentDismissed: false, initialPlanError: null, flash: '첫 수업 시작점과 문제를 지정했어요.' });
  } catch { ui.initialPlanError = '시작점과 문제를 지정하지 못했어요. 결과와 선택한 문항을 다시 확인해 주세요.'; }
  props.syncVisibility?.();
  props.rerender();
  return true;
}

function handleInitialRoadmapAction(button,props){
  if(props.practice&&button.dataset.roadmapAction==='open'){
    const summary=initialAssessmentSummary(props.getState(),props.getState().learnerId,{catalog:props.catalog});
    props.practice.open({assessmentId:summary.assessmentId,cardId:button.dataset.roadmapCard,baseQuestionId:button.dataset.roadmapQuestion}).catch(()=>{props.ui.roadmapError='현재 연습을 다시 열어 주세요.';props.rerender();});
    return true;
  }
  return handleRoadmapAction(button,{
    ui:props.ui,root:props.root,rerender:props.rerender,
    getSummary:()=>initialAssessmentSummary(props.getState(),props.getState().learnerId,{catalog:props.catalog}),
    open:(cardId,questionId)=>{
      props.update(s=>openInitialRoadmap(s,{assessmentId:initialAssessmentSummary(s,s.learnerId).assessmentId,cardId,questionId,at:now()},{catalog:props.catalog}));
      if (!cardId && props.ui.role === 'learner') {
        props.ui.learnerTab = 'roadmap'; props.syncVisibility?.();
      }
    },
    answer:input=>props.update(s=>answerInitialRoadmap(s,{assessmentId:initialAssessmentSummary(s,s.learnerId).assessmentId,...input,at:now()},{catalog:props.catalog})),
  });
}

export function initialLearningNote(state, catalog) {
  const summary = initialAssessmentSummary(state, state.learnerId, { catalog });
  return `<section class="initial-learning-note"><div>${summary?.startingPoint ? `<span class="muted small">첫 수업 시작 단원</span><br><b>${esc(conceptName(catalog, summary.startingPoint.conceptId))}</b>` : '<span>첫 수준 확인으로 시작점을 함께 정해요.</span>'}</div><button class="ghost small" data-action="initial-open">${summary?.status === 'completed' ? '초기 확인 결과' : '첫 수준 확인'}</button></section>`;
}

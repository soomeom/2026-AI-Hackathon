// 멘토 화면: 문항 지정, 학습 경로 현황, 근거 요약, 단계 조정, AI 수업 제안. 수치는 모두 summary 모듈 결과를 그대로 쓴다.
// renderMentor({ root, state, catalog, dispatch, assignQuestion, update, getState, ui, rerender })
import { buildLearnerSummary } from '../mentoring/summary.js';
import { listAssignableQuestions } from '../content/catalog.js';
import { buildAIInput } from '../ai/contracts.js';
import {
  esc, STAGE_LABEL, EVIDENCE_LABEL, FLAG_TEXT, resultBadge, formatSeconds, stepsBar, mentorTabs, ICON,
} from './text.js';
import { aiAvailability, runAI, cancelAI, decideAI, statusHtml, decisionHtml } from './ai-panel.js';
import { renderSessions } from './sessions.js';
import { buildLogFacts } from '../mentoring/logs.js';
import { initialAssessmentPanel, handleInitialAssessmentAction } from './initial-assessment.js';

const OVERRIDE_TARGETS = ['concept_check', 'foundation_practice', 'similar_practice', 'original_retry', 'transfer_check', 'completed'];
const NOVELTY_TEXT = { first_seen: '처음 봄', already_seen: '이미 봄', unknown: '확인 불가' };

const questionOf = (catalog, id) => catalog.questions.find((q) => q.id === id);

export function renderMentor(props) {
  if (props.ui.mentorTab === 'sessions') return renderSessions(props);
  const { root, state, catalog, dispatch, assignQuestion, ui, rerender } = props;
  const learner = state.learners?.find((l) => l.id === state.learnerId);
  const paths = (state.paths ?? []).filter((p) => p.learnerId === state.learnerId);
  const summary = buildLearnerSummary(state, state.learnerId, { catalog });
  const selectedPath = paths.find((p) => p.id === ui.mentorPathId) ?? paths.at(-1);
  const tab = ui.mentorTab === 'learning' ? 'learning' : 'home';

  root.innerHTML = `${mentorTabs(tab, learner)}
    ${ui.flash ? `<div class="msg" role="status">${esc(ui.flash)}</div>` : ''}
    ${tab === 'home' ? homeView(state, catalog, summary, paths, ui) : `
      <section class="card">
        <h3>단계별 결과 <span class="muted small">모름은 정답률에서 제외</span></h3>
        ${statTiles(summary)}
      </section>
      <section class="card">
        <h3>학습 경로</h3>
        ${paths.length ? pathList(paths, selectedPath, catalog) : '<p class="muted">아직 지정한 문제가 없어요. ‘오늘 할 일’에서 문제를 지정해요.</p>'}
        ${selectedPath ? pathDetail(selectedPath, catalog, state, ui) : ''}
      </section>
      <div class="grid">
        <section class="card">
          <h3>개념별 근거 <span class="muted small">직접 확인 · 추정 · 확인 필요</span></h3>
          ${summary.evidence.length ? summary.evidence.map((e) => evidenceView(e, summary, catalog, ui)).join('') : '<p class="muted">아직 응답이 없어요.</p>'}
          ${summary.reviewFlags.length ? `<h4>검토할 점</h4><ul>${[...new Set(summary.reviewFlags.map((f) => FLAG_TEXT[f.code] ?? f.code))].map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        </section>
        ${lessonPanel(state, catalog, summary, ui)}
      </div>`}`;
  ui.flash = null;

  root.onchange = event => {
    if (event.target.id === 'initial-concept') {
      Object.assign(ui, { initialConceptId: event.target.value, initialQuestionId: null, initialPlanError: null });
      rerender();
    } else if (event.target.id === 'initial-question') ui.initialQuestionId = event.target.value;
  };
  root.oninput = event => {
    if (event.target.id === 'initial-reason') ui.initialReason = event.target.value;
  };

  root.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (handleInitialAssessmentAction(b, props)) return;
    if (b.dataset.tab) { ui.mentorTab = b.dataset.tab; rerender(); return; }
    if (b.dataset.goto) {
      ui.mentorTab = b.dataset.goto;
      if (b.dataset.path) ui.mentorPathId = b.dataset.path;
      if (b.dataset.session) { ui.sessionId = b.dataset.session; ui.editSession = false; }
      rerender();
      return;
    }
    if (b.dataset.ai) {
      const ctx = { ui, rerender, getState: props.getState, update: props.update };
      if (b.dataset.ai === 'request') {
        runAI({
          key: 'lesson', kind: 'lesson_plan', ctx,
          buildInput: (s, requestId) => buildAIInput(s, { learnerId: s.learnerId, kind: 'lesson_plan', catalog, requestId }),
        });
      } else if (b.dataset.ai === 'cancel') cancelAI('lesson', ui);
      else decideAI(b.dataset.artifact, b.dataset.ai === 'adopt' ? 'adopted' : 'rejected', ctx);
      return;
    }
    if (b.dataset.path) { ui.mentorPathId = b.dataset.path; rerender(); return; }
    if (b.dataset.evidence) { ui.openEvidence[b.dataset.evidence] = !ui.openEvidence[b.dataset.evidence]; rerender(); return; }
    if (b.dataset.action === 'assign') {
      const questionId = root.querySelector('#assign-select').value;
      ui.mentorPathId = assignQuestion({ questionId });
      ui.learnerPathId = ui.mentorPathId;
      ui.flash = '지정했어요. 멘티 화면에서 바로 풀 수 있어요.';
      rerender();
      return;
    }
    if (b.dataset.action === 'override') {
      const target = root.querySelector('#override-stage').value;
      const reason = root.querySelector('#override-reason').value.trim();
      if (!reason) { ui.overrideError = '조정 이유를 적어 주세요.'; rerender(); return; }
      const events = dispatch({ type: 'MENTOR_OVERRIDE', pathId: selectedPath.id, mentorId: state.mentorId, targetStage: target, reason });
      ui.overrideError = events[0]?.type === 'commandRejected' ? `조정하지 못했어요 (${events[0].reason})` : null;
      rerender();
    }
  };
}

// 오늘 할 일: 멘토가 먼저 봐야 할 것을 개수와 함께 위에 놓는다 (칸아카데미 교실 화면의 정보 우선순위 참고)
function homeView(state, catalog, summary, paths, ui) {
  const needsMentor = paths.filter((p) => p.status === 'needs_mentor');
  const helpPaths = paths.filter((p) => p.mentorRequests?.length);
  const concepts = summary.evidence.filter((e) => e.status !== 'observed' || e.counts.incorrect > 0);
  const sessions = (state.sessions ?? []).filter((s) => s.learnerId === state.learnerId);
  const pendingLogs = sessions.filter((s) => {
    const latest = (state.logs ?? []).filter((l) => l.sessionId === s.id).sort((a, b) => b.revision - a.revision)[0];
    return !latest || latest.status !== 'confirmed' || buildLogFacts(state, s.id).requiresReview;
  });
  const promptOf = (p) => esc(questionOf(catalog, p.questionId)?.prompt ?? p.questionId);
  const todo = ({ icon, title, count, items, action, empty }) => `<article class="todo${count ? ' attention' : ''}">
    <span class="title">${icon} ${title}</span>
    <span class="count">${count}</span>
    ${count ? `<ul>${items.slice(0, 3).join('')}</ul>${action}` : `<span class="muted small">${empty}</span>`}
  </article>`;
  return `
    ${initialAssessmentPanel(state, catalog, ui)}
    <section aria-labelledby="todo-h"><h3 id="todo-h">오늘 확인할 것</h3>
      <div class="todo-grid">
        ${todo({ icon: ICON.flag, title: '멘토 확인 필요', count: needsMentor.length, items: needsMentor.map((p) => `<li>${promptOf(p)}</li>`),
    action: `<button class="link" data-goto="learning" data-path="${esc(needsMentor[0]?.id ?? '')}">경로 열기 ${ICON.arrow}</button>`, empty: '막힌 학습이 없어요.' })}
        ${todo({ icon: ICON.hand, title: '학생 도움 요청', count: helpPaths.reduce((n, p) => n + p.mentorRequests.length, 0), items: helpPaths.map((p) => `<li>${promptOf(p)} · ${STAGE_LABEL[p.mentorRequests.at(-1).stage] ?? ''}</li>`),
    action: `<button class="link" data-goto="learning" data-path="${esc(helpPaths[0]?.id ?? '')}">요청 보기 ${ICON.arrow}</button>`, empty: '도움 요청이 없어요.' })}
        ${todo({ icon: ICON.target, title: '확인할 개념', count: concepts.length, items: concepts.map((e) => `<li>${esc(e.conceptName)}</li>`),
    action: `<button class="link" data-goto="learning">근거·AI 수업 제안 ${ICON.arrow}</button>`, empty: '아직 확인할 개념이 없어요.' })}
        ${todo({ icon: ICON.doc, title: '확정 전 일지', count: pendingLogs.length, items: pendingLogs.map((s) => `<li>${esc(s.localDate)} 회기</li>`),
    action: `<button class="link" data-goto="sessions" data-session="${esc(pendingLogs[0]?.id ?? '')}">일지 쓰기 ${ICON.arrow}</button>`, empty: '확정할 일지가 없어요.' })}
      </div>
    </section>
    <div class="grid">
      <section class="card">
        <h3>${ICON.book} 문제 지정</h3>
        <label class="field">지원 문항
          <select id="assign-select">${listAssignableQuestions(catalog).map((q) => `
            <option value="${esc(q.id)}">${esc(q.reference?.questionType ?? q.id)} — ${esc(q.prompt)}</option>`).join('')}
          </select>
        </label>
        <p class="muted small">모든 문항은 팀이 자체 제작한 ‘기출 유형’ 문항이에요. 공식 기출이 아니에요.</p>
        <div class="row"><button class="primary" data-action="assign">학생에게 지정</button></div>
      </section>
      <section class="card">
        <h3>${ICON.spark} 학습 현황</h3>
        ${statTiles(summary)}
        ${paths.length ? `<h4>진행 중인 학습</h4>${pathList(paths.slice(-3).reverse(), null, catalog, 'learning')}` : ''}
      </section>
    </div>`;
}

function statTiles(summary) {
  const tile = (label, s, sub) => `<div class="stat"><div class="label">${label}</div>
    <div class="value">${s.rate === null ? '—' : `${Math.round(s.rate * 100)}%`}</div>
    <div class="sub">${s.attempted ? `${s.correct}/${s.attempted} 정답` : '기록 없음'}${s.abstained ? ` · 모름 ${s.abstained}` : ''}${sub ? ` · ${sub}` : ''}</div></div>`;
  return `<div class="stat-tiles">
    ${tile('최초 풀이', summary.originalStats)}
    ${tile('기출 재도전', summary.retryStats, '이미 본 문제')}
    ${tile('새 문제 혼자 적용', summary.transferStats, summary.unmeasuredCount ? `제외 ${summary.unmeasuredCount}` : '')}
  </div>
  <p class="muted small" style="margin-top:8px">재도전 정답은 숙달로 보지 않아요. 새 문제는 처음 보고 도움 없이 푼 것만 세요.</p>`;
}

function pathList(paths, selectedPath, catalog, gotoTab) {
  const learnStages = ['original_attempt', 'concept_check', 'foundation_practice', 'similar_practice', 'original_retry', 'transfer_check'];
  return `<div class="path-list">${paths.map((p) => {
    const visited = new Set((p.stageHistory ?? []).map((h) => h.to));
    const pill = p.status === 'needs_mentor' ? '<span class="pill warn">멘토 확인 필요</span>'
      : p.status === 'completed' ? '<span class="pill ok">완료</span>'
        : p.status === 'paused' ? '<span class="pill neutral">멈춤</span>' : `<span class="pill primary">${STAGE_LABEL[p.stage] ?? ''}</span>`;
    return `<div class="path-item${p.id === selectedPath?.id ? ' selected' : ''}">
      <div><div class="q">${esc(questionOf(catalog, p.questionId)?.prompt ?? p.questionId)}</div>
        <div class="mini-steps" aria-hidden="true">${learnStages.map((s) => `<i class="${s === p.stage ? 'now' : visited.has(s) ? 'done' : ''}"></i>`).join('')}</div>
        <div class="row small" style="margin-top:6px">${pill}${p.needsReview ? '<span class="pill warn">건너뜀 있음</span>' : ''}${p.mentorRequests?.length ? `<span class="pill bad">도움 요청 ${p.mentorRequests.length}</span>` : ''}</div>
      </div>
      <button class="ghost small" ${gotoTab ? `data-goto="${gotoTab}"` : ''} data-path="${esc(p.id)}">자세히</button>
    </div>`;
  }).join('')}</div>`;
}

function lessonPanel(state, catalog, summary, ui) {
  const availability = aiAvailability(ui);
  const slot = ui.ai.lesson;
  const conceptName = (id) => catalog.concepts.find((c) => c.id === id)?.name ?? id;
  const evidenceName = (id) => summary.evidence.find((e) => e.id === id)?.conceptName ?? id;
  const promptOf = (id) => catalog.questions.find((q) => q.id === id)?.prompt ?? '연습 문제';
  const out = slot?.status === 'ok' ? slot.output : null;
  return `<section class="card">
    <h3>AI 수업 제안 <span class="muted small">${esc(availability.text)}</span></h3>
    <p class="muted">위 근거를 바탕으로 우선 확인할 개념, 오개념 후보, 설명 방법, 확인 질문을 제안해요. 제안은 멘토가 검토해 채택해요.</p>
    <div class="row"><button class="primary" data-ai="request" ${availability.ok && summary.timeline.length && slot?.status !== 'loading' ? '' : 'disabled'}>
      ${out ? '다시 제안 받기' : 'AI 수업 제안 받기'}</button>
      ${summary.timeline.length ? '' : '<span class="muted small">학생 응답이 생기면 요청할 수 있어요.</span>'}</div>
    ${statusHtml(slot, state)}
    ${out ? `<div class="ai-result">
      <h4>우선 확인할 개념</h4>
      ${out.priorities.map((p) => `<div class="ai-item">
        <b>${esc(conceptName(p.conceptId))}</b> <span class="muted small">근거: ${p.evidenceIds.map((id) => esc(evidenceName(id))).join(', ')}</span>
        <dl>
          <dt>이유</dt><dd>${esc(p.reason)}</dd>
          <dt>확인할 오개념 후보</dt><dd>${esc(p.misconceptionCandidate)}</dd>
          <dt>설명 방법</dt><dd>${esc(p.explanationMethod)}</dd>
          <dt>불확실한 부분</dt><dd>${esc(p.uncertainty)}</dd>
        </dl></div>`).join('')}
      <h4>학생에게 던질 확인 질문</h4>
      <ul>${out.mentorQuestions.map((q) => `<li>${esc(q.text)}</li>`).join('')}</ul>
      <h4>수업 흐름</h4>
      <ol>${out.plan.map((p) => `<li>${esc(p.minutes)}분 · ${esc(p.activity)}${p.questionIds.length ? ` <span class="muted small">(${p.questionIds.map((id) => esc(promptOf(id))).join(', ')})</span>` : ''}</li>`).join('')}</ol>
      <p class="muted small">실제 AI 응답이에요. 근거 ID 가 학생 기록과 맞는지 확인한 결과만 보여 줘요.</p>
      ${decisionHtml(state, slot.artifactId)}
    </div>` : ''}
  </section>`;
}

function pathDetail(path, catalog, state, ui) {
  const attempts = (state.attempts ?? []).filter((a) => a.pathId === path.id);
  return `<div class="detail">
    ${stepsBar(path)}
    <h4>풀이 기록 <span class="muted small">단계 순서대로 · 풀이 시간은 화면이 보일 때만 잰 참고값</span></h4>
    <div class="attempt-list">${attempts.map((a) => attemptRow(a, path, catalog)).join('') || '<p class="muted">아직 응답이 없어요.</p>'}</div>
    ${path.mentorRequests?.length ? `<p>학생 도움 요청: ${path.mentorRequests.map((r) => STAGE_LABEL[r.stage] ?? r.stage).join(', ')} 단계</p>` : ''}
    ${path.overrides?.length ? `<p>멘토 조정 기록: ${path.overrides.map((o) => `${STAGE_LABEL[o.from] ?? o.from} → ${STAGE_LABEL[o.to]} (${esc(o.reason)})`).join(' / ')}</p>` : ''}
    <div class="override">
      <h4>단계 조정</h4>
      <div class="row">
        <select id="override-stage" aria-label="이동할 단계">${OVERRIDE_TARGETS.map((s) => `<option value="${s}">${STAGE_LABEL[s]}</option>`).join('')}</select>
        <input id="override-reason" placeholder="조정 이유 (예: 수업에서 부호 계산을 함께 확인함)" aria-label="조정 이유">
        <button data-action="override">적용</button>
      </div>
      ${ui.overrideError ? `<p class="error">${esc(ui.overrideError)}</p>` : ''}
    </div>
  </div>`;
}

function attemptRow(a, path, catalog) {
  const item = [...(path.pastItems ?? []), ...(path.items ?? [])].find((i) => i.id === a.itemId);
  const prompt = item?.prompt ?? questionOf(catalog, a.sourceQuestionId)?.prompt ?? a.itemId;
  return `<div class="attempt ${a.result}">
    <span class="stage">${STAGE_LABEL[a.stage] ?? a.stage}${a.round ? ` ${a.round}회차` : ''}</span>
    <span>${esc(prompt)} &nbsp;${resultBadge(a.result)}</span>
    <span class="facts">${a.helpUsed ? '도움 사용 · ' : ''}${NOVELTY_TEXT[a.noveltyAtPresentation] ?? '—'} · ${formatSeconds(a.activeMs)}</span>
  </div>`;
}

function evidenceView(e, summary, catalog, ui) {
  const open = ui.openEvidence[e.id];
  const rows = summary.timeline.filter((t) => e.attemptIds.includes(t.attemptId));
  return `<div class="ev">
    <div><span class="badge ${e.status}">${EVIDENCE_LABEL[e.status]}</span><b>${esc(e.conceptName)}</b></div>
    <div>${esc(e.observation)}</div>
    <div class="q">확인 질문: ${esc(e.mentorQuestion)}</div>
    ${e.attemptIds.length ? `<button class="ghost small" data-evidence="${esc(e.id)}" aria-expanded="${Boolean(open)}">근거 응답 ${e.attemptIds.length}개 ${open ? '닫기' : '보기'}</button>` : ''}
    ${open ? `<ul class="evidence-rows">${rows.map((t) => `<li>${STAGE_LABEL[t.stage] ?? t.stage} · ${esc(questionOf(catalog, t.questionId)?.prompt ?? '연습 문제')} · ${resultBadge(t.result)}${t.helpUsed ? ' · 도움 사용' : ''}</li>`).join('')}</ul>` : ''}
  </div>`;
}

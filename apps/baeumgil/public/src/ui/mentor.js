// 멘토 화면: 문항 지정, 학습 경로 현황, 근거 요약, 단계 조정. 수치는 모두 summary 모듈 결과를 그대로 쓴다.
// renderMentor({ root, state, catalog, dispatch, assignQuestion, ui, rerender })
import { buildLearnerSummary } from '../mentoring/summary.js';
import { listAssignableQuestions } from '../content/catalog.js';
import {
  esc, STAGE_LABEL, EVIDENCE_LABEL, FLAG_TEXT, resultBadge, formatSeconds, stepsBar,
} from './text.js';

const OVERRIDE_TARGETS = ['concept_check', 'foundation_practice', 'similar_practice', 'original_retry', 'transfer_check', 'completed'];
const STATUS_TEXT = { active: '진행 중', paused: '멈춤', completed: '완료', needs_mentor: '멘토 확인 필요' };
const NOVELTY_TEXT = { first_seen: '처음 봄', already_seen: '이미 봄', unknown: '확인 불가' };

const questionOf = (catalog, id) => catalog.questions.find((q) => q.id === id);
const pct = (s) => (s.rate === null ? '—' : `${Math.round(s.rate * 100)}% <span class="muted">(${s.correct}/${s.attempted})</span>`);

export function renderMentor({ root, state, catalog, dispatch, assignQuestion, ui, rerender }) {
  const learner = state.learners?.find((l) => l.id === state.learnerId);
  const paths = (state.paths ?? []).filter((p) => p.learnerId === state.learnerId);
  const summary = buildLearnerSummary(state, state.learnerId, { catalog });
  const assignable = listAssignableQuestions(catalog);
  const selectedPath = paths.find((p) => p.id === ui.mentorPathId) ?? paths.at(-1);

  root.innerHTML = `
    <div class="page-head"><h2>${esc(learner?.alias ?? '학습자')} <span class="muted">${esc(learner?.note ?? '')}</span></h2></div>
    <div class="grid">
      <section class="card">
        <h3>문제 지정</h3>
        <label class="field">지원 문항
          <select id="assign-select">${assignable.map((q) => `
            <option value="${esc(q.id)}">${esc(q.reference?.questionType ?? q.id)} — ${esc(q.prompt)}</option>`).join('')}
          </select>
        </label>
        <p class="muted small">모든 문항은 팀이 자체 제작한 ‘기출 유형’ 문항이에요. 공식 기출이 아니에요.</p>
        <div class="row"><button class="primary" data-action="assign">학생에게 지정</button></div>
        ${ui.flash ? `<div class="msg" role="status">${esc(ui.flash)}</div>` : ''}
      </section>

      <section class="card">
        <h3>단계별 결과 <span class="muted small">모름은 정답률에서 제외</span></h3>
        <table class="table">
          <thead><tr><th>구분</th><th>정답률</th><th>모름</th></tr></thead>
          <tbody>
            <tr><td>최초 풀이</td><td>${pct(summary.originalStats)}</td><td>${summary.originalStats.abstained}</td></tr>
            <tr><td>기출 재도전</td><td>${pct(summary.retryStats)}</td><td>${summary.retryStats.abstained}</td></tr>
            <tr><td>새 문제 (혼자 적용)</td><td>${pct(summary.transferStats)}</td><td>${summary.transferStats.abstained}</td></tr>
          </tbody>
        </table>
        <p class="muted small">재도전 정답은 이미 본 문제라 숙달로 보지 않아요. 새 문제는 처음 보고 도움 없이 푼 것만 세요.
          ${summary.unmeasuredCount ? `제외·미측정 ${summary.unmeasuredCount}건.` : ''}</p>
      </section>
    </div>

    <section class="card">
      <h3>학습 경로</h3>
      ${paths.length ? `<table class="table">
        <thead><tr><th>문항</th><th>현재 단계</th><th>상태</th><th>도움 요청</th><th></th></tr></thead>
        <tbody>${paths.map((p) => `
          <tr class="${p.id === selectedPath?.id ? 'selected-row' : ''}">
            <td>${esc(questionOf(catalog, p.questionId)?.prompt ?? p.questionId)}</td>
            <td>${STAGE_LABEL[p.stage] ?? '—'}</td>
            <td>${p.status === 'needs_mentor' ? `<span class="badge needs_review">${STATUS_TEXT[p.status]}</span>` : STATUS_TEXT[p.status] ?? p.status}
              ${p.needsReview ? ' <span class="badge needs_review">건너뜀 있음</span>' : ''}</td>
            <td>${p.mentorRequests?.length ? `${p.mentorRequests.length}회` : '—'}</td>
            <td><button class="ghost" data-path="${esc(p.id)}">자세히</button></td>
          </tr>`).join('')}</tbody></table>` : '<p class="muted">아직 지정한 문제가 없어요.</p>'}
      ${selectedPath ? pathDetail(selectedPath, catalog, state, ui) : ''}
    </section>

    <section class="card">
      <h3>개념별 근거 <span class="muted small">직접 확인 · 추정 · 확인 필요를 구분해요</span></h3>
      ${summary.evidence.length ? summary.evidence.map((e) => evidenceView(e, summary, catalog, ui)).join('') : '<p class="muted">아직 응답이 없어요.</p>'}
      ${summary.reviewFlags.length ? `<h4>검토할 점</h4><ul>${[...new Set(summary.reviewFlags.map((f) => FLAG_TEXT[f.code] ?? f.code))].map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    </section>

    <section class="card">
      <h3>AI 수업 제안</h3>
      <p class="muted">위 근거를 바탕으로 우선 확인할 개념, 오개념 후보, 설명 방법, 확인 질문을 제안해요. 제안은 멘토가 검토해 채택해요.</p>
      <div class="row"><button disabled title="서버 /api/ai 연결 후 사용">AI 수업 제안 받기 (서버 연결 예정)</button></div>
    </section>`;
  ui.flash = null;

  root.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
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

function pathDetail(path, catalog, state, ui) {
  const attempts = (state.attempts ?? []).filter((a) => a.pathId === path.id);
  return `<div class="detail">
    ${stepsBar(path)}
    <table class="table">
      <thead><tr><th>단계</th><th>문항</th><th>결과</th><th>도움</th><th>표시 전</th><th>풀이 시간</th></tr></thead>
      <tbody>${attempts.map((a) => attemptRow(a, path, catalog)).join('') || '<tr><td colspan="6" class="muted">아직 응답이 없어요.</td></tr>'}</tbody>
    </table>
    <p class="muted small">풀이 시간은 화면이 보일 때만 잰 참고값이에요.</p>
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
  return `<tr>
    <td>${STAGE_LABEL[a.stage] ?? a.stage}${a.round ? ` ${a.round}회차` : ''}</td>
    <td>${esc(prompt)}</td>
    <td>${resultBadge(a.result)}</td>
    <td>${a.helpUsed ? '사용' : '—'}</td>
    <td>${NOVELTY_TEXT[a.noveltyAtPresentation] ?? '—'}</td>
    <td>${formatSeconds(a.activeMs)}</td>
  </tr>`;
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

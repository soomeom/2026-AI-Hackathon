// 회기·활동일지·월별 대장 화면 (멘토). 회기·확정·합산 규칙은 mentoring/logs.js 가 처리한다.
// 자율 학습만으로 회기를 만들지 않는다: 날짜·출석·활동 시간은 멘토가 직접 입력한다.
import { saveSession, buildLogFacts, confirmLog, buildMonthlyLedger, createSessionSnapshot, LogError } from '../mentoring/logs.js';
import { buildAIInput } from '../ai/contracts.js';
import { esc, STAGE_LABEL, mentorTabs, todaySeoul } from './text.js';
import { aiAvailability, runAI, cancelAI, decideAI, statusHtml, decisionHtml } from './ai-panel.js';

const ATTENDANCE = { attended: '출석', absent: '결석', canceled: '취소', not_recorded: '미기록' };
const LOG_ERRORS = {
  invalid_session_date: '회기 날짜를 확인해 주세요.',
  invalid_minutes: '활동 시간은 0 이상의 정수(분)로 적어 주세요.',
  attendance_required: '출석한 회기만 일지를 확정할 수 있어요.',
  positive_minutes_required: '실제 활동 시간(분)을 1분 이상 입력해야 확정할 수 있어요.',
  review_required: '원자료와 비교해 검토했다는 확인이 필요해요.',
  content_required: '일지 내용을 적어 주세요.',
  path_not_found: '연결한 학습 경로를 찾을 수 없어요.',
};
const errorText = (err) => (err instanceof LogError ? LOG_ERRORS[err.code] ?? `처리하지 못했어요 (${err.code})` : String(err.message ?? err));
const pctText = (s) => (s.attempted ? `${s.correct}/${s.attempted} 정답` : '기록 없음');

// 일지 글(일반 텍스트)용 문항 이름: 기출은 회차·번호, 자체 제작은 문제 글
const questionPrompt = (catalog, id) => {
  const q = catalog.questions.find((x) => x.id === id);
  const r = q?.reference;
  if (r?.year) return `${r.year}년 ${r.session}회 ${r.qualification} 검정고시 수학 ${r.questionNumber}번`;
  return (q?.prompt ?? id).replace(/\$/g, '');
};

// 코드로 만든 사실 기반 초안. 정서·태도 문장은 넣지 않고, 멘토 관찰은 메모 그대로 인용한다.
export function factDraft(facts, state, catalog) {
  const L = facts.learning;
  const paths = (state.paths ?? []).filter((p) => (state.sessions.find((s) => s.id === facts.sessionId)?.pathIds ?? []).includes(p.id));
  const lines = [`${facts.localDate} 수학 학습 멘토링 (${facts.actualMinutes ?? '-'}분).`];
  for (const p of paths) lines.push(`- 문항 「${questionPrompt(catalog, p.questionId)}」 보충 학습: 현재 단계 ${STAGE_LABEL[p.stage] ?? p.stage}.`);
  lines.push(`- 최초 풀이 ${pctText(L.originalStats)}, 기출 재도전 ${pctText(L.retryStats)}, 새 문제(혼자 적용) ${pctText(L.transferStats)}.`);
  const review = L.evidence.filter((e) => e.status !== 'observed' || e.counts.incorrect > 0).map((e) => e.conceptName);
  if (review.length) lines.push(`- 다음 회기에 확인할 개념: ${review.join(', ')}.`);
  if (facts.note) lines.push(`- 멘토 관찰: ${facts.note}`);
  return lines.join('\n');
}

export function renderSessions(props) {
  const { root, state, catalog, ui, rerender } = props;
  const sessions = (state.sessions ?? []).filter((s) => s.learnerId === state.learnerId).sort((a, b) => b.localDate.localeCompare(a.localDate) || b.id.localeCompare(a.id));
  const paths = (state.paths ?? []).filter((p) => p.learnerId === state.learnerId);
  const selected = sessions.find((s) => s.id === ui.sessionId) ?? sessions[0];
  const month = ui.ledgerMonth ?? todaySeoul().slice(0, 7);

  root.innerHTML = `
    ${mentorTabs('sessions', state.learners?.find((l) => l.id === state.learnerId))}
    <div class="grid">
      <section class="card">
        <h3>${selected && ui.editSession ? '회기 정보 수정' : '새 회기 기록'}</h3>
        ${sessionForm(selected && ui.editSession ? selected : null, paths, catalog)}
        ${ui.sessionError ? `<p class="error" role="alert">${esc(ui.sessionError)}</p>` : ''}
      </section>
      <section class="card">
        <h3>회기 목록</h3>
        ${sessions.length ? `<table class="table"><thead><tr><th>날짜</th><th>출석</th><th>시간</th><th>일지</th><th></th></tr></thead><tbody>
          ${sessions.map((s) => `<tr class="${s.id === selected?.id ? 'selected-row' : ''}">
            <td>${esc(s.localDate)}</td><td>${ATTENDANCE[s.attendance]}</td><td>${s.actualMinutes ?? '—'}분</td>
            <td>${logStatus(state, s.id)}</td><td><button class="ghost" data-session="${esc(s.id)}">열기</button></td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">아직 기록한 회기가 없어요. 실제 수업을 한 뒤 기록해요.</p>'}
        <p class="muted small">학생 혼자 푼 학습은 회기·출석·활동 시간으로 자동 기록되지 않아요.</p>
      </section>
    </div>
    ${selected ? logEditor(selected, props) : ''}
    ${ledgerView(state, month, ui)}`;
  ui.flash = null;

  root.oninput = (ev) => {
    if (ev.target.id === 'log-content' && selected) ui.logDraft[selected.id] = ev.target.value;
    if (ev.target.id === 'log-reviewed' && selected) ui.reviewed[selected.id] = ev.target.checked;
  };
  root.onchange = (ev) => {
    if (ev.target.id === 'ledger-month') { ui.ledgerMonth = ev.target.value; rerender(); }
  };
  root.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.tab) { ui.mentorTab = b.dataset.tab; rerender(); return; }
    if (b.dataset.session) { ui.sessionId = b.dataset.session; ui.editSession = false; ui.sessionError = null; rerender(); return; }
    const ctx = { ui, rerender, getState: props.getState, update: props.update };
    const key = selected ? `log:${selected.id}` : null;
    switch (b.dataset.action ?? b.dataset.ai) {
      case 'save-session': return saveSessionFromForm(root, props, selected);
      case 'edit-session': ui.editSession = true; rerender(); return;
      case 'new-session': ui.editSession = false; rerender(); return;
      case 'use-facts':
        ui.logDraft[selected.id] = factDraft(buildLogFacts(props.getState(), selected.id, { catalog }), props.getState(), catalog);
        rerender();
        return;
      case 'confirm-log': return confirmFromEditor(props, selected);
      case 'copy-ledger': return copyLedger(root, ui, rerender);
      case 'request':
        runAI({
          key, kind: 'log_narrative', ctx,
          buildInput: (s, requestId) => buildAIInput(createSessionSnapshot(s, selected.id), {
            learnerId: selected.learnerId, sessionId: selected.id, kind: 'log_narrative', catalog, requestId,
          }),
        });
        return;
      case 'cancel': cancelAI(key, ui); return;
      case 'adopt':
      case 'reject': {
        decideAI(b.dataset.artifact, b.dataset.ai === 'adopt' ? 'adopted' : 'rejected', ctx);
        if (b.dataset.ai === 'adopt') {
          const sentences = ui.ai[key]?.output?.sentences ?? [];
          const current = ui.logDraft[selected.id] ?? '';
          ui.logDraft[selected.id] = [current.trim(), ...sentences.map((s) => s.text)].filter(Boolean).join('\n');
          rerender();
        }
        return;
      }
      default:
    }
  };
}

function sessionForm(session, paths, catalog) {
  const checked = new Set(session?.pathIds ?? paths.map((p) => p.id));
  return `<div class="form">
    <label class="field">회기 날짜 <input id="s-date" type="date" value="${esc(session?.localDate ?? todaySeoul())}"></label>
    <label class="field">출석 <select id="s-attendance">${Object.entries(ATTENDANCE).map(([v, t]) => `<option value="${v}" ${v === (session?.attendance ?? 'attended') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="field">실제 활동 시간(분) <input id="s-minutes" type="number" min="0" step="1" inputmode="numeric" value="${esc(session?.actualMinutes ?? '')}" placeholder="예: 40"></label>
    <fieldset class="field"><legend>이번 회기에서 다룬 학습</legend>
      ${paths.length ? paths.map((p) => `<label class="check"><input type="checkbox" class="s-path" value="${esc(p.id)}" ${checked.has(p.id) ? 'checked' : ''}> ${esc(questionPrompt(catalog, p.questionId))} <span class="muted small">(${STAGE_LABEL[p.stage] ?? ''})</span></label>`).join('') : '<span class="muted small">연결할 학습 경로가 없어요.</span>'}
    </fieldset>
    <label class="field">관찰 메모 <span class="muted small">학생의 반응·태도는 여기 적은 관찰만 일지에 쓰여요</span>
      <textarea id="s-note" rows="3" placeholder="예: 부호 계산을 소리 내어 설명하며 스스로 실수를 찾음">${esc(session?.note ?? '')}</textarea></label>
    <div class="row"><button class="primary" data-action="save-session">${session ? '수정 저장' : '회기 저장'}</button>
      ${session ? '<button class="ghost" data-action="new-session">새 회기로</button>' : ''}</div>
  </div>`;
}

function saveSessionFromForm(root, props, selected) {
  const { ui, rerender } = props;
  const value = (id) => root.querySelector(id).value;
  const minutesText = value('#s-minutes').trim();
  const editing = Boolean(selected && ui.editSession);
  const state = props.getState();
  const id = editing ? selected.id : `session-${1 + Math.max(0, ...(state.sessions ?? []).map((s) => Number(s.id.split('-')[1]) || 0))}`;
  try {
    props.update((s) => saveSession(s, {
      id, learnerId: s.learnerId, mentorId: s.mentorId, localDate: value('#s-date'), attendance: value('#s-attendance'),
      actualMinutes: minutesText === '' ? null : Number(minutesText),
      pathIds: [...root.querySelectorAll('.s-path:checked')].map((c) => c.value), note: value('#s-note'),
    }), { type: 'sessionSaved', sessionId: id });
    Object.assign(ui, { sessionId: id, editSession: false, sessionError: null });
  } catch (err) {
    ui.sessionError = errorText(err);
  }
  rerender();
}

function logStatus(state, sessionId) {
  const logs = (state.logs ?? []).filter((l) => l.sessionId === sessionId).sort((a, b) => b.revision - a.revision);
  if (!logs.length) return '<span class="muted">초안</span>';
  return logs[0].status === 'confirmed' ? `<span class="badge observed">확정 ${logs[0].revision}판</span>` : '<span class="badge needs_review">철회됨</span>';
}

function logEditor(session, props) {
  const { state, catalog, ui } = props;
  const facts = buildLogFacts(state, session.id, { catalog });
  const L = facts.learning;
  const latest = (state.logs ?? []).filter((l) => l.sessionId === session.id).sort((a, b) => b.revision - a.revision)[0];
  const draft = ui.logDraft[session.id] ?? latest?.content ?? '';
  const key = `log:${session.id}`;
  const slot = ui.ai[key];
  const availability = aiAvailability(ui);
  const canConfirm = session.attendance === 'attended' && session.actualMinutes > 0;
  return `<section class="card">
    <h3>활동일지 · ${esc(session.localDate)} <button class="ghost small" data-action="edit-session">회기 정보 수정</button></h3>
    <p class="muted small">센터 제공 양식과의 일치 검수 전이에요. 확정본만 월별 대장에 합산돼요.</p>
    <div class="grid">
      <div>
        <h4>코드로 정리한 사실</h4>
        <table class="table"><tbody>
          <tr><th scope="row">출석 · 시간</th><td>${ATTENDANCE[session.attendance]} · ${session.actualMinutes ?? '—'}분</td></tr>
          <tr><th scope="row">다룬 학습</th><td>${session.pathIds.length ? session.pathIds.map((id) => esc(questionPrompt(catalog, state.paths.find((p) => p.id === id)?.questionId))).join('<br>') : '—'}</td></tr>
          <tr><th scope="row">최초 / 재도전 / 새 문제</th><td>${pctText(L.originalStats)} / ${pctText(L.retryStats)} / ${pctText(L.transferStats)}</td></tr>
          <tr><th scope="row">관찰 메모</th><td>${session.note ? esc(session.note) : '<span class="muted">없음 — AI는 정서·태도 문장을 쓰지 않아요</span>'}</td></tr>
        </tbody></table>
        ${facts.requiresReview ? '<div class="msg warn">확정 이후 회기 정보나 학습 기록이 바뀌었어요. 다시 검토해 확정해 주세요.</div>' : ''}
      </div>
      <div>
        <h4>AI 활동 내용 문장 <span class="muted small">${esc(availability.text)}</span></h4>
        <div class="row"><button data-ai="request" ${availability.ok && slot?.status !== 'loading' ? '' : 'disabled'}>AI로 문장 만들기</button></div>
        ${statusHtml(slot, state, session.id)}
        ${slot?.status === 'ok' ? `<ol class="ai-sentences">${slot.output.sentences.map((s) => `<li>${esc(s.text)}</li>`).join('')}</ol>
          <p class="muted small">채택하면 아래 초안 끝에 붙어요. 원자료와 비교해 고쳐 쓰세요.</p>${decisionHtml(state, slot.artifactId)}` : ''}
      </div>
    </div>
    <label class="field">일지 내용 (멘토가 검토·수정해 확정)
      <textarea id="log-content" rows="7">${esc(draft)}</textarea></label>
    <div class="row">
      <button class="ghost" data-action="use-facts">사실 요약으로 초안 채우기</button>
    </div>
    <label class="check"><input type="checkbox" id="log-reviewed" ${ui.reviewed[session.id] ? 'checked' : ''}> 학습 기록·메모와 비교해 내용을 검토했어요</label>
    <div class="row"><button class="primary" data-action="confirm-log" ${canConfirm ? '' : 'disabled'}>일지 확정</button>
      ${canConfirm ? '' : '<span class="muted small">출석이고 활동 시간이 1분 이상인 회기만 확정할 수 있어요.</span>'}</div>
    ${ui.logError ? `<p class="error" role="alert">${esc(ui.logError)}</p>` : ''}
    ${latest ? `<p class="muted small">최근 확정: ${latest.revision}판 · ${esc(new Date(latest.confirmedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}${latest.status !== 'confirmed' ? ' (철회됨)' : ''}</p>` : ''}
  </section>`;
}

function confirmFromEditor(props, session) {
  const { ui, rerender } = props;
  try {
    props.update((s) => confirmLog(s, { sessionId: session.id, content: ui.logDraft[session.id] ?? '', reviewed: ui.reviewed[session.id] === true }),
      { type: 'logConfirmed', sessionId: session.id });
    ui.logError = null;
    ui.reviewed[session.id] = false;
    ui.flash = '일지를 확정했어요. 월별 대장에 반영됐어요.';
  } catch (err) {
    ui.logError = errorText(err);
  }
  rerender();
}

function ledgerView(state, month, ui) {
  const ledger = buildMonthlyLedger(state, month);
  const name = (id) => state.learners.find((l) => l.id === id)?.name ?? id;
  return `<section class="card">
    <h3>월별 멘토링 대장 <label class="inline">월 <input id="ledger-month" type="month" value="${esc(month)}"></label></h3>
    ${ui.flash ? `<div class="msg" role="status">${esc(ui.flash)}</div>` : ''}
    ${ledger.rows.length ? `<table class="table" id="ledger-table"><thead><tr><th>날짜</th><th>멘티</th><th>활동 시간</th><th>활동 내용</th></tr></thead><tbody>
      ${ledger.rows.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(name(r.learnerId))}</td><td>${r.actualMinutes}분</td><td class="pre">${esc(r.content)}</td></tr>`).join('')}
    </tbody><tfoot><tr><th colspan="2">합계 ${ledger.sessionCount}회</th><th>${ledger.totalMinutes}분</th><td></td></tr></tfoot></table>
    <div class="row"><button data-action="copy-ledger">표 복사</button></div>
    ${ui.copyFallback ? `<label class="field">자동 복사가 안 돼요. 아래 내용을 선택해 복사하세요.<textarea rows="5" readonly>${esc(ui.copyFallback)}</textarea></label>` : ''}`
    : '<p class="muted">이 달에 확정된 일지가 없어요. 초안·결석·취소·철회된 기록은 합산하지 않아요.</p>'}
  </section>`;
}

async function copyLedger(root, ui, rerender) {
  const rows = [...root.querySelectorAll('#ledger-table tr')].map((tr) => [...tr.children].map((c) => c.innerText.replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t'));
  const text = rows.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    ui.flash = '대장을 복사했어요. 엑셀·한글 표에 붙여 넣을 수 있어요.';
    ui.copyFallback = null;
  } catch {
    ui.copyFallback = text;
  }
  rerender();
}

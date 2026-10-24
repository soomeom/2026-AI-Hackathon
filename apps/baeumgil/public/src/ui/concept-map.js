import { esc, mathHtml,questionBodyHtml,choiceHtml } from './text.js';
import { normalizeChoiceValue } from '../learning/exposure.js';

export const MAP_STATUS = { unmeasured: '미확인', needs_learning: '보완 필요', needs_recheck: '혼자 다시 확인', mastered: '진단 통과', confirmed: '선수 개념 확인' };
// 색만으로 구분하지 않도록 모양도 함께 쓴다
const SHAPE = { unmeasured: '·', needs_learning: '○', needs_recheck: '◐', mastered: '●', confirmed: '●' };
const STEP = { 1: '기초', 2: '선수', 3: '고졸' };
const byLevel = (a, b) => a.level - b.level;

// 도움 없이 처음 푼 정답으로 확인된 개념 (보충 연습 완료는 세지 않는다)
export const growthCount = map => map.nodes.filter(n => n.status === 'mastered' || n.status === 'confirmed').length;

// 초점 영역 안에서 먼저 보여 줄 개념: 추천 → 보완 필요 → 다시 확인 → 첫 개념
export function focusNodeOf(map, domainId) {
  const group = map.nodes.filter(n => n.domain === domainId).sort(byLevel);
  return group.find(n => n.id === map.nextNodeId) ?? group.find(n => n.status === 'needs_learning')
    ?? group.find(n => n.status === 'needs_recheck') ?? group[0];
}

const dot = (n, selected, next) => `<button class="map-dot ${esc(n.status)}${n.id === selected ? ' selected' : ''}${n.id === next ? ' recommended' : ''}" data-map-action="select" data-map-node="${esc(n.id)}" aria-pressed="${n.id === selected}" aria-label="${esc(`${n.title} · ${STEP[n.level] ?? ''} · ${MAP_STATUS[n.status] ?? '미확인'}${n.id === next ? ' · 지금 여기' : ''}`)}" title="${esc(n.title)}"><span aria-hidden="true">${n.practiceComplete ? '✓' : SHAPE[n.status] ?? '·'}</span></button>`;

// 접힌 영역: 영역 이름 + 단계별 점 한 줄
function compactRow(name, domainId, group, { selected, next, focus }) {
  const done = group.filter(n => n.status === 'mastered' || n.status === 'confirmed').length;
  const steps = [1, 2, 3].map(level => {
    const nodes = group.filter(n => n.level === level);
    return nodes.length ? `<span class="map-dots" data-step="${STEP[level]}">${nodes.map(n => dot(n, selected, next)).join('')}</span>` : '';
  }).join('');
  return `<div class="map-row${focus ? ' focus' : ''}"><button class="map-row-name" data-map-action="domain" data-map-value="${esc(domainId)}" aria-pressed="${focus}">${esc(name)}<small>${done}/${group.length}</small></button><div class="map-row-steps">${steps}</div></div>`;
}

const RESULT = {
  correct: ['✓', '맞힘', 'ok'], helped: ['✓', '도움 받고 맞힘', 'helped'], incorrect: ['✗', '틀림', 'bad'],
  abstained: ['?', '모름', 'unknown'], todo: ['○', '아직 안 풂', 'pending'],
};
const questionText = q => q ? (q.reference?.year ? `${q.reference.year}년 ${q.reference.session}회 ${q.reference.qualification} ${q.reference.questionNumber}번` : String(q.prompt ?? q.id).replace(/\$/g, '')) : '';
// 기출은 출처, 직접 만든 문항은 수식까지 렌더링한 발문
const questionHtml = (q, fallback) => q && !q.reference?.year && q.prompt ? mathHtml(q.prompt) : esc(questionText(q) || fallback);
const resultRow = (key, html, action = '') => {
  const [mark, text, cls] = RESULT[key];
  const body = `<span class="lesson-mark ${cls}" aria-hidden="true">${mark}</span><span class="lesson-q">${html}</span><span class="lesson-result ${cls}">${text}</span>`;
  return `<li>${action ? `<button class="lesson-row" ${action}>${body}</button>` : `<div class="lesson-row">${body}</div>`}</li>`;
};

// 선택한 개념의 문제별 기록: 진단에서 푼 문제 + 보충 연습 문제 (눌러 보지 않아도 무엇을 했는지 보이게)
export function lessonRows(selected, { cards, entries, practice, questions }) {
  const card = cards.find(c => c.id === selected.cardId);
  const byId = new Map((questions ?? []).map(q => [q.id, q]));
  const diagnostic = entries.filter(e => selected.evidenceQuestionIds.includes(e.questionId))
    .map(e => ({ questionId: e.questionId, label: questionText(byId.get(e.questionId)) || e.core || e.questionId,
      html: questionHtml(byId.get(e.questionId), e.core || e.questionId), result: e.result === 'correct' && !e.independent ? 'helped' : e.result }));
  const latest = new Map((practice?.attempts ?? []).filter(a => a.cardId === card?.id).map(a => [a.questionId, a.result==='correct'&&a.helpUsed?'helped':a.result]));
  const review = (card?.questionIds ?? []).map(id => ({ questionId: id, label: questionText(byId.get(id)) || id, html: questionHtml(byId.get(id), id), result: latest.get(id) ?? 'todo' }));
  return { card, diagnostic, review };
}

function detailHtml(map, selected, ctx) {
  const { canPractice,mentor=false } = ctx;
  const { card, diagnostic, review } = lessonRows(selected, ctx);
  const done = review.filter(r => ['correct','helped'].includes(r.result)).length;
  const pct = review.length ? Math.round(done / review.length * 100) : 0;
  const nextReview = review.find(r => !['correct','helped'].includes(r.result)) ?? review[0];
  const openAttr = id => mentor ? `data-map-action="preview" data-map-node="${esc(selected.id)}" data-map-question="${esc(id)}"` : canPractice && card ? `data-roadmap-action="open" data-roadmap-card="${esc(card.id)}" data-roadmap-question="${esc(id)}"` : '';
  const neighbours = (direction, label) => {
    const ids = map.edges.filter(e => e[direction === 'before' ? 'to' : 'from'] === selected.id).map(e => e[direction === 'before' ? 'from' : 'to']);
    return ids.length ? `<p class="lesson-links"><span>${label}</span>${ids.map(id => `<button class="ghost small" data-map-action="select" data-map-node="${esc(id)}">${esc(map.nodes.find(n => n.id === id).title)}</button>`).join('')}</p>` : '';
  };
  return `<aside id="map-detail" class="map-detail map-lesson" aria-labelledby="map-detail-title">
      ${ctx.cta ?? ''}
      <p class="meta">${esc(selected.domainName)} · Step ${selected.level} ${STEP[selected.level] ?? ''}${selected.id === map.nextNodeId ? ' · <b>지금 여기</b>' : ''}</p>
      <div class="lesson-head"><h3 id="map-detail-title" tabindex="-1">${esc(selected.title)}</h3>${review.length ? `<span class="lesson-progress" aria-label="보충 연습 ${done}/${review.length}"><span class="bar"><i style="width:${pct}%"></i></span>${pct}%</span>` : ''}</div>
      <p><span class="map-status ${esc(selected.status)}">${MAP_STATUS[selected.status] ?? '미확인'}</span> <span class="muted small">${esc(selected.reason)}</span></p>
      ${selected.legacy ? '<p class="muted small">이전 진단에 남은 개념이에요. 현재 지도에 없는 관계는 임의로 연결하지 않았어요.</p>' : ''}
      <div class="lesson-list">
        <h4>진단에서 푼 문제 <small>${diagnostic.length}</small></h4>
        ${diagnostic.length ? `<ul>${diagnostic.map(r => resultRow(r.result, r.html)).join('')}</ul>` : '<p class="muted small">직접 응답 기록이 없어 통과나 약점으로 판단하지 않아요.</p>'}
        <h4>보충 연습 문제 <small>${done}/${review.length}</small></h4>
        ${review.length ? `<ul>${review.map(r => resultRow(r.result, r.html, openAttr(r.questionId))).join('')}</ul>` : '<p class="muted small">이 개념에 연결된 보충 문제가 아직 없어요.</p>'}
      </div>
      ${neighbours('before', '먼저 볼 개념')}${neighbours('after', '다음 개념')}
      ${mentor?`<p class="muted small">멘토용 미리보기예요. 열어 봐도 학생의 응답이나 노출 기록을 만들지 않아요.</p><button class="secondary map-practice" data-map-action="preview" data-map-node="${esc(selected.id)}">문제·정답·해설 보기 →</button>${review.map(r=>{
        const q=ctx.questions.find(q=>q.id===r.questionId);if(!q)return '';
        const answer=q.choices?.find(c=>normalizeChoiceValue(c.value)===normalizeChoiceValue(q.answer));
        return `<details class="mentor-question-preview" ${ctx.previewNode===selected.id&&(!ctx.previewQuestion||ctx.previewQuestion===q.id)?'open':''}><summary>${esc(questionText(q))} · 문제·정답·해설</summary>${questionBodyHtml(q)}<ul>${q.choices.map(c=>`<li>${choiceHtml(c)}</li>`).join('')}</ul><p><b>정답:</b> ${answer?choiceHtml(answer):mathHtml(String(q.answer??'해설 확인'))}</p><h4>해설</h4>${(q.solutionSteps??[]).map(s=>`<p>${mathHtml(s)}</p>`).join('')}<p class="muted small">학생 기록: ${RESULT[r.result]?.[1]??'미제출'}</p></details>`;
      }).join('')}`:canPractice && card && nextReview ? `<button class="primary map-practice" ${openAttr(nextReview.questionId)}>${done && done === review.length ? '해설과 보충 문제 다시 풀기 →' : '해설과 보충 문제 풀기 →'}</button>` : '<p class="muted small">첫 수준 확인을 마치거나 중간 결과를 넘기면, 확인한 개념의 보충 학습이 연결돼요.</p>'}
    </aside>`;
}

// 관계 지도에서도 같은 문제별 기록 패널을 쓴다
export const lessonPanel = detailHtml;

const practiceMeta = n => n.practiceTotal ? ` · 연습 ${n.practiceCorrect}/${n.practiceTotal}` : '';
const doneOf = group => group.filter(n => n.status === 'mastered' || n.status === 'confirmed').length;
const COURSE = '고졸 검정고시 수학';

// 영역 설명: 지어내지 않고 실제 개념 이름으로 만든다 (시작 개념 → 고졸 목표 개념)
export function chapterSummary(group) {
  const start = group[0]?.title;
  const goals = [...new Set(group.filter(n => n.level === 3).map(n => n.title))];
  return start && goals.length ? `${start}에서 시작해 ${goals.join(' · ')}까지 이어져요.` : '';
}

// 펼친 영역: 기초 → 선수 → 고졸 순서의 세로 경로. 각 줄에 진행 수를 보여 주고, 선택한 개념은 번호로 강조한다.
function focusPath(map, chapter, group, selected, domains) {
  const index = domains.findIndex(([id]) => id === group[0].domain);
  const near = offset => domains[index + offset];
  const step = (offset, label) => near(offset) ? `<button class="ghost small map-chapter-step" data-map-action="domain" data-map-value="${esc(near(offset)[0])}" aria-label="${label}: ${esc(near(offset)[1])}">${offset < 0 ? '‹' : '›'}</button>` : '<span class="map-chapter-step"></span>';
  return `<section class="map-focus" aria-label="${esc(chapter)} 배움길">
    <div class="map-focus-head">${step(-1, '이전 영역')}<button class="map-chapter-pill" data-map-action="overview" aria-haspopup="dialog">${index + 1}. ${esc(chapter)} <span aria-hidden="true">▾</span></button>${step(1, '다음 영역')}<small>도움 없이 확인 ${doneOf(group)}/${group.length}</small></div>
    <ol class="map-path">${group.map((n, i) => `<li class="map-step ${esc(n.status)}${n.level === 3 ? ' goal' : ''}${n.id === selected.id ? ' current' : ''}"><span class="map-step-dot" aria-hidden="true">${n.id === selected.id ? i + 1 : n.practiceComplete ? '✓' : SHAPE[n.status] ?? '·'}</span><button class="map-step-row" data-map-action="select" data-map-node="${esc(n.id)}" aria-pressed="${n.id === selected.id}" aria-controls="map-detail"><span class="map-step-title">${esc(n.title)}</span><span class="map-step-meta">${STEP[n.level] ?? ''}${n.level === 3 ? ' · 목표' : ''} · ${n.id === map.nextNodeId ? '지금 여기' : MAP_STATUS[n.status] ?? '미확인'}${practiceMeta(n)}</span></button></li>`).join('')}</ol>
  </section>`;
}

const legendHtml = () => `<div class="map-legend">${['needs_learning', 'needs_recheck', 'mastered', 'unmeasured'].map(s => `<span class="map-key ${s}"><i aria-hidden="true">${SHAPE[s]}</i>${MAP_STATUS[s]}</span>`).join('')}<span class="map-key"><i aria-hidden="true">✓</i>보충 연습 완료</span><span class="map-key recommended"><i aria-hidden="true"></i>지금 여기</span></div>`;

// 전체 보기 창: 왼쪽 과정, 오른쪽 영역(설명 + 개념별 점)
function overviewDialog(map, domains, groups, { selected, focusDomain }) {
  return `<div class="map-overview" role="dialog" aria-modal="true" aria-labelledby="map-overview-title">
    <button class="map-overview-backdrop" data-map-action="overview-close" tabindex="-1" aria-label="전체 보기 닫기"></button>
    <div class="map-overview-panel">
      <div class="map-overview-courses">
        <p class="meta">과정</p>
        <button class="map-course-option" data-map-action="overview-close" aria-current="true"><small>목표 과정 · ${domains.length}개 영역 · ${map.nodes.length}개 개념</small><b>${COURSE}</b></button>
        <div class="map-course-option disabled"><small>준비 중</small><b>중졸 검정고시 수학</b><span>중학교 기초·선수 개념은 위 과정 안에 포함돼 있어요.</span></div>
      </div>
      <div class="map-overview-chapters">
        <div class="map-overview-head"><h3 id="map-overview-title" tabindex="-1">${COURSE} · 영역</h3><button class="ghost small" data-map-action="overview-close">닫기 ✕</button></div>
        ${legendHtml()}
        <ol class="map-chapters">${domains.map(([id, name], i) => {
          const group = groups.get(id);
          return `<li class="map-chapter${id === focusDomain ? ' active' : ''}"><div><button class="map-chapter-name" data-map-action="domain" data-map-value="${esc(id)}" aria-current="${id === focusDomain}">${i + 1}. ${esc(name)}</button><p>${esc(chapterSummary(group))}</p><small>도움 없이 확인 ${doneOf(group)}/${group.length}</small></div><div class="map-chapter-dots">${group.map(n => dot(n, selected, map.nextNodeId)).join('')}</div></li>`;
        }).join('')}</ol>
      </div>
    </div>
  </div>`;
}

// 학생: 과정 카드 + 지금 영역의 경로 + 오른쪽 문제별 기록. 다른 영역은 전체 보기 창에서 고른다.
// 멘토: 6개 영역을 같은 크기의 점 줄로 항상 보여 준다.
export function renderConceptMap(map, ui, { cards, canPractice, entries = [], practice = null, questions = [], mentor = false, cta = '' }) {
  const selected = map.nodes.find(n => n.id === ui.mapNodeId) ?? map.nodes.find(n => n.id === map.nextNodeId) ?? map.nodes[0];
  if (!selected) return `${cta}<p class="msg">아직 표시할 개념 자료가 없어요. 학습 화면에서 기존 기록을 확인할 수 있어요.</p>`;
  const focusDomain = mentor ? null : (ui.mapDomainId && map.nodes.some(n => n.domain === ui.mapDomainId) ? ui.mapDomainId : selected.domain);
  const shown = mentor || selected.domain === focusDomain ? selected : focusNodeOf(map, focusDomain);
  const domains = [...new Map(map.nodes.map(n => [n.domain, n.domainName])).entries()];
  const groups = new Map(domains.map(([id]) => [id, map.nodes.filter(n => n.domain === id).sort(byLevel)]));
  const panel = detailHtml(map, shown, { cards, canPractice, entries, practice, questions, cta,mentor,previewNode:ui.mentorPreviewNode,previewQuestion:ui.mentorPreviewQuestion });
  if (mentor) {
    const rows = domains.map(([id, name]) => compactRow(name, id, groups.get(id), { selected: shown.id, next: map.nextNodeId, focus: false })).join('');
    return `<section class="concept-map overview" aria-labelledby="map-heading">
    <div class="map-toolbar"><div><p class="meta">6개 영역을 같은 크기로 비교해요</p><h3 id="map-heading" tabindex="-1">개념 관계 지도</h3></div></div>
    ${legendHtml()}
    <p class="muted small">각 줄은 기초 → 선수 → 고졸 순서예요. 점을 누르면 개념의 문제별 기록이 보여요.</p>
    <div class="map-layout"><div class="map-board">${rows}</div>${panel}</div>
  </section>`;
  }
  const focusName = domains.find(([id]) => id === focusDomain)[1];
  return `<section class="concept-map learner" aria-labelledby="map-heading">
    <h3 id="map-heading" class="sr-only" tabindex="-1">개념 관계 지도</h3>
    <div class="map-layout"><div class="map-board">
      <button id="map-course" class="map-course" data-map-action="overview" aria-haspopup="dialog"><small>${domains.length}개 영역 · ${map.nodes.length}개 개념 · 전체 보기</small><b>${COURSE} <span aria-hidden="true">▾</span></b></button>
      ${legendHtml()}
      ${focusPath(map, focusName, groups.get(focusDomain), shown, domains)}
    </div>${panel}</div>
    ${ui.mapOverviewOpen ? overviewDialog(map, domains, groups, { selected: shown.id, focusDomain }) : ''}
  </section>`;
}

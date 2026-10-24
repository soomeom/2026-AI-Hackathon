// Read-only summaries for mentor home and learner result screens.
import { esc, STAGE_LABEL } from './text.js';
import { roadmapCards } from '../learning/roadmap.js';
import { initialAssessmentSummary } from '../learning/initial-assessment.js';
import { buildLogFacts } from '../mentoring/logs.js';

export const nextDiagnosticCard = summary => summary?.roadmap ? roadmapCards(summary.roadmap).find(c => c.id === summary.roadmap.nextCardId) : null;
const metric = (label, value, note='') => `<div><span>${label}</span><strong>${value}</strong>${note?`<small>${note}</small>`:''}</div>`;
const taskRow = (label, note, target, count, extra='') => `<button class="overview-task" data-goto="${target}" ${extra}><span><strong>${label}</strong><small>${esc(note)}</small></span>${count!=null?`<b>${count}</b>`:''}<span aria-hidden="true">→</span></button>`;

export function renderDiagnosticOverview(summary) {
  const next=nextDiagnosticCard(summary), paused=summary.stopReason==='user_paused';
  const cards=roadmapCards(summary.roadmap), parent=next && cards.find(c=>c.level===3 && c.dependsOn.includes(next.id));
  const reason=next ? `${parent ? `‘${parent.title}’에 연결되는 개념이에요. ` : ''}${next.reason}. 기초부터 순서대로 확인해요.`
    : '이번 진단에서 남은 보완 과제가 없어요. 측정하지 않은 개념은 로드맵에서 따로 확인할 수 있어요.';
  return `<div class="overview-result">
    <header class="overview-heading"><p class="meta">${paused?'중간까지 확인':'첫 수준 확인 완료'} · ${summary.counts.total}문제 응답</p><h2 id="result-title" tabindex="-1">${next?'다음에 배울 것이 보였어요':'이번 진단 결과를 정리했어요'}</h2><p>현재 추정 수준 · <b>${esc(summary.report.tier)}</b></p></header>
    <div class="overview-metrics">${metric('정답',summary.counts.correct+'문항')}${metric('오답',summary.counts.incorrect+'문항')}${metric('모름',summary.counts.abstained+'문항')}</div>
    <section class="overview-next"><div><span class="overview-eyebrow">다음 학습${next?` · Step ${next.step}`:''}</span><h3>${esc(next?.title??'멘토와 다음 수업을 정해요')}</h3><p>${esc(reason)}</p></div>
      ${next?'<button class="primary" data-initial-action="next-practice">추천 개념 연습하기 →</button>':'<button class="primary" data-initial-action="roadmap">로드맵 확인하기 →</button>'}</section>
    <div class="overview-links"><button class="ghost" data-initial-action="roadmap">맞춤형 학습 로드맵 보기</button><button class="ghost" data-initial-action="details">영역별 결과·응답 기록</button></div>
    <p class="muted small">${summary.startingPoint?'멘토가 정한 첫 수업은 기존 학습에서 이어갈 수 있어요.':'멘토가 결과를 보고 첫 수업 시작점을 정할 거예요.'} 보충 연습 완료는 최초 진단 판정을 바꾸지 않아요.</p>
  </div>`;
}

export function renderMentorHome(state,catalog,summary,paths) {
  const initial=initialAssessmentSummary(state,state.learnerId,{catalog}), next=nextDiagnosticCard(initial);
  const active=paths.filter(p=>['active','paused','needs_mentor'].includes(p.status));
  const blocked=active.find(p=>p.status==='needs_mentor');
  const help=active.filter(p=>p.mentorRequests?.length);
  const sessions=(state.sessions??[]).filter(s=>s.learnerId===state.learnerId);
  const pending=sessions.filter(s=>{
    const latest=(state.logs??[]).filter(l=>l.sessionId===s.id).sort((a,b)=>b.revision-a.revision)[0];
    return !latest||latest.status!=='confirmed'||buildLogFacts(state,s.id).requiresReview;
  });
  let title, reason, label, target, pathId;
  if(blocked || help.length) {
    const path=blocked??help[0]; pathId=path.id; target='learning'; label='학생이 막힌 지점 확인';
    title=blocked?'학생과 함께 풀이를 확인해 주세요':'학생이 도움을 요청했어요';
    reason=`${STAGE_LABEL[path.stage]??'학습'} 단계의 기록을 보고, 설명할 지점을 정해 주세요.`;
  } else if(initial?.status==='completed') {
    title=next?`${next.title}부터 함께 확인해요`:'다음 수업을 준비할 수 있어요';
    reason=next?`${next.reason}. 진단의 추천 순서를 참고해 수업 시작점을 정해 주세요.`:'이번 진단에 남은 보완 과제가 없어요. 직접 확인한 범위를 보고 다음 문제를 정해 주세요.';
    target='planning';label=initial.startingPoint?'다음 수업 준비하기':'첫 수업 시작점 정하기';
  } else if(active.length) {
    title='진행 중인 학습을 살펴보세요';reason='학생의 풀이 기록을 확인하고 다음 수업을 준비할 수 있어요.';target='learning';label='진행 중 학습 확인';pathId=active[0].id;
  } else {
    title=initial?'학생이 첫 수준을 확인하고 있어요':'첫 수준 확인부터 시작해요';
    reason=initial?`${initial.counts.total}문제 응답. 진단을 마치거나 중간 결과를 넘기면 학습 시작점을 정할 수 있어요.`:'아직 진단 기록이 없어요. 멘티 화면에서 첫 수준 확인을 시작해 주세요.';
    target='assessment';label='진단 상태 확인';
  }
  const tasks=initial?.roadmap?roadmapCards(initial.roadmap).filter(c=>['needs_learning','needs_recheck'].includes(c.status)&&!c.practiceComplete).length:0;
  return `<div class="mentor-overview">
    <header class="overview-heading"><p class="meta">멘토 홈</p><h2 id="overview-title" tabindex="-1">오늘 확인할 것</h2><p>학생의 현재 상태를 보고, 다음 수업으로 이어가세요.</p></header>
    <div class="overview-metrics">${metric('첫 수준 확인',initial?(initial.status==='active'?'진행 중':initial.stopReason==='user_paused'?'중간 결과':'완료'):'시작 전',initial?`${initial.counts.total}문제 응답`:'멘티가 시작할 수 있어요')}${metric('진단 후 남은 보완',tasks+'개','보충 연습 대상 개념')}${metric('진행 중 학습',active.length+'개','멘토 확인 필요 포함')}</div>
    <section class="overview-next"><div><span class="overview-eyebrow">지금 먼저 할 일</span><h3>${esc(title)}</h3><p>${esc(reason)}</p></div><button class="primary" data-goto="${target}" ${pathId?`data-path="${esc(pathId)}"`:''}>${label} →</button></section>
    <section class="overview-task-list" aria-label="필요한 정보 바로가기">
      ${taskRow('첫 수준 확인 결과',initial?.report?.tier??'진단 상태와 영역별 결과','assessment',null)}
      ${taskRow('학습 근거와 도움 요청',help.length?`진행 중 학습의 도움 요청 ${help.reduce((n,p)=>n+p.mentorRequests.length,0)}건`:'문항별 응답과 직접 확인한 근거','learning',null)}
      ${taskRow('회기·일지',pending.length?'수업 후 작성·확정할 일지가 있어요':'실제 수업 기록과 월별 대장','sessions',pending.length, pending[0]?`data-session="${esc(pending[0].id)}"`:'')}
    </section>
    <div class="overview-links"><button class="ghost" data-goto="roadmap">개념 관계 지도 보기 →</button><button class="ghost" data-goto="planning">문제 지정·AI 수업 준비 →</button></div>
  </div>`;
}

export function renderPathResult(path,paths=[]) {
  const waiting=path.stage==='needs_mentor';
  const first=(path.pastItems??[]).find(i=>i.stage==='original_attempt');
  const next=paths.find(p=>p.id!==path.id&&['active','paused'].includes(p.status));
  const result=value=>({correct:'정답',incorrect:'오답',abstained:'모름'}[value]??'미측정');
  return `<section class="card overview-result path-result">
    <header class="overview-heading"><p class="meta">학습 결과</p><h2 id="result-title" tabindex="-1">${waiting?'멘토와 함께 확인해요':'오늘의 배움길을 마쳤어요!'}</h2><p>${waiting?'지금까지의 기록을 바탕으로 다음 수업에서 함께 짚어 봐요.':'처음 풀이와 연습 이후의 결과를 나란히 살펴보세요.'}</p></header>
    <div class="overview-metrics">${metric('처음 풀이',result(first?.result))}${metric('다시 도전',path.retryResult?result(path.retryResult):'해당 없음')}${metric('새 문제 결과',path.transferStatus==='not_measured'?'미측정':result(path.transferResult))}</div>
    <section class="overview-next"><div><span class="overview-eyebrow">다음 학습</span><h3>${next?'다음에 지정된 문제로 이어가요':waiting?'로드맵에서 보완할 개념을 살펴봐요':'다음에 배울 개념을 확인해요'}</h3><p>${next?'현재 결과는 저장되어 멘토도 확인할 수 있어요.':'진단에서 추천한 개념과 보충 연습을 로드맵에서 확인할 수 있어요.'}</p></div>
      ${next?`<button class="primary" data-result-path="${esc(next.id)}">다음 학습 이어가기 →</button>`:'<button class="primary" data-action="result-roadmap">로드맵 보기 →</button>'}</section>
    <details class="overview-details"><summary>이번 학습의 상세 기록</summary><p class="muted small">새 문제 정답도 도움·이전 노출 여부를 함께 확인해야 해요. 재도전 정답을 독립 숙달로 보지 않아요.</p>
      ${path.skippedStageIds?.length?`<p>건너뛴 단계: ${path.skippedStageIds.map(s=>esc(STAGE_LABEL[s]??s)).join(', ')}</p>`:''}
      <ul>${(path.pastItems??[]).map(i=>`<li>${esc(STAGE_LABEL[i.stage]??i.stage)} · ${result(i.result)}${i.helpUsed?' · 도움 사용':''}</li>`).join('')}</ul>
    </details>
  </section>`;
}

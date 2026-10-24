import { roadmapCards } from '../learning/roadmap.js';
import { esc, mathHtml, questionBodyHtml, choiceHtml } from './text.js';

function cardHtml(card, nextCardId) {
  return `<button class="roadmap-card${card.id === nextCardId ? ' recommended' : ''}" data-roadmap-action="open" data-roadmap-card="${esc(card.id)}" data-roadmap-question="${esc(card.questionIds[0])}">
    <span class="roadmap-card-status">${card.practiceComplete ? '✓ 보충 연습 완료' : card.id === nextCardId ? '여기부터 시작해요' : card.status === 'mastered' ? '✓ 이번 진단 통과' : card.status === 'confirmed' ? '선수 개념 확인됨' : '학습할 개념'}</span>
    <strong>${esc(card.title)}</strong><span>${esc(card.reason)}</span>
    <small>${card.practiceCorrect}/${card.practiceTotal}문항 연습 · 해설과 문제 열기 →</small></button>`;
}

export function renderRoadmap(roadmap, practice, bank, ui = {}) {
  const cards=roadmapCards(roadmap), card=cards.find(c=>c.id===practice.cardId);
  if(card){
    const q=bank.find(q=>q.id===practice.questionId);
    if(!q)return '<p role="alert">연습 문항을 찾지 못했어요. 로드맵을 다시 열어 주세요.</p>';
    const answer=practice.attempts.find(a=>a.id===practice.answerId);
    const blocked=cards.filter(c=>card.dependsOn.includes(c.id)&&!c.practiceComplete);
    const nextIndex=card.questionIds.indexOf(q.id)+1;
    return `<section class="roadmap-study" aria-labelledby="roadmap-title">
      <button class="ghost" data-roadmap-action="close">← 전체 로드맵</button>
      <p class="pill primary">Step ${card.step} · ${card.practiceCorrect}/${card.practiceTotal}문항 연습 완료</p>
      <h3 id="roadmap-title" tabindex="-1">${esc(card.title)}</h3>
      ${blocked.length?`<p class="msg">먼저 살펴보면 좋아요: ${blocked.map(c=>`<button class="ghost small" data-roadmap-action="open" data-roadmap-card="${esc(c.id)}" data-roadmap-question="${esc(c.questionIds[0])}">${esc(c.title)}</button>`).join(' ')}</p>`:''}
      <details class="roadmap-explanation"><summary>개념과 풀이 살펴보기</summary><div>${mathHtml(card.explanation)}</div></details>
      <p class="muted small">진단 문항과 같은 개념의 보충 문제를 연습해요. 해설을 보고 풀어도 괜찮아요. 연습 완료는 최초 진단 수준이나 독립 숙달 판정을 바꾸지 않아요.</p>
      ${questionBodyHtml(q,{promptId:'roadmap-prompt'})}
      <div class="choices" role="radiogroup" aria-labelledby="roadmap-prompt">${q.choices.map((c,i)=>`<button class="choice${(answer?.choiceId??ui.roadmapChoice)===c.id?' selected':''}" role="radio" aria-checked="${(answer?.choiceId??ui.roadmapChoice)===c.id}" data-roadmap-action="choice" data-roadmap-choice="${c.id}" data-roadmap-round="${esc(practice.roundId)}" ${answer?'disabled':''}><span class="key">${'ABCD'[i]}</span><span>${choiceHtml(c)}</span></button>`).join('')}</div>
      ${answer?`<div class="msg" role="status"><b>${answer.result==='correct'?'맞혔어요. 이 문항의 연습을 마쳤어요.':answer.result==='abstained'?'풀이를 보고 다시 연습해 봐요.':'풀이에서 헷갈린 부분을 확인해 봐요.'}</b>${q.solutionSteps.map(s=>`<p>${mathHtml(s)}</p>`).join('')}</div>
      <div class="action-bar"><button class="ghost" data-roadmap-action="open" data-roadmap-card="${esc(card.id)}" data-roadmap-question="${esc(q.id)}">한 번 더 연습</button>${nextIndex<card.questionIds.length?`<button class="primary" data-roadmap-action="open" data-roadmap-card="${esc(card.id)}" data-roadmap-question="${esc(card.questionIds[nextIndex])}">다음 연습 문제</button>`:'<button class="primary" data-roadmap-action="close">로드맵에서 다음 개념 보기</button>'}</div>`:
      `<div class="action-bar"><button class="primary" data-roadmap-action="submit" data-roadmap-round="${esc(practice.roundId)}" ${ui.roadmapChoice?'':'disabled'}>연습 답 확인</button><button class="ghost" data-roadmap-action="unknown" data-roadmap-round="${esc(practice.roundId)}">잘 모르겠어요</button></div>`}
      ${ui.roadmapError?`<p role="alert">${esc(ui.roadmapError)}</p>`:''}</section>`;
  }
  return `<section class="roadmap" aria-labelledby="roadmap-title"><div class="roadmap-heading"><div><p class="meta">진단 기록으로 만든 학습 순서</p><h3 id="roadmap-title" tabindex="-1">나의 맞춤형 학습 로드맵</h3></div><span class="pill primary">Step 1 → Step 2 → Step 3</span></div>
    <p class="muted">막힌 가장 기초 개념부터 차근차근 올라가요. 카드를 누르면 해설과 보충 문제를 바로 열 수 있어요.</p>
    <p class="muted small">오답은 원인을 확정하지 않아요. ‘모름’은 추가 확인 대상으로 표시하며, 각 단계는 학년이 아닌 선수 관계를 뜻해요.</p>
    ${practice.recovery?'<p class="msg" role="status">연습 기록 일부를 읽지 못해 원본을 보관했어요. 진단 결과는 유지되며 보충 연습을 다시 시작할 수 있어요.</p>':''}
    ${roadmap.legacy?'<p class="msg">이전 진단 기록을 보존한 결과예요. 개념 표시는 현재 자료로 보완했으며, 당시의 선수 연결은 지금과 다를 수 있어요.</p>':''}
    ${roadmap.domains.map(d=>`<section class="roadmap-domain"><h4>${esc(d.name)}</h4><div class="roadmap-steps">${d.steps.map(s=>`<section class="roadmap-step"><h5><span>Step ${s.step}</span> ${s.title}</h5>${s.cards.length?s.cards.map(c=>cardHtml(c,roadmap.nextCardId)).join(''):'<p class="roadmap-empty">이 단계에서 기록된 학습 대상이 없어요.</p>'}</section>`).join('')}</div></section>`).join('')}
    ${roadmap.recheck.length?`<section class="roadmap-extra"><h4>도움 없이 다시 확인 · ${roadmap.recheck.length}개</h4><p class="muted small">도움 받거나 이미 본 문제의 정답은 통과로 단정하지 않아요.</p><div class="roadmap-extra-cards">${roadmap.recheck.map(c=>cardHtml(c,roadmap.nextCardId)).join('')}</div></section>`:''}
    <details class="roadmap-extra"><summary>학습 완료 / 이번 진단 통과 · ${roadmap.mastered.length}개</summary><p class="muted small">처음 본 고졸 문항의 독립 정답이에요. 개념 전체의 숙달을 확정하는 뜻은 아니에요.</p><div class="roadmap-extra-cards">${roadmap.mastered.map(c=>cardHtml(c,null)).join('')||'<p>아직 통과한 고졸 개념이 없어요.</p>'}</div></details>
    ${roadmap.confirmed.length?`<details class="roadmap-extra"><summary>확인된 선수·기초 개념 · ${roadmap.confirmed.length}개</summary><div class="roadmap-extra-cards">${roadmap.confirmed.map(c=>cardHtml(c,null)).join('')}</div></details>`:''}
    ${roadmap.unmeasured.length?`<p class="msg">미측정 ${roadmap.unmeasured.length}개: ${esc(roadmap.unmeasured.map(c=>c.title).join(', '))}. 아직 확인하지 않은 개념은 통과로 계산하지 않아요.</p>`:''}
    ${ui.roadmapError?`<p role="alert">${esc(ui.roadmapError)}</p>`:''}</section>`;
}

// Shared UI actions; main app and standalone diagnostic provide their own persistence adapters.
export function handleRoadmapAction(button, { ui, getSummary, open, answer, rerender, root }) {
  const action=button.dataset.roadmapAction;
  if(!action)return false;
  const summary=getSummary(); ui.roadmapError=null;
  try {
    const roundId=button.dataset.roadmapRound;
    if(['choice','submit','unknown'].includes(action)&&roundId!==summary.practice.roundId)return true;
    if(action==='choice')ui.roadmapChoice=button.dataset.roadmapChoice;
    else if(action==='open'){ui.roadmapChoice=null;open(button.dataset.roadmapCard,button.dataset.roadmapQuestion);}
    else if(action==='close'){ui.roadmapChoice=null;open(null);}
    else if(action==='submit'||action==='unknown'){
      answer({roundId,choiceId:action==='unknown'?null:ui.roadmapChoice,abstained:action==='unknown'});ui.roadmapChoice=null;
    }else return false;
  }catch{ui.roadmapError='연습을 처리하지 못했어요. 현재 문항을 다시 열어 주세요.';}
  rerender();
  if(action!=='choice'){
    const title=root.querySelector?.('#roadmap-title')??root.querySelector?.('#map-heading');
    title?.focus?.({preventScroll:true});title?.scrollIntoView?.({block:'start',behavior:'instant'});
  }
  return true;
}

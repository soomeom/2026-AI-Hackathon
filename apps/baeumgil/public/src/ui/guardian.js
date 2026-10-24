import { buildGuardianSummary } from '../learning/guardian-summary.js';
import { esc } from './text.js';
const STATUS={independent:['혼자 해결한 근거','처음 본 문제를 도움 없이 해결한 응답이 있어요.'],review_success:['연습에서 해결','도움·재도전을 포함한 연습 정답이에요. 새 문제로 다시 확인해요.'],needs_support:['함께 확인할 개념','최근 응답에서 막힌 부분이 있어요. 멘토와 차근차근 살펴봐요.']};
const date=at=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric'}).format(new Date(at));
export function renderGuardian({root,state,catalog}) {
 const s=buildGuardianSummary(state,catalog),learner=state.learners?.find(l=>l.id===state.learnerId);
 const max=Math.max(1,...s.activity.map(d=>d.count));
 const summary=s.totalResponses?`최근 7일 중 ${s.activeDays}일, ${s.totalResponses}번 응답하며 배움을 이어갔어요.`:'최근 7일의 학습 응답 기록이 아직 없어요.';
 const next=s.nextSteps[0];
 root.innerHTML=`<div class="guardian-page">
  <header class="guardian-heading"><p class="meta">보호자용 학습 소식 · 수학</p><h1>${esc(learner?.name??'학생')}의 배움, 함께 살펴봐요</h1><p>최근 참여와 확인된 변화를 보고, 다음 한 걸음을 응원해 주세요.</p></header>
  <section class="card guardian-highlight"><span class="pill primary">한눈에 보는 이번 주</span><h2>${summary}</h2><p>${next?`지금은 ‘${esc(next.title)}’부터 차근차근 확인하면 좋아요.`:s.assessmentStatus==='not_started'?'첫 수준 확인을 시작하면 배울 개념과 순서를 안내해요.':s.assessmentStatus==='active'?'첫 수준을 확인하고 있어요. 결과가 모이면 다음 배움길을 안내해요.':'기록된 추천 연습을 마쳤다면 멘토와 다음 문제를 정해요.'}</p><div class="guardian-metrics"><div><span>학습한 날</span><strong>${s.activeDays}<small> / 최근 7일</small></strong></div><div><span>응답한 문제</span><strong>${s.totalResponses}<small>회</small></strong></div><div><span>마지막 응답</span><strong>${s.lastActivity?date(s.lastActivity):'기록 없음'}</strong></div></div></section>
  <section class="card" aria-labelledby="activity-title"><div class="guardian-section-head"><h2 id="activity-title">최근 7일, 이렇게 참여했어요</h2><span class="muted small">한국 시간 기준</span></div><p class="muted">날짜별 응답 횟수예요. 정답·오답·모름을 모두 포함해요.</p>
   <figure class="guardian-chart"><ol class="guardian-bars" aria-label="최근 7일 날짜별 응답 횟수">${s.activity.map(d=>`<li aria-label="${d.date}, ${d.count?`${d.count}회 응답`:'기록 없음'}"><strong>${d.count||'—'}</strong><div class="guardian-bar-track" aria-hidden="true"><i style="height:${d.count/max*100}%"></i></div><span>${Number(d.date.slice(5,7))}/${Number(d.date.slice(8))}</span><small>${d.count?'응답':'기록 없음'}</small></li>`).join('')}</ol><figcaption>${summary}</figcaption></figure>
   <details class="guardian-daily"><summary>날짜별 응답 종류 보기</summary><ul>${s.activity.map(d=>`<li><b>${d.date}</b><span>${d.count?`수준 확인 ${d.diagnostic} · 지정 학습 ${d.lesson} · 보충 ${d.review} · AI 연습 ${d.ai}`:'기록 없음'}</span></li>`).join('')}</ul></details>
   <p class="muted small">기록 없음은 이 브라우저에 응답이 없다는 뜻이에요. 공부하지 않았다고 판단하지 않아요.${s.undatedResponses?` 날짜가 없는 과거 응답 ${s.undatedResponses}건은 그래프에서 제외했어요.`:''}</p></section>
  <section class="card" aria-labelledby="growth-title"><h2 id="growth-title">어떤 부분을 확인했을까요?</h2><p class="muted">기록된 개념의 최근 응답을 기준으로 정리했어요. 학습 전체의 숙달 판정은 아니에요.</p>
   <div class="guardian-concept-groups">${Object.entries(STATUS).map(([key,[label,note]])=>{
    const list=s.concepts.filter(c=>c.status===key),rows=items=>`<ul>${items.map(c=>`<li>${esc(c.title)}</li>`).join('')}</ul>`;return `<article class="guardian-concept-group ${key}"><span class="guardian-count">${list.length}<small>개념</small></span><h3>${label}</h3>${list.length?`<p>${note}</p>${rows(list.slice(0,4))}${list.length>4?`<details><summary>나머지 ${list.length-4}개 개념 보기</summary>${rows(list.slice(4))}</details>`:''}`:'<p class="muted small">아직 해당 근거가 없어요.</p>'}</article>`;
   }).join('')}</div></section>
  <section class="card"><h2>다음 한 걸음은 이 순서로</h2><p class="muted">지금 추천하는 개념에서 연결되는 배움길이에요. 각 단계의 기초를 채운 뒤 다음 단계에 도전해요.${s.assessmentStatus==='active'?' 수준 확인 진행 중이므로 지금까지의 응답에 따른 임시 안내예요.':''}</p>${s.nextSteps.length?`<ol class="guardian-roadmap">${s.nextSteps.map((c,i)=>`<li><span class="guardian-step">${i+1}</span><div><small>${['','기초 다지기','선수 개념 연결','고졸 기출 도전'][c.step]}</small><h3>${esc(c.title)}</h3><p>${esc(c.reason)}</p></div></li>`).join('')}</ol>`:`<p class="msg">${s.assessmentStatus==='not_started'?'아직 첫 수준 확인 전이에요.':s.assessmentStatus==='active'?'수준 확인 진행 중이에요. 지금까지의 결과는 참고용이에요.':'현재 남아 있는 추천 연습이 없어요. 멘토와 다음 수업을 정해요.'}</p>`}<p class="muted small">실제 연습은 멘티 화면의 로드맵에서 이어갈 수 있어요.</p></section>
  <section class="card guardian-support"><h2>이렇게 말을 건네 주세요</h2><blockquote>“${next?`‘${esc(next.title)}’에서 어떤 부분을 새로 알게 됐어?`:'오늘 공부하면서 새로 알게 된 게 있었어?'}”</blockquote><p>맞힌 개수만 묻기보다 시도한 과정과 궁금한 점을 함께 들어 주세요.</p>
   <div class="guardian-shared"><h3>멘토가 공유한 안내</h3>${s.sharedMessage?`<p class="pre">${esc(s.sharedMessage.text)}</p><small class="muted">${date(s.sharedMessage.sharedAt)} 공유</small>`:'<p class="muted">아직 공유된 안내가 없어요.</p>'}</div></section>
  <p class="muted small">이 브라우저의 가명 기록으로 보는 보호자 시연 화면이에요. 다른 기기의 학생 기록과 연결되지 않아요.</p></div>`;
}

import { esc, mathHtml, questionBodyHtml, choiceHtml, resultBadge } from './text.js';
import { aiPracticeSummary } from '../learning/ai-practice.js';
import {renderHintPanel,handleHintAction} from './hints.js';
const title=id=>id==='roadmap-like-terms'?'동류항 정리':'일차식 계산';
export function renderAIPractice({root,state,catalog,ui,practice,hints}) {
 const loading=ui.practiceLoading;
 const r=(state.generatedPractice??[]).find(r=>r.id===state.activeGeneratedPracticeId&&r.learnerId===state.learnerId);
 if(!loading&&!r)return false;
 const answer=r?.attempts[0];
 const stats=r?aiPracticeSummary(state,{assessmentId:r.assessmentId,cardId:r.cardId}):null;
 root.innerHTML=`<section class="card roadmap-study ai-practice" aria-labelledby="ai-practice-title"><button class="ghost" data-ai-practice="close">← 로드맵으로 돌아가기</button>
  <p class="pill primary">${loading?'AI 맞춤 연습 준비 중':'AI 맞춤 연습 · 정답 검증 완료'}</p>
  <h2 id="ai-practice-title" tabindex="-1">${esc(title(r?.spec.conceptId??loading.cardId.split(':').at(-1)))}</h2>
  <p class="muted small">기존 응답을 참고한 추가 연습이에요. 최초 진단 수준과 기출 숙달 판정은 바뀌지 않아요.</p>
  ${loading?'<p role="status" aria-live="polite">지금 연습할 개념에 맞는 문제를 준비하고 있어요. 최대 5초 기다린 뒤 준비된 문제로 이어가요.</p>':`
   <p class="meta">AI 추가 연습 ${stats.attempted}회 · 정답 ${stats.correct}회 · 공식 기출 아님</p>
   ${questionBodyHtml(r.question,{promptId:'ai-practice-prompt'})}
   ${!answer?renderHintPanel(state,ui,{kind:'generated',practiceId:r.id}):''}
   <div class="choices" role="radiogroup" aria-labelledby="ai-practice-prompt">${r.question.choices.map((c,i)=>`<button class="choice${r.draftChoiceId===c.id?' selected':''}" role="radio" aria-checked="${r.draftChoiceId===c.id}" data-ai-practice="choice" data-practice-id="${esc(r.id)}" data-choice-id="${esc(c.id)}" ${answer?'disabled':''}><span class="key">${'ABCD'[i]}</span><span>${choiceHtml(c)}</span></button>`).join('')}</div>
   ${answer?`<div class="msg" role="status">${resultBadge(answer.result)}${answer.helpUsed?' · 도움 사용':''}${r.question.solutionSteps.map(s=>`<p>${mathHtml(s)}</p>`).join('')}</div><button class="primary" data-ai-practice="more">같은 개념 더 연습</button>`:`<label><input type="checkbox" id="ai-practice-help" ${ui.practiceHelp?'checked':''}> 도움을 받았어요</label><div class="action-bar"><button class="primary" data-ai-practice="submit" data-practice-id="${esc(r.id)}" ${r.draftChoiceId?'':'disabled'}>연습 답 확인</button><button class="ghost" data-ai-practice="unknown" data-practice-id="${esc(r.id)}">잘 모르겠어요</button></div>`}`}
   <div class="action-bar"><button class="ghost" data-ai-practice="existing">기존 문제로 바로 연습</button></div>
   ${ui.practiceError?`<p role="alert">${esc(ui.practiceError)}</p>`:''}</section>`;
 root.onclick=e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(handleHintAction(b,{ui,hints}))return;
  ui.practiceError=null;
  try {
   const action=b.dataset.aiPractice,id=b.dataset.practiceId;
   if(['close','more','existing'].includes(action))hints?.cancel();
   if(action==='existing')practice.useExisting('manual',r);
   else if(action==='close'){ui.practiceHelp=false;if(ui.role==='mentor')ui.mentorTab='roadmap';else ui.learnerTab='roadmap';practice.close();}
   else if(action==='more'){ui.practiceHelp=false;practice.more();}
   else if(action==='choice')practice.choose(id,b.dataset.choiceId);
   else if(action==='submit'||action==='unknown'){practice.submit(id,action==='unknown',Boolean(ui.practiceHelp));ui.practiceHelp=false;}
  }catch{ui.practiceError='현재 문항을 다시 확인해 주세요.';}
 };
 root.onchange=e=>{if(e.target.id==='ai-practice-help')ui.practiceHelp=e.target.checked;};
 return true;
}
export function renderMentorAIPractice(state,catalog) {
 const summary=aiPracticeSummary(state);if(!summary.records.length)return '';
 return `<section class="card"><h3>AI 추가 연습 · ${summary.attempted}회 응답 / 정답 ${summary.correct}회</h3><p class="muted small">최초 진단·기출 독립 적용률과 분리된 연습 기록이에요. 다음 수업에서 같은 개념을 도움 없이 설명하고 풀 수 있는지 확인해 주세요.</p>
 ${summary.records.slice(-10).reverse().map(r=>`<details><summary>${esc(title(r.spec.conceptId))} · ${r.attempts[0]?({correct:'정답',incorrect:'오답',abstained:'모름'}[r.attempts[0].result]):'미제출'} · AI 생성 / 코드 검증</summary><p>생성 시각: ${esc(r.generatedAt)} · 정답 검사 통과</p><p>맞춤화에 참고한 등록 문항: ${r.evidence.map(e=>`${mathHtml(catalog.questions.find(q=>q.id===e.questionId)?.prompt??title(r.spec.conceptId))} (${({correct:'정답',incorrect:'오답',abstained:'모름'}[e.result])})`).join(', ')||'기존 응답 없음'}</p>${questionBodyHtml(r.question)}<p>학생 답: ${r.attempts[0]?.abstained?'모름':mathHtml(r.question.choices.find(c=>c.id===(r.attempts[0]?.choiceId??r.draftChoiceId))?.text??'미제출')}${r.attempts[0]?.helpUsed?' · 도움 사용':''}</p>${r.question.solutionSteps.map(s=>`<p>${mathHtml(s)}</p>`).join('')}<p>다음 수업: ${esc(title(r.spec.conceptId))}의 풀이 과정을 말로 설명하도록 요청하고, 관련 기출 학습으로 연결해 주세요.</p><button class="ghost small" data-goto="planning">관련 기출 지정·수업 준비 →</button></details>`).join('')}</section>`;
}

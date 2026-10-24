import {buildWeeklyGoal} from '../learning/weekly-goal.js';
import {esc} from './text.js';
export function renderWeeklyGoal(state,catalog,{mentor=false,ui={},now}={}){
 const goal=buildWeeklyGoal(state,catalog,{now});
 const progress=(label,count,target,status,done)=>`<div class="weekly-goal-progress"><p class="weekly-goal-status"><span class="pill ${done?'ok':'neutral'}">${done?'✓ ':''}${status}</span></p><div><span>${label}</span><strong>${count} / ${target}</strong></div><progress aria-label="${label}" value="${Math.min(count,target)}" max="${target}">${count}/${target}</progress></div>`;
 const studentStatus=goal.learningComplete?'학생 학습 완료':'학생 학습 목표 진행 중';
 const description=goal.complete?'이번 주 약속을 함께 채웠어요. 함께 이룬 배움을 축하해요!':goal.learningComplete?'이번 주 학생의 학습 목표를 채웠어요. 함께하는 수업은 별도로 기다리고 있어요.':goal.sessionComplete?'함께하는 수업을 마쳤어요. 남은 보충 학습도 한 걸음씩 이어가요.':'이번 주에는 보충 개념 2개와 함께하는 수업 1회를 목표로 해요.';
 return `<section class="card weekly-goal" aria-labelledby="weekly-goal-title">
  <div class="weekly-goal-heading"><div><p class="meta">${goal.weekStart.slice(5).replace('-','/')} ~ ${goal.weekEnd.slice(5).replace('-','/')} · 한국 시간</p><h3 id="weekly-goal-title">이번 주 함께 목표</h3></div><span class="pill ${goal.complete?'ok':'neutral'}">${goal.complete?'✓ 함께 목표 완료':'한 걸음씩 함께'}</span></div>
  <p>${description}</p>
  <div class="weekly-goal-meters">${progress('보충 개념',goal.concepts,2,studentStatus,goal.learningComplete)}${progress('함께한 수업',goal.sessions,1,goal.sessionComplete?'함께하는 수업 완료':'함께하는 수업 대기',goal.sessionComplete)}</div>
  <p class="muted small">이번 주에 등록 보충 묶음을 마치거나 AI 보충 문제를 맞힌 개념을 주당 한 번씩 세어요. 지난주에 배운 개념의 복습도 인정해요. 수업은 참여 회기만 포함해요. 도움 받은 연습도 포함하며, 숙달 판정과는 달라요.</p>
  ${goal.message?`<blockquote class="weekly-goal-message"><b>멘토의 응원</b><p>${esc(goal.message.text)}</p></blockquote>`:''}
  ${mentor?`<details class="weekly-goal-compose" ${ui.weeklyGoalError?'open':''}><summary>${goal.complete?'함께 이룬 목표에 축하 남기기':'배우는 과정에 응원 한마디 남기기'}</summary><label class="field" for="weekly-goal-message">멘티에게 전할 말 (최대 200자)<textarea id="weekly-goal-message" maxlength="200" rows="2">${esc(ui.weeklyGoalDraft??goal.message?.text??'')}</textarea></label><button class="secondary" data-action="share-goal-message">응원 저장</button>${ui.weeklyGoalError?`<p role="alert">${esc(ui.weeklyGoalError)}</p>`:''}</details>`:''}
 </section>`;
}

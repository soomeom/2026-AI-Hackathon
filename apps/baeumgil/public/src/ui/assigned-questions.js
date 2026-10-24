import {esc,questionLabelHtml} from './text.js';
export function renderAssignedQuestions(state,catalog,ui) {
 const assignments=(state.assignments??[]).filter(a=>a.learnerId===state.learnerId);
 return `<section class="card"><h3>지정한 문제</h3><p class="muted small">취소해도 지금까지의 응답과 학습 근거는 남아요. 다시 지정하면 새 학습으로 시작해요.</p><div class="assigned-list">${assignments.length?assignments.slice().reverse().map(a=>{
  const paths=(state.paths??[]).filter(p=>p.assignmentId===a.id),count=(state.attempts??[]).filter(x=>paths.some(p=>p.id===x.pathId)).length;
  const canceled=a.status==='canceled',done=paths.some(p=>p.status==='completed');
  const status=canceled?(a.startedBeforeCancel?`풀다가 취소됨 · 응답 ${count}개 기록 유지`:'풀기 전 취소됨'):done?'완료':count?'푸는 중':'풀기 전';
  return `<article class="assigned-row"><div><b>${questionLabelHtml(catalog.questions.find(q=>q.id===a.questionId),catalog)}</b><p class="meta">지정 ${esc(new Date(a.assignedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</p><span class="pill ${canceled?'neutral':done?'ok':'primary'}">${status}</span></div><button class="secondary small" data-assignment-action="${canceled?'reassign':'cancel'}" data-assignment-id="${esc(a.id)}">${canceled?'다시 지정':'지정 취소'}</button>${ui.confirmCancelAssignment===a.id?`<div class="msg assigned-confirm"><p>학생이 풀던 문제예요. 지금까지의 응답은 기록에 남아요.</p><button class="secondary" data-assignment-action="cancel" data-assignment-id="${esc(a.id)}" data-confirmed="yes">기록을 남기고 지정 취소</button><button class="ghost" data-assignment-action="keep">계속 학습</button></div>`:''}</article>`;
 }).join(''):'<p class="muted">아직 지정한 문제가 없어요.</p>'}</div></section>`;
}

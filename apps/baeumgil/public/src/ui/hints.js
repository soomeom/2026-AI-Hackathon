import {hintQuestion,hintsFor} from '../learning/hints.js';
import {esc} from './text.js';
export function renderHintPanel(state,ui,target){
 if(!state||ui.role!=='learner')return '';
 const records=hintsFor(state,target);
 return `<section class="hint-panel" aria-label="질문으로 받는 힌트"><h4>답 대신, 생각을 이어가는 질문</h4><p class="muted small">AI가 검토된 질문 중 하나를 골라요. 연결이 늦거나 검사를 통과하지 못하면 기본 힌트로 이어져요. 힌트를 보면 도움 사용으로 기록해요.</p>${records.length?`<ol>${records.map(h=>`<li><span class="pill neutral">질문 ${h.step} · ${h.source==='ai'?'AI 선택':'기본 힌트'}</span><p>${esc(hintQuestion(h.hintId))}</p></li>`).join('')}</ol>`:''}<button class="secondary" data-hint-action="ask" ${ui.hintLoading||records.length>=3?'disabled':''}>${ui.hintLoading?'질문을 고르고 있어요…':records.length>=3?'힌트 3단계를 모두 봤어요':records.length?'다음 힌트 받기':'힌트 받기'}</button>${ui.hintLoading?'<p class="muted small" role="status">최대 5초 동안 확인한 뒤 기본 힌트로 이어져요.</p>':''}</section>`;
}
export function handleHintAction(button,props){
 if(!button.dataset.hintAction)return false;
 if(props.ui.role==='learner')props.hints?.ask();
 return true;
}

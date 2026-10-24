import { gradeAnswer } from './grading.js';
export const LEVELS = {0:'기초 추가 확인 필요',1:'중1~2 기초',2:'중3~고1 선수 개념',3:'고졸 핵심 수준'};
export function validateDiagnostic(bank, config) {
  const byId=new Map(bank.map(q=>[q.id,q])); const errors=[];
  for(const d of config.domains) for(const [level,ids] of Object.entries(d.levels)) for(const id of ids){
    const q=byId.get(id);
    if(!q || q.contentStatus!=='approved' || q.role!=='diagnostic' || q.domain!==d.id || q.level!==Number(level)) errors.push(`invalidQuestion:${id}`);
    if(q?.fallback_question_id){const f=byId.get(q.fallback_question_id);if(!f || f.domain!==d.id || f.level>=q.level)errors.push(`invalidFallback:${id}`);}
    if(q && (q.choices.length!==4 || new Set(q.choices.map(c=>c.value)).size!==4 || !q.choices.some(c=>c.value===q.answer)))errors.push(`invalidAnswer:${id}`);
  }
  if(errors.length)throw new Error(errors.join('\n'));
}
export function startDiagnostic(bank,config,{previouslySeen=[]}={}){
  validateDiagnostic(bank,config);
  return {version:config.version,status:'active',domainIndex:0,currentId:config.domains[0].rootQuestionId,attempts:[],seenBefore:[...previouslySeen],completedDomains:[],transition:'고졸 핵심 문항부터 시작합니다.'};
}
export function submitDiagnostic(state,submission,bank,config){
  if(state.attempts.some(a=>a.id===submission.id))return state;
  if(state.status!=='active')throw new Error('diagnosticClosed');
  if(!submission.id)throw new Error('submissionIdRequired');
  if(state.attempts.some(a=>a.id===submission.id))return state;
  if(submission.questionId!==state.currentId)throw new Error('staleQuestion');
  const q=bank.find(q=>q.id===state.currentId);const result=gradeAnswer(q,submission);
  const next=structuredClone(state);const independent=!submission.helpUsed&&!next.seenBefore.includes(q.id);
  const prior=next.attempts.at(-1);
  const originQuestionId=q.level===3?q.id:(prior?.domain===q.domain?prior.originQuestionId:config.domains[next.domainIndex].rootQuestionId);
  next.attempts.push({id:submission.id,questionId:q.id,domain:q.domain,conceptIds:[...q.conceptIds],level:q.level,stage:({3:'high_school',2:'prerequisite_1',1:'prerequisite_2'})[q.level],originQuestionId,result,choiceId:submission.choiceId??null,independent,helpUsed:!!submission.helpUsed,submittedAt:submission.submittedAt??new Date().toISOString()});
  const domain=config.domains[next.domainIndex];const unused=id=>!next.attempts.some(a=>a.questionId===id);
  const successes=next.attempts.filter(a=>a.domain===q.domain&&a.level===q.level&&a.result==='correct'&&a.independent).length;
  let target=null;
  if(result==='correct'){
    if(successes<config.minimumIndependentCorrect)target=(q.confirmation_question_ids??domain.levels[q.level]).find(unused);
    next.transition=target?'같은 수준을 확인합니다.':'이 영역의 확인을 마쳤습니다.';
    if(target)next.transition='같은 수준의 다른 문항으로 한 번 더 확인합니다.';
  }else{
    target=q.fallback_question_id&&unused(q.fallback_question_id)?q.fallback_question_id:null;
    // Never substitute an unrelated easier concept when this explicit chain is exhausted.
    // At the lowest level, give one different foundation item before concluding insufficient evidence.
    if(!target&&q.level===1&&next.attempts.filter(a=>a.domain===q.domain&&a.level===1).length<2)target=(q.confirmation_question_ids??[]).find(unused);
    next.transition=target?'관련 선수 개념을 확인하는 문제로 이동했습니다.':'이 영역은 멘토와 추가 확인이 필요합니다.';
  }
  if(next.attempts.length>=config.maxQuestions){next.status='completed';next.stopReason='question_limit';next.currentId=null;return next;}
  if(target){next.currentId=target;return next;}
  next.completedDomains.push(domain.id);next.domainIndex++;
  if(next.domainIndex>=config.domains.length){next.status='completed';next.stopReason='all_domains';next.currentId=null;}
  else{next.currentId=config.domains[next.domainIndex].rootQuestionId;next.transition='다음 영역의 고졸 핵심 문항을 확인합니다.';}
  return next;
}
export function diagnosticReport(state,bank,config){
  const byId=new Map(bank.map(q=>[q.id,q]));
  const domains=config.domains.map(d=>{
    const attempts=state.attempts.filter(a=>a.domain===d.id);let demonstrated=0;
    for(let l=1;l<=3;l++)if(attempts.filter(a=>a.level===l&&a.result==='correct'&&a.independent).length>=config.minimumIndependentCorrect)demonstrated=l;
    const weak=[...new Set(attempts.filter(a=>a.result!=='correct').map(a=>byId.get(a.questionId).curriculum.core))];
    return {id:d.id,name:d.name,demonstrated,label:attempts.length?LEVELS[demonstrated]:'미측정',attempted:attempts.length,correct:attempts.filter(a=>a.result==='correct').length,weak,provisional:!state.completedDomains.includes(d.id)};
  });
  const measured=domains.filter(d=>d.attempted);const all=domains.every(d=>!d.provisional);const high=domains.filter(d=>d.demonstrated===3).length;
  const median=measured.length?[...measured].sort((a,b)=>a.demonstrated-b.demonstrated)[Math.floor((measured.length-1)/2)].demonstrated:0;
  const tier=!all?'진단 진행 중 · 일부 영역 미확인':high===domains.length?'고졸 핵심 수준':high>=3?'고1 기초~고졸 핵심 혼합':LEVELS[median];
  return {tier,allDomainsCompleted:all,domains,attempts:state.attempts.length,independentCount:state.attempts.filter(a=>a.independent).length,disclaimer:'선별 문항에 근거한 수업 시작점 추정입니다. 학년 전체 숙달·검정고시 합격·표준화된 진단 정확도를 보장하지 않습니다.',rule:'영역·수준별 처음 본 문항 2개를 도움 없이 맞힌 경우 확인. 전체 표시는 영역별 결과를 요약하며 미측정 영역은 제외합니다.'};
}

import { gradeAnswer } from './grading.js';
import { DIAGNOSTIC_STAGES, validRoadmapPractice } from './roadmap.js';
export const LEVELS = {0:'기초 추가 확인 필요',1:'기초 개념 확인',2:'핵심 선수 개념 확인',3:'고졸 핵심 수준'};
export function validateDiagnostic(bank, config) {
  const byId=new Map(bank.map(q=>[q.id,q])); const errors=[];
  for(const d of config.domains) for(const [level,ids] of Object.entries(d.levels)) for(const id of ids){
    const q=byId.get(id);
    if(!q || q.contentStatus!=='approved' || q.role!=='diagnostic' || q.domain!==d.id || q.level!==Number(level)) errors.push(`invalidQuestion:${id}`);
    if(q?.fallback_question_id){const f=byId.get(q.fallback_question_id);if(!f || f.domain!==d.id || f.level>=q.level)errors.push(`invalidFallback:${id}`);}
    if(q && config.version>=2){
      const lower=q.prerequisite_question_ids??[];
      if((lower[0]??null)!==q.fallback_question_id)errors.push(`fallbackMismatch:${id}`);
      if(lower.some(id=>!byId.has(id)||byId.get(id).domain!==d.id||byId.get(id).level!==q.level-1||!d.levels[q.level-1]?.includes(id)))errors.push(`invalidPrerequisite:${id}`);
      const tags=[...new Set(lower.flatMap(id=>byId.get(id)?.conceptIds??[]))].sort();
      if(JSON.stringify(tags)!==JSON.stringify([...(q.prerequisite_concept??[])].sort()))errors.push(`conceptMismatch:${id}`);
    }
    if(q && (q.choices.length!==4 || new Set(q.choices.map(c=>c.value)).size!==4 || !q.choices.some(c=>c.value===q.answer)))errors.push(`invalidAnswer:${id}`);
  }
  if(config.version>=2){
    for(const d of config.domains)if(!d.levels[3].includes(d.rootQuestionId))errors.push(`invalidRoot:${d.id}`);
    const bundleIds=new Set();
    for(const b of config.learningBundles??[]){
      if(bundleIds.has(b.id)||!b.questionIds?.length)errors.push(`invalidBundle:${b.id}`);
      bundleIds.add(b.id);
      for(const id of b.questionIds??[]){const q=byId.get(id);if(!q||q.contentStatus!=='approved'||q.domain!==b.domain||q.level!==b.level||!q.conceptIds.includes(b.conceptId))errors.push(`invalidBundleQuestion:${id}`);}
    }
    for(const d of config.domains)for(const id of Object.values(d.levels).flat())if(!config.learningBundles?.some(b=>b.questionIds.includes(id)))errors.push(`missingBundle:${id}`);
  }
  if(errors.length)throw new Error(errors.join('\n'));
}
export function startDiagnostic(bank,config,{previouslySeen=[]}={}){
  validateDiagnostic(bank,config);
  return {version:config.version,status:'active',domainIndex:0,currentId:config.domains[0].rootQuestionId,attempts:[],seenBefore:[...previouslySeen],completedDomains:[],transition:'고졸 핵심 문항부터 시작합니다.'};
}

// Restore saved answers directly: replaying them against a changed graph can destroy valid history.
export function restoreDiagnostic(stored,bank,config){
  const byId=new Map(bank.map(q=>[q.id,q]));
  if(!stored||![1,2].includes(stored.version)||!['active','completed'].includes(stored.status)||!Array.isArray(stored.attempts)||!Array.isArray(stored.seenBefore)||!stored.seenBefore.every(id=>typeof id==='string')||!Array.isArray(stored.completedDomains))throw new Error('invalidDiagnosticHistory');
  if(!Number.isInteger(stored.domainIndex)||stored.domainIndex<0||stored.domainIndex>config.domains.length)throw new Error('invalidDiagnosticPosition');
  if(stored.status==='active'&&(!byId.has(stored.currentId)||byId.get(stored.currentId).domain!==config.domains[stored.domainIndex]?.id))throw new Error('invalidDiagnosticCurrent');
  if(new Set(stored.attempts.map(a=>a.id)).size!==stored.attempts.length||new Set(stored.attempts.map(a=>a.questionId)).size!==stored.attempts.length)throw new Error('duplicateDiagnosticHistory');
  for(const a of stored.attempts){
    const q=byId.get(a.questionId);
    if(!q||q.role!=='diagnostic'||q.domain!==a.domain||q.level!==a.level||typeof a.id!=='string'||typeof a.independent!=='boolean'||typeof a.helpUsed!=='boolean'||!['correct','incorrect','abstained'].includes(a.result)||gradeAnswer(q,{choiceId:a.choiceId,abstained:a.result==='abstained'})!==a.result)throw new Error('invalidDiagnosticAnswer');
    if(a.independent&&(a.helpUsed||a.previouslySeen===true))throw new Error('contradictoryDiagnosticEvidence');
  }
  if(stored.completedDomains.some(id=>!config.domains.some(d=>d.id===id)))throw new Error('invalidDiagnosticDomain');
  const restored=structuredClone(stored);
  if(stored.roadmapPractice&&!validRoadmapPractice(stored.roadmapPractice,{diagnostic:stored,bank,config})){
    restored.roadmapPractice={attempts:[],recovery:{reason:'invalid_practice',original:structuredClone(stored.roadmapPractice)}};
  }
  return restored;
}
export function submitDiagnostic(state,submission,bank,config){
  if(state.status!=='active')throw new Error('diagnosticClosed');
  if(!submission.id)throw new Error('submissionIdRequired');
  if(state.attempts.some(a=>a.id===submission.id))return state;
  if(submission.questionId!==state.currentId)throw new Error('staleQuestion');
  const q=bank.find(q=>q.id===state.currentId);const result=gradeAnswer(q,submission);
  const next=structuredClone(state);const independent=!submission.helpUsed&&!next.seenBefore.includes(q.id);
  const rootQuestionId=q.level===3?q.id:[...next.attempts].reverse().find(a=>a.domain===q.domain&&a.level===3)?.questionId??null;
  next.attempts.push({id:submission.id,questionId:q.id,domain:q.domain,level:q.level,result,choiceId:submission.choiceId??null,independent,helpUsed:!!submission.helpUsed,
    conceptTags:[...q.conceptIds],conceptName:q.curriculum.core,stage:DIAGNOSTIC_STAGES[q.level],rootQuestionId,
    correct:result==='correct',previouslySeen:next.seenBefore.includes(q.id),answeredAt:submission.answeredAt??new Date().toISOString()});
  const domain=config.domains[next.domainIndex];const unused=id=>!next.attempts.some(a=>a.questionId===id);
  let target=null;
  // Depth-first traversal of explicit prerequisites, then the next original concept.
  // No arbitrary same-domain fallback: a neighbouring easy item cannot diagnose this error.
  const byId=new Map(bank.map(q=>[q.id,q]));
  for(const a of [...next.attempts].reverse().filter(a=>a.domain===domain.id&&a.result!=='correct')){
    const failed=byId.get(a.questionId);
    const linked=failed?.prerequisite_question_ids??(failed?.fallback_question_id?[failed.fallback_question_id]:[]);
    target=linked.find(unused)??null;
    if(target)break;
  }
  next.transition=target?'직접 연결된 선수 개념을 확인합니다.':'다음 고졸 개념을 확인합니다.';
  target??=domain.levels[3].find(unused)??null;
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
    // 맞혔지만 도움·재노출이라 독립 근거가 안 된 경우는 '낮은 수준'이 아니라 '판단 보류'로 구분한다
    const evidence=demonstrated>0?'demonstrated':attempts.some(a=>a.result==='correct')?'insufficient':'not_demonstrated';
    const label=!attempts.length?'미측정':evidence==='insufficient'?'판단 보류 · 도움 없이 푼 응답 부족':LEVELS[demonstrated];
    return {id:d.id,name:d.name,demonstrated,evidence,label,attempted:attempts.length,correct:attempts.filter(a=>a.result==='correct').length,independentCorrect:attempts.filter(a=>a.result==='correct'&&a.independent).length,weak,provisional:!state.completedDomains.includes(d.id)};
  });
  const measured=domains.filter(d=>d.attempted);const decided=measured.filter(d=>d.evidence!=='insufficient');const insufficient=measured.length-decided.length;
  const all=domains.every(d=>!d.provisional);const high=domains.filter(d=>d.demonstrated===3).length;
  const median=decided.length?[...decided].sort((a,b)=>a.demonstrated-b.demonstrated)[Math.floor((decided.length-1)/2)].demonstrated:0;
  let tier=!all?'진단 진행 중 · 일부 영역 미확인':!decided.length&&measured.length?'판단 보류 · 도움 없이 푼 응답이 부족해요':high===domains.length?'고졸 핵심 수준':high>=3?'고1 기초~고졸 핵심 혼합':LEVELS[median];
  if(all&&decided.length&&insufficient)tier+=` · 판단 보류 ${insufficient}영역`;
  return {tier,allDomainsCompleted:all,domains,insufficientDomains:insufficient,attempts:state.attempts.length,independentCount:state.attempts.filter(a=>a.independent).length,disclaimer:'선별 문항에 근거한 수업 시작점 추정입니다. 학년 전체 숙달·검정고시 합격·표준화된 진단 정확도를 보장하지 않습니다.',rule:'초기 운영 규칙(학생 데이터로 보정 전): 영역·수준별 처음 본 문항 2개를 도움 없이 맞힌 경우 그 수준을 확인. 도움·재노출로만 맞힌 영역은 판단 보류로 따로 표시하고 전체 수준 계산에서 뺍니다.'};
}

import {gradeAnswer} from './grading.js';
export const STEP_NAMES={1:'기초 다지기',2:'핵심 선수 개념 연결',3:'고졸 기출 재도전'};
export function buildRoadmap(state,bank,config){
 const byId=new Map(bank.map(q=>[q.id,q]));
 return config.domains.map(d=>{
  const logs=state.attempts.filter(a=>a.domain===d.id);const groups=new Map();const passed=new Map();
  for(const a of logs){const q=byId.get(a.questionId);if(!q)continue;
   if(a.result==='correct'&&q.level===3&&a.independent)passed.set(q.id,{questionId:q.id,name:q.curriculum.core,status:'passed',label:'진단 통과 · 해당 문항 기준'});
   if(a.result==='correct')continue;
   const key=q.conceptIds.join('|');let node=groups.get(key);
   if(!node){const step=q.level;const ids=bank.filter(x=>x.contentStatus==='approved'&&x.role==='diagnostic'&&x.domain===d.id&&x.conceptIds.some(c=>q.conceptIds.includes(c))).map(x=>x.id);
    node={id:`${d.id}:${key}`,domain:d.id,conceptIds:[...q.conceptIds],name:q.curriculum.core,step,stepName:STEP_NAMES[step],questionIds:ids,evidenceIds:[],originQuestionIds:[],status:'todo'};groups.set(key,node);}
   node.evidenceIds.push(a.id);if(a.originQuestionId&&!node.originQuestionIds.includes(a.originQuestionId))node.originQuestionIds.push(a.originQuestionId);
  }
  const nodes=[...groups.values()].sort((a,b)=>a.step-b.step||a.name.localeCompare(b.name,'ko'));
  for(const n of nodes){const successful=new Set((state.practiceAttempts??[]).filter(a=>a.nodeId===n.id&&a.result==='correct').map(a=>a.questionId));n.status=n.questionIds.every(id=>successful.has(id))?'practiced':'todo';n.completedQuestions=successful.size;}
  // Prerequisite ordering is local to an area, not a global lock across unrelated areas.
  for(const n of nodes)n.locked=nodes.some(other=>other.step<n.step&&other.status!=='practiced');
  return {id:d.id,name:d.name,nodes,passed:[...passed.values()],measured:logs.length>0,complete:state.completedDomains.includes(d.id),startNodeId:nodes.find(n=>n.status!=='practiced'&&!n.locked)?.id??null};
 });
}
export function submitRoadmapPractice(state,{id,nodeId,questionId,choiceId=null,abstained=false,submittedAt},bank,config){
 if(!id)throw new Error('submissionIdRequired');
 if((state.practiceAttempts??[]).some(a=>a.id===id))return state;
 if(state.status!=='completed')throw new Error('diagnosticNotFinished');
 const node=buildRoadmap(state,bank,config).flatMap(d=>d.nodes).find(n=>n.id===nodeId);
 if(!node||!node.questionIds.includes(questionId))throw new Error('questionNotInRoadmap');
 if(node.locked)throw new Error('prerequisiteNotPracticed');
 const q=bank.find(q=>q.id===questionId);const result=gradeAnswer(q,{choiceId,abstained});
 const next=structuredClone(state);next.practiceAttempts??=[];next.practiceAttempts.push({id,nodeId,questionId,conceptIds:[...q.conceptIds],domain:q.domain,result,choiceId,submittedAt:submittedAt??new Date().toISOString(),purpose:'remedial_practice'});return next;
}

import { initialAssessmentSummary } from './initial-assessment.js';
import { roadmapCards } from './roadmap.js';

const DAY=86400000, KST=9*3600000;
const dateKey=ms=>new Date(ms+KST).toISOString().slice(0,10);
const resultOK=a=>['correct','incorrect','abstained'].includes(a.result);

// 저장본을 수정하지 않는다. 노출·생성·접속은 학습 응답으로 세지 않는다.
export function buildGuardianSummary(state,catalog,{now=new Date().toISOString()}={}) {
 const today=Date.parse(now),learnerId=state.learnerId;
 const questions=new Map((catalog.questions??[]).map(q=>[q.id,q]));
 const pathItems=new Map((state.paths??[]).filter(p=>p.learnerId===learnerId).flatMap(p=>[...(p.pastItems??[]),...(p.items??[])].map(item=>[`${p.id}:${item.id}`,item])));
 const names=new Map((catalog.concepts??[]).map(c=>[c.id,c.name]));
 for(const bundle of catalog.diagnostic?.learningBundles??[])names.set(bundle.conceptId,bundle.title);
 const events=[],seen=new Set();
 const add=(a,{source,parent='',concepts,independent=false,index=0})=>{
  if(!resultOK(a))return;
  const id=`${source}:${parent}:${a.id??index}`;if(seen.has(id))return;seen.add(id);
  const time=Date.parse(a.answeredAt??a.submittedAt);
  if(Number.isFinite(time)&&time>today)return;
  events.push({id,source,time,concepts:concepts??a.conceptTags??pathItems.get(`${a.pathId}:${a.itemId}`)?.conceptIds??questions.get(a.questionId??a.sourceQuestionId)?.conceptIds??[],result:a.result,independent});
 };
 for(const [index,a] of (state.attempts??[]).entries())if(a.learnerId===learnerId)add(a,{index,source:'lesson',
  independent:a.result==='correct'&&a.helpUsed===false&&a.noveltyAtPresentation==='first_seen'&&['original_attempt','transfer_check'].includes(a.stage)});
 const records=(state.initialAssessments??[]).filter(a=>a.learnerId===learnerId);
 for(const record of records){
  for(const [index,a] of (record.diagnostic?.attempts??[]).entries())add(a,{index,source:'diagnostic',parent:record.id,independent:a.result==='correct'&&a.independent===true});
  for(const [index,a] of (record.roadmapPractice?.attempts??[]).entries())add(a,{index,source:'review',parent:record.id});
 }
 for(const record of (state.generatedPractice??[]).filter(r=>r.learnerId===learnerId))for(const [index,a] of (record.attempts??[]).entries())
  add(a,{index,source:'ai',parent:record.id,concepts:[record.spec?.conceptId].filter(Boolean)});
 const activity=Array.from({length:7},(_,i)=>({date:dateKey(today-(6-i)*DAY),count:0,diagnostic:0,lesson:0,review:0,ai:0}));
 const days=new Map(activity.map(d=>[d.date,d]));
 for(const e of events)if(Number.isFinite(e.time)){
  const day=days.get(dateKey(e.time));if(day){day.count++;day[e.source]++;}
 }
 const concepts=new Map();
 // 날짜 없는 과거 기록을 먼저, 날짜가 있는 근거는 시간순으로 본다. 최근 오답을 과거 정답으로 가리지 않는다.
 for(const e of [...events].sort((a,b)=>(Number.isFinite(a.time)?a.time:-Infinity)-(Number.isFinite(b.time)?b.time:-Infinity)))
  for(const id of e.concepts)concepts.set(id,{id,title:names.get(id)??questions.get(id)?.curriculum?.core??id,
   status:e.result!=='correct'?'needs_support':e.independent?'independent':'review_success',source:e.source});
 const latest=records.filter(r=>r.version===2).at(-1);
 const assessment=catalog.diagnostic?initialAssessmentSummary(state,learnerId,{catalog}):null;
 const cards=assessment?.roadmap?roadmapCards(assessment.roadmap):[];
 const remaining=cards.filter(c=>['needs_learning','needs_recheck'].includes(c.status)&&!c.practiceComplete);
 const chain=[];let next=remaining.find(c=>c.id===assessment?.roadmap?.nextCardId);
 while(next&&chain.length<3){
  chain.push(next);
  next=remaining.filter(c=>c.step>next.step&&c.dependsOn.includes(next.id)).sort((a,b)=>a.step-b.step)[0];
 }
 const nextSteps=chain.map(c=>({id:c.id,title:c.title,step:c.step,reason:c.reason}));
 const sharedMessage=(state.guardianMessages??[]).filter(m=>m.learnerId===learnerId&&typeof m.text==='string'&&m.text.trim()&&Number.isFinite(Date.parse(m.sharedAt))&&Date.parse(m.sharedAt)<=today).at(-1)??null;
 return {activity,activeDays:activity.filter(d=>d.count>0).length,totalResponses:activity.reduce((n,d)=>n+d.count,0),
  undatedResponses:events.filter(e=>!Number.isFinite(e.time)).length,
  lastActivity:events.filter(e=>Number.isFinite(e.time)).sort((a,b)=>b.time-a.time)[0]?.time??null,
  concepts:[...concepts.values()],nextSteps,assessmentStatus:latest?.status??'not_started',sharedMessage:sharedMessage?{text:sharedMessage.text,sharedAt:sharedMessage.sharedAt}:null};
}

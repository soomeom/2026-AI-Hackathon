import { validateLinearPractice, VALIDATOR_VERSION } from './linear-practice.js';
import {hintsFor} from './hints.js';
import { buildRoadmap, roadmapCards } from './roadmap.js';
import { gradeAnswer } from './grading.js';
const fail=code=>{throw new Error(code);};
const time=t=>typeof t==='string'&&!Number.isNaN(Date.parse(t));
const identity=s=>typeof s==='string'&&s.trim().length>0&&s.length<=200;
const changed=(state,patch)=>({...state,...patch,revision:state.revision+1});
const find=(state,id)=>(state.generatedPractice??[]).find(r=>r.id===id&&r.learnerId===state.learnerId)??fail('ai_practice_missing');
const replace=(s,r)=>changed(s,{generatedPractice:s.generatedPractice.map(v=>v.id===r.id?r:v)});
export function practiceCard(state,{assessmentId,cardId,baseQuestionId},{catalog}) {
 const a=state.initialAssessments?.find(a=>a.id===assessmentId&&a.learnerId===state.learnerId&&a.version===2&&a.status==='completed');
 if(!a)fail('invalid_practice_assessment');
 const card=roadmapCards(buildRoadmap(a.diagnostic,catalog.questions,catalog.diagnostic,a.roadmapPractice)).find(c=>c.id===cardId);
 if(!card||!card.questionIds.includes(baseQuestionId))fail('invalid_practice_card');
 return {assessment:a,card};
}
function validRecord(r,state) {
 try {
  if(!r||![r.id,r.learnerId,r.assessmentId,r.cardId,r.baseQuestionId,r.requestId].every(identity)||!Number.isSafeInteger(r.inputRevision)||r.inputRevision<0||r.validatorVersion!==VALIDATOR_VERSION||!time(r.generatedAt)||!['ready','answered'].includes(r.status))return false;
  if(!state.learners?.some(l=>l.id===r.learnerId)||!state.initialAssessments?.some(a=>a.id===r.assessmentId&&a.learnerId===r.learnerId&&a.version===2&&['active','completed'].includes(a.status)))return false;
  const v=validateLinearPractice(r.spec);
  if(!v.ok||r.fingerprint!==v.fingerprint||JSON.stringify(r.question)!==JSON.stringify(v.question)||!r.cardId.endsWith(`:${r.spec.conceptId}`)||![r.spec.conceptId,`${r.spec.conceptId}-practice`].includes(r.baseQuestionId))return false;
  if(r.presentedAt!==null&&!time(r.presentedAt)||!Array.isArray(r.attempts)||r.attempts.length>1||!Array.isArray(r.evidence)||r.evidence.length>3)return false;
  if(!r.evidence.every(e=>e&&[r.spec.conceptId,`${r.spec.conceptId}-practice`].includes(e.questionId)&&['correct','incorrect','abstained'].includes(e.result)&&typeof e.helpUsed==='boolean'&&(e.result==='abstained'?e.choiceId===null:['a','b','c','d'].includes(e.choiceId))))return false;
  if(r.draftChoiceId!=null&&!r.question.choices.some(c=>c.id===r.draftChoiceId))return false;
  if((r.status==='answered')!==(r.attempts.length===1)||r.status==='answered'&&!r.presentedAt)return false;
  return r.attempts.every(a=>identity(a.id)&&time(a.answeredAt)&&typeof a.abstained==='boolean'&&typeof a.helpUsed==='boolean'&&a.evidence==='ai_review_practice'&&(!a.abstained||a.choiceId===null)&&gradeAnswer(v.question,a)===a.result);
 }catch{return false;}
}
export function validAIState(state) {
 const list=state.generatedPractice??[];
 return Array.isArray(list)&&new Set(list.map(r=>r?.id)).size===list.length&&list.every(r=>validRecord(r,state))&&(state.activeGeneratedPracticeId==null||list.some(r=>r.id===state.activeGeneratedPracticeId&&r.learnerId===state.learnerId));
}
export function restoreAIState(state) {
 if(!state||typeof state!=='object'||Array.isArray(state))return state;
  if(validAIState(state)&&(state.generatedPracticeRecovery===undefined||Array.isArray(state.generatedPracticeRecovery)))return state;
 const recovery=Array.isArray(state.generatedPracticeRecovery)?[...state.generatedPracticeRecovery]:state.generatedPracticeRecovery===undefined?[]:[{field:'generatedPracticeRecovery',raw:state.generatedPracticeRecovery}];
 const records=[],ids=new Set();
 if(state.generatedPractice!==undefined&&!Array.isArray(state.generatedPractice))recovery.push({field:'generatedPractice',raw:state.generatedPractice});
 for(const r of Array.isArray(state.generatedPractice)?state.generatedPractice:[]) {
  if(validRecord(r,state)&&!ids.has(r.id)){records.push(r);ids.add(r.id);}else recovery.push({field:'generatedPractice',raw:r});
 }
 const active=state.activeGeneratedPracticeId;
 const validActive=active==null||records.some(r=>r.id===active&&r.learnerId===state.learnerId);
 if(!validActive)recovery.push({field:'activeGeneratedPracticeId',raw:active});
 // 격리된 문제에 연결된 힌트도 원문을 보존한다. 관계없는 손상은 기존 검증에 맡긴다.
 const removedIds=new Set((Array.isArray(state.generatedPractice)?state.generatedPractice:[])
  .filter(r=>r&&typeof r.id==='string'&&!ids.has(r.id)).map(r=>r.id));
 const hints=Array.isArray(state.hintUsage)?state.hintUsage.filter(h=>{
  if(h?.target?.kind!=='generated'||!removedIds.has(h.target.practiceId))return true;
  recovery.push({field:'hintUsage',raw:h});return false;
 }):state.hintUsage;
 return {...state,generatedPractice:records,activeGeneratedPracticeId:validActive?active??null:null,
  ...(state.hintUsage===undefined?{}:{hintUsage:hints}),generatedPracticeRecovery:recovery};
}
export function acceptAIPractice(state,{record},{catalog}) {
 practiceCard(state,record,{catalog});
 if(record.learnerId!==state.learnerId||!validRecord(record,state)||record.status!=='ready'||record.presentedAt!==null||record.attempts.length)fail('invalid_ai_record');
 if((state.generatedPractice??[]).some(r=>r.id===record.id||r.learnerId===record.learnerId&&r.fingerprint===record.fingerprint))fail('duplicate_ai_practice');
 return changed(state,{generatedPractice:[...(state.generatedPractice??[]),record]});
}
export function presentAIPractice(state,{id,at}) {
 const r=find(state,id);if(!time(at))fail('invalid_time');
 const exposure={id:`ai:${id}`,learnerId:r.learnerId,pathId:null,itemId:r.question.id,sourceQuestionId:r.baseQuestionId,stage:'ai_review_practice',fingerprint:r.fingerprint,noveltyAtPresentation:'review_practice',presentedAt:at};
 return changed(state,{activeGeneratedPracticeId:id,generatedPractice:state.generatedPractice.map(v=>v.id===id?{...v,presentedAt:v.presentedAt??at}:v),exposures:r.presentedAt?state.exposures:[...state.exposures,exposure]});
}
export function selectAIPractice(state,{id,choiceId}) {
 const r=find(state,id);if(state.activeGeneratedPracticeId!==id||r.status!=='ready'||!r.presentedAt||!r.question.choices.some(c=>c.id===choiceId))fail('invalid_ai_choice');
 return replace(state,{...r,draftChoiceId:choiceId});
}
export function submitAIPractice(state,{id,submissionId,choiceId=null,abstained=false,helpUsed=false,at},{catalog}) {
 const r=find(state,id);practiceCard(state,r,{catalog});
 if(!identity(submissionId)||!time(at)||typeof abstained!=='boolean'||typeof helpUsed!=='boolean'||abstained&&choiceId!==null)fail('invalid_ai_answer');
 if(state.activeGeneratedPracticeId!==id||!r.presentedAt)fail('ai_not_presented');
 helpUsed=helpUsed||hintsFor(state,{kind:'generated',practiceId:id}).length>0;
 if(r.attempts.length){const a=r.attempts[0];if(a.id===submissionId&&a.choiceId===choiceId&&a.abstained===abstained&&a.helpUsed===helpUsed)return state;fail('ai_already_answered');}
 const answer={id:submissionId,choiceId,abstained,helpUsed,answeredAt:at,result:gradeAnswer(r.question,{choiceId,abstained}),evidence:'ai_review_practice'};
 return replace(state,{...r,status:'answered',draftChoiceId:choiceId,attempts:[answer]});
}
export function closeAIPractice(state) {return state.activeGeneratedPracticeId==null?state:changed(state,{activeGeneratedPracticeId:null});}
export function aiPracticeSummary(state,{assessmentId,cardId}={}) {
 const records=(state.generatedPractice??[]).filter(r=>r.learnerId===state.learnerId&&(!assessmentId||r.assessmentId===assessmentId)&&(!cardId||r.cardId===cardId));
 const attempts=records.flatMap(r=>r.attempts);
 return {records,readyRecord:records.find(r=>r.id===state.activeGeneratedPracticeId)??records.find(r=>r.status==='ready')??records.at(-1),attempted:attempts.length,correct:attempts.filter(a=>a.result==='correct').length};
}

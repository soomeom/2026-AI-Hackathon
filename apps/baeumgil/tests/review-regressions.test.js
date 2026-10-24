import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,createStore} from '../public/src/state/store.js';
import {gradeAnswer} from '../public/src/learning/grading.js';
import {acceptAIPractice,presentAIPractice,restoreAIState} from '../public/src/learning/ai-practice.js';
import {recordHint,hintCandidates} from '../public/src/learning/hints.js';
import {loadState,STORAGE_KEY} from '../public/src/state/persistence.js';
import {catalog} from './practice-fixtures.js';
import {setupAI,recordFor,at} from './practice-state-fixtures.js';

for(const stage of ['concept_check','similar_practice','transfer_check'])test(`reentering ${stage} accepts a fresh submission and retains old attempts`,()=>{
 const store=createStore({initialState:createDemoState(),catalog}),pathId=store.assignQuestion({questionId:'q-eq-1'});
 const override=()=>store.dispatch({type:'MENTOR_OVERRIDE',pathId,mentorId:store.getState().mentorId,targetStage:stage,reason:'다시 확인'});
 const answer=()=>{const item=store.getState().paths[0].items[0];assert.ok(item);store.dispatch({type:'PRESENT_QUESTION',pathId,itemId:item.id});store.dispatch({type:'SUBMIT_ANSWER',pathId,itemId:item.id,submissionId:`${item.id}:submit`,abstained:true});return item.id;};
 override();const firstId=answer(),old=structuredClone(store.getState().attempts);
 override();const secondId=answer();
 assert.notEqual(secondId,firstId);assert.deepEqual(store.getState().attempts.slice(0,old.length),old);assert.equal(store.getState().attempts.length,2);
 const before=store.getState();store.dispatch({type:'SUBMIT_ANSWER',pathId,itemId:secondId,submissionId:`${secondId}:submit`,abstained:true});assert.equal(store.getState(),before);
});

test('legacy stage IDs survive reload and the next stage entry accepts a new answer',()=>{
 const store=createStore({initialState:createDemoState(),catalog}),pathId=store.assignQuestion({questionId:'q-eq-1'});
 store.dispatch({type:'MENTOR_OVERRIDE',pathId,mentorId:store.getState().mentorId,targetStage:'concept_check',reason:'확인'});
 const legacy=structuredClone(store.getState());
 legacy.paths[0].items.forEach((item,i)=>{item.id=`${pathId}:concept_check:${i+1}`;});
 const first=createStore({initialState:legacy,catalog}),itemId=legacy.paths[0].items[0].id;
 first.dispatch({type:'PRESENT_QUESTION',pathId,itemId});first.dispatch({type:'SUBMIT_ANSWER',pathId,itemId,submissionId:`${itemId}:submit`,abstained:true});
 const raw=JSON.stringify(first.getState()),loaded=loadState({getItem:()=>raw});assert.equal(loaded.status,'ready');
 const old=structuredClone(loaded.state),fresh=createStore({initialState:loaded.state,catalog});
 fresh.dispatch({type:'MENTOR_OVERRIDE',pathId,mentorId:old.mentorId,targetStage:'concept_check',reason:'복원 후 다시 확인'});
 const newId=fresh.getState().paths[0].items[0].id;
 fresh.dispatch({type:'PRESENT_QUESTION',pathId,itemId:newId});fresh.dispatch({type:'SUBMIT_ANSWER',pathId,itemId:newId,submissionId:`${newId}:submit`,abstained:true});
 assert.notEqual(newId,itemId);assert.equal(fresh.getState().attempts.length,2);assert.deepEqual(fresh.getState().attempts[0],old.attempts[0]);
 assert.equal(loadState({getItem:()=>JSON.stringify(fresh.getState())}).status,'ready');
});

for(const practiced of [false,true])test(`resumed diagnosis counts prior formal exposure correctly (practiced=${practiced})`,()=>{
 const store=createStore({initialState:createDemoState(),catalog});store.startInitialAssessment();
 const first=store.getState().initialAssessments[0],assessmentId=first.id;
 const correct=id=>{const q=catalog.questions.find(q=>q.id===id);return q.choices.find(c=>gradeAnswer(q,{choiceId:c.id})==='correct').id;};
 const submit=questionId=>{store.presentInitialQuestion({assessmentId,questionId});store.submitInitialAnswer({assessmentId,questionId,choiceId:correct(questionId)});};
 submit(first.diagnostic.currentId);
 const questionId=store.getState().initialAssessments[0].diagnostic.currentId;
 store.presentInitialQuestion({assessmentId,questionId});store.pauseInitialAssessment({assessmentId});
 const history=structuredClone(store.getState().initialAssessments[0].diagnostic.attempts);
 if(practiced){const pathId=store.assignQuestion({questionId}),item=store.getState().paths[0].items[0];store.dispatch({type:'PRESENT_QUESTION',pathId,itemId:item.id});store.dispatch({type:'USE_HELP',pathId,itemId:item.id,helpType:'solution'});}
 store.resumeInitialAssessment({assessmentId});submit(questionId);
 const attempts=store.getState().initialAssessments[0].diagnostic.attempts;
 assert.deepEqual(attempts.slice(0,history.length),history);assert.equal(attempts.at(-1).previouslySeen,practiced);assert.equal(attempts.at(-1).independent,!practiced);
});

test('quarantine isolates dependent AI hints without blocking original history or valid AI hints',()=>{
 let state=setupAI().getState();const original=structuredClone(state);
 for(const [id,concept] of [['broken','roadmap-linear-sum'],['good','roadmap-like-terms']]){
  const record=recordFor(state,concept,id);state=presentAIPractice(acceptAIPractice(state,{record},{catalog}),{id,at});
  state=recordHint(state,{target:{kind:'generated',practiceId:id},step:1,hintId:hintCandidates(record.question,1)[0].id,source:'fallback',at},{catalog});
 }
 state.generatedPractice[0].validatorVersion='obsolete';state.activeGeneratedPracticeId='broken';
 const raw=JSON.stringify(state),loaded=loadState({getItem:key=>key===STORAGE_KEY?raw:null});
 assert.equal(loaded.status,'ready');const restored=loaded.state;
 assert.deepEqual(restored.initialAssessments,original.initialAssessments);assert.deepEqual(restored.attempts,original.attempts);assert.deepEqual(restored.logs,original.logs);
 assert.deepEqual(restored.hintUsage,[state.hintUsage[1]]);assert.equal(restored.activeGeneratedPracticeId,null);
 assert.deepEqual(restored.generatedPracticeRecovery.find(r=>r.field==='hintUsage').raw,state.hintUsage[0]);
 assert.deepEqual(restoreAIState(restored),restored);
 const roundTrip=loadState({getItem:()=>JSON.stringify(restored)});assert.equal(roundTrip.status,'ready');assert.deepEqual(roundTrip.state,restored);
});

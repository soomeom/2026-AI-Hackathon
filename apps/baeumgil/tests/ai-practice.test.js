import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, createStore } from '../public/src/state/store.js';
import { acceptAIPractice, presentAIPractice, submitAIPractice, selectAIPractice, restoreAIState } from '../public/src/learning/ai-practice.js';
import { validateLinearPractice } from '../public/src/learning/linear-practice.js';
import {catalog,sample} from './practice-fixtures.js';
import { loadState, saveState, STORAGE_KEY } from '../public/src/state/persistence.js';
import { resumeInitialAssessment } from '../public/src/learning/initial-assessment.js';
import { validateState } from '../public/src/domain/contracts.js';
import {setupAI,recordFor,at} from './practice-state-fixtures.js';
test('AI practice presentation/draft/answer are separate from diagnosis, paths and logs and idempotent',()=>{
 const store=setupAI(),before=structuredClone(store.getState());let state=acceptAIPractice(before,{record:recordFor(before)},{catalog});
 assert.throws(()=>submitAIPractice(state,{id:'ai-1',submissionId:'s',choiceId:'option-1',at},{catalog}));
 state=presentAIPractice(state,{id:'ai-1',at});state=selectAIPractice(state,{id:'ai-1',choiceId:'option-1'});
 state=submitAIPractice(state,{id:'ai-1',submissionId:'s',choiceId:'option-1',at},{catalog});
 assert.equal(state.generatedPractice[0].attempts[0].result,'correct');
 assert.equal(submitAIPractice(state,{id:'ai-1',submissionId:'s',choiceId:'option-1',at},{catalog}),state);
 assert.throws(()=>submitAIPractice(state,{id:'ai-1',submissionId:'other',choiceId:'option-2',at},{catalog}));
 for(const key of ['initialAssessments','paths','attempts','logs'])assert.deepEqual(state[key],before[key]);
 assert.equal(state.exposures.at(-1).stage,'ai_review_practice');
 assert.throws(()=>acceptAIPractice(before,{record:{...recordFor(before),learnerId:'other'}},{catalog}));
});
test('old saves and corrupted AI records preserve original history and raw recovery',()=>{
 const original=setupAI().getState();let state=presentAIPractice(acceptAIPractice(original,{record:recordFor(original)},{catalog}),{id:'ai-1',at});
 state=selectAIPractice(state,{id:'ai-1',choiceId:'option-2'});
 const memory=new Map([[STORAGE_KEY,JSON.stringify(state)]]),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 const good=loadState(storage);assert.equal(good.status,'ready');assert.equal(good.state.generatedPractice[0].draftChoiceId,'option-2');
 state.generatedPractice.push({...state.generatedPractice[0],id:'broken',spec:{}});memory.set(STORAGE_KEY,JSON.stringify(state));
 const loaded=loadState(storage);assert.equal(loaded.status,'ready');assert.equal(loaded.state.generatedPractice.length,1);assert.equal(loaded.state.generatedPracticeRecovery.length,1);assert.deepEqual(loaded.state.initialAssessments,original.initialAssessments);
 memory.set(STORAGE_KEY,JSON.stringify({...original,generatedPractice:{broken:true},activeGeneratedPracticeId:'bad'}));
 const damaged=loadState(storage);assert.equal(damaged.status,'ready');assert.deepEqual(damaged.state.generatedPractice,[]);assert.equal(damaged.state.activeGeneratedPracticeId,null);
 memory.set(STORAGE_KEY,JSON.stringify({...original,revision:original.revision+1}));assert.equal(saveState(storage,{...loaded.state,revision:original.revision+2},original.revision).reason,'conflict');
 assert.deepEqual(restoreAIState(original).initialAssessments,original.initialAssessments);
});
test('malformed evidence in a saved AI record is isolated before mentor rendering',()=>{
 const state=setupAI().getState(),r=recordFor(state);r.evidence=[null];
 const restored=restoreAIState({...state,generatedPractice:[r],activeGeneratedPracticeId:r.id});
 assert.equal(restored.generatedPractice.length,0);assert.equal(restored.activeGeneratedPracticeId,null);assert.deepEqual(restored.initialAssessments,state.initialAssessments);
});
test('resuming a paused diagnosis preserves historical AI practice and allows saving answers',()=>{
 const store=createStore({initialState:createDemoState(),catalog});store.startInitialAssessment();
 for(let i=0;i<3;i++){const a=store.getState().initialAssessments[0];store.presentInitialQuestion({assessmentId:a.id,questionId:a.diagnostic.currentId});store.submitInitialAnswer({assessmentId:a.id,questionId:a.diagnostic.currentId,abstained:true});}
 store.pauseInitialAssessment({assessmentId:store.getState().initialAssessments[0].id});
 const before=store.getState(),state=acceptAIPractice(before,{record:recordFor(before)},{catalog});
 const resumed=resumeInitialAssessment(state,{assessmentId:before.initialAssessments[0].id,at});
 assert.equal(validateState(resumed).ok,true);assert.deepEqual(restoreAIState(resumed).generatedPractice,state.generatedPractice);
});

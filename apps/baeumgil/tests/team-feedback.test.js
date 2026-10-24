import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore,createDemoState} from '../public/src/state/store.js';
import {makeCatalog} from './fixtures.js';
import {setupAI} from './practice-state-fixtures.js';
import {catalog} from './practice-fixtures.js';
import {renderRoadmapPage} from '../public/src/ui/roadmap-page.js';
import {saveState,loadState} from '../public/src/state/persistence.js';
import {activeLearnerPath} from '../public/src/ui/learner.js';

test('cancel an unstarted assignment, exclude it from learner paths and reject stale learning commands',()=>{
 const store=createStore({initialState:createDemoState(),catalog:makeCatalog()});
 const pathId=store.assignQuestion({questionId:'q-eq-1'}),path=store.getState().paths.find(p=>p.id===pathId);
 store.cancelAssignment({assignmentId:path.assignmentId});
 const state=store.getState(),assignment=state.assignments.find(a=>a.id===path.assignmentId);
 assert.equal(assignment.status,'canceled');assert.equal(assignment.startedBeforeCancel,false);
 assert.equal(activeLearnerPath(state,{learnerPathId:pathId}),undefined);
 assert.equal(store.dispatch({type:'PRESENT_QUESTION',pathId,itemId:path.items[0].id})[0].reason,'assignmentCanceled');
 assert.equal(store.dispatch({type:'START_PATH',pathId:'restart-canceled',assignmentId:path.assignmentId,learnerId:state.learnerId})[0].reason,'assignmentCanceled');
 const again=store.getState();store.cancelAssignment({assignmentId:path.assignmentId});assert.equal(store.getState(),again);
});

test('cancel mid-study retains answers/evidence, stops time, persists and reassigns a fresh path',()=>{
 let now='2026-10-24T10:00:00Z';const store=createStore({initialState:createDemoState(),catalog:makeCatalog(),now:()=>now});
 const pathId=store.assignQuestion({questionId:'q-eq-1'}),path=store.getState().paths.find(p=>p.id===pathId),item=path.items[0];
 store.dispatch({type:'PRESENT_QUESTION',pathId,itemId:item.id});store.dispatch({type:'SET_VISIBILITY',pathId,visible:true});
 store.dispatch({type:'SUBMIT_ANSWER',pathId,itemId:item.id,submissionId:'one',choiceId:'c'});
 const original=structuredClone(store.getState());now='2026-10-24T10:01:00Z';store.cancelAssignment({assignmentId:path.assignmentId});
 const state=store.getState();assert.equal(state.assignments.find(a=>a.id===path.assignmentId).startedBeforeCancel,true);
 assert.deepEqual(state.attempts,original.attempts);assert.deepEqual(state.evidence,original.evidence);assert.equal(state.paths.find(p=>p.id===pathId).visible,false);
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 assert.equal(saveState(storage,state,0).ok,true);assert.equal(loadState(storage).state.assignments.find(a=>a.id===path.assignmentId).status,'canceled');
 const fresh=store.assignQuestion({questionId:'q-eq-1'});assert.notEqual(fresh,pathId);assert.equal(activeLearnerPath(store.getState(),{learnerPathId:pathId}).id,fresh);
});

test('mentor roadmap previews answers without producing student responses, including when student practice is open',()=>{
 const store=setupAI(),state=store.getState(),before=JSON.stringify(state);let opens=0;
 const ui={role:'mentor',mapView:'map'},root={innerHTML:'',querySelector:()=>null};
 renderRoadmapPage({root,state,catalog,ui,rerender(){},getState:()=>state,practice:{open(){opens++;}},update(){throw Error('must not write');}});
 assert.match(root.innerHTML,/문제·정답·해설 보기/);assert.doesNotMatch(root.innerHTML,/data-roadmap-action="open"/);
 assert.match(root.innerHTML,/정답/);assert.match(root.innerHTML,/해설/);
 root.onclick({target:{closest:()=>({dataset:{roadmapAction:'open',roadmapCard:'x',roadmapQuestion:'y'}})}});
 assert.equal(opens,0);assert.equal(JSON.stringify(state),before);
});

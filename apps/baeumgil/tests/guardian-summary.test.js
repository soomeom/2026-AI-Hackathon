import test from 'node:test';
import assert from 'node:assert/strict';
import * as guardian from '../public/src/learning/guardian-summary.js';
import {setupAI} from './practice-state-fixtures.js';
import {catalog as fullCatalog} from './practice-fixtures.js';
import {createDemoState} from '../public/src/state/store.js';
import {validateState} from '../public/src/domain/contracts.js';
const now='2026-10-24T15:30:00Z'; // 한국 시간 10/25
const catalog={questions:[{id:'q',conceptIds:['c']}],concepts:[{id:'c',name:'동류항 정리'}]};
const base=()=>({learnerId:'l',learners:[{id:'l',name:'하늘'}],attempts:[],initialAssessments:[],generatedPractice:[]});

test('seven Seoul dates count each answer once, keep unknowns and exclude other learners/future/old dates',()=>{
 const s=base();
 s.attempts=[{id:'a',learnerId:'l',sourceQuestionId:'q',result:'abstained',submittedAt:'2026-10-24T15:00:00Z'},
 {id:'a',learnerId:'l',sourceQuestionId:'q',result:'abstained',submittedAt:'2026-10-24T15:00:00Z'},
 {id:'other',learnerId:'other',result:'correct',submittedAt:now},
 {id:'old',learnerId:'l',result:'correct',submittedAt:'2026-10-18T14:59:00Z'},
 {id:'future',learnerId:'l',result:'correct',submittedAt:'2026-10-26T00:00:00Z'},
 {id:'legacy',learnerId:'l',result:'incorrect',sourceQuestionId:'q'}];
 const before=JSON.stringify(s),summary=guardian.buildGuardianSummary(s,catalog,{now});
 assert.deepEqual(summary.activity.map(d=>d.date),['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25']);
 assert.equal(summary.totalResponses,1);assert.equal(summary.activeDays,1);assert.equal(summary.activity.at(-1).count,1);
 assert.equal(summary.undatedResponses,1);assert.equal(summary.activity[0].count,0);assert.equal(JSON.stringify(s),before);
});

test('diagnostic, roadmap and AI responses are distinct; exposure and generation alone do not count',()=>{
 const s=base();s.initialAssessments=[{id:'d',learnerId:'l',version:2,status:'active',diagnostic:{attempts:[{id:'x',questionId:'q',result:'correct',independent:true,answeredAt:now}]},roadmapPractice:{attempts:[{id:'x',questionId:'q',conceptTags:['c'],result:'correct',answeredAt:now}]}}];
 s.generatedPractice=[{id:'g',learnerId:'l',spec:{conceptId:'c'},attempts:[{id:'x',result:'incorrect',answeredAt:now}]},{id:'empty',learnerId:'l',attempts:[]}];
 const out=guardian.buildGuardianSummary(s,catalog,{now});assert.equal(out.totalResponses,3);
 assert.equal(out.activity.at(-1).diagnostic,1);assert.equal(out.activity.at(-1).review,1);assert.equal(out.activity.at(-1).ai,1);
 assert.equal(out.concepts[0].status,'needs_support','later incorrect evidence is not mastered');
});

test('review success and helped/repeated answers never become independent achievement',()=>{
 const s=base();s.attempts=[{id:'a',learnerId:'l',sourceQuestionId:'q',result:'correct',stage:'original_retry',noveltyAtPresentation:'first_seen',helpUsed:false,submittedAt:now}];
 assert.equal(guardian.buildGuardianSummary(s,catalog,{now}).concepts[0].status,'review_success');
 s.attempts[0].stage='original_attempt';s.attempts[0].helpUsed=true;
 assert.equal(guardian.buildGuardianSummary(s,catalog,{now}).concepts[0].status,'review_success');
 s.attempts[0].helpUsed=false;
 assert.equal(guardian.buildGuardianSummary(s,catalog,{now}).concepts[0].status,'independent');
});

test('empty and legacy states remain readable and private notes are never projected',()=>{
 const s=base();s.logs=[{content:'비공개 일지'}];s.aiArtifacts=[{output:'검토 전 제안'}];
 s.guardianMessages=[{learnerId:'other',text:'타 학생'},{learnerId:'l',text:'공유한 안내',sharedAt:now}];
 const out=guardian.buildGuardianSummary(s,catalog,{now});assert.equal(out.totalResponses,0);assert.deepEqual(out.concepts,[]);
 assert.equal(out.assessmentStatus,'not_started');assert.equal(out.sharedMessage.text,'공유한 안내');assert.doesNotMatch(JSON.stringify(out),/비공개|검토 전|타 학생/);
});

test('next learning steps follow one prerequisite chain instead of presenting unrelated foundations as a sequence',()=>{
 const state=setupAI().getState(),out=guardian.buildGuardianSummary(state,fullCatalog);
 assert.ok(out.nextSteps.length>=2);assert.ok(out.nextSteps.every((c,i)=>!i||c.step>out.nextSteps[i-1].step));
});

test('lesson-generated items without a source question retain concept evidence via their own path item',()=>{
 const s=base();s.paths=[{id:'p',learnerId:'l',pastItems:[{id:'generated',sourceQuestionId:null,conceptIds:['c']}],items:[]}];
 s.attempts=[{id:'a',pathId:'p',itemId:'generated',learnerId:'l',sourceQuestionId:null,result:'correct',stage:'foundation_practice',submittedAt:now}];
 const summary=guardian.buildGuardianSummary(s,catalog,{now});assert.equal(summary.totalResponses,1);
 assert.equal(summary.concepts[0]?.title,'동류항 정리');assert.equal(summary.concepts[0]?.status,'review_success');
});

test('shared messages round trip as optional state but malformed shared fields require recovery',()=>{
 const s=createDemoState();assert.equal(validateState(s).ok,true);
 const message={learnerId:s.learnerId,mentorId:s.mentorId,text:'부호 계산을 함께 확인해요.',sharedAt:now};
 assert.equal(validateState({...s,guardianMessages:[message]}).ok,true);
 for(const bad of [{},[null],[{...message,text:''}],[{...message,sharedAt:'broken'}]])
  assert.equal(validateState({...s,guardianMessages:bad}).ok,false);
});

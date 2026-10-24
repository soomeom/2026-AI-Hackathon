import test from 'node:test';
import assert from 'node:assert/strict';
import { createPracticeController, requestPractice } from '../public/src/ai/practice-client.js';
import { renderAIPractice, renderMentorAIPractice } from '../public/src/ui/ai-practice.js';
import { setupAI, recordFor } from './practice-state-fixtures.js';
import {catalog,sample} from './practice-fixtures.js';
import { validateLinearPractice } from '../public/src/learning/linear-practice.js';
const response=i=>({status:'ok',...i,...validateLinearPractice(sample(i.conceptId)),model:'test'});
function setup(request) {
 const store=setupAI(),ui={};const controller=createPracticeController({...store,catalog,ui,request,rerender:()=>{}});
 const r=recordFor(store.getState());return {store,ui,controller,input:{assessmentId:r.assessmentId,cardId:r.cardId,baseQuestionId:r.baseQuestionId}};
}
test('generate once, save draft, answer, reopen without auto generation; mentor sees evidence separately',async()=>{
 let calls=0;const ctx=setup(async i=>{calls++;assert.ok(i.evidence.length>0);return response(i);});
 await ctx.controller.open(ctx.input);const id=ctx.store.getState().activeGeneratedPracticeId;
 const before=structuredClone(ctx.store.getState().initialAssessments);
 ctx.controller.choose(id,'option-1');ctx.controller.submit(id,false);
 ctx.controller.cancel({close:true});await ctx.controller.open(ctx.input);assert.equal(calls,1);
 const root={innerHTML:''};assert.equal(renderAIPractice({root,state:ctx.store.getState(),catalog,ui:ctx.ui,practice:ctx.controller}),true);assert.match(root.innerHTML,/정답 검증 완료/);assert.match(root.innerHTML,/같은 개념 더 연습/);
 const mentor=renderMentorAIPractice(ctx.store.getState(),catalog);assert.match(mentor,/AI 추가 연습/);assert.match(mentor,/정답/);assert.match(mentor,/다음 수업/);
 assert.deepEqual(ctx.store.getState().initialAssessments,before);
});
test('loading deduplicates clicks; existing practice cancels and ignores late AI response',async()=>{
 let resolve,calls=0;const ctx=setup(i=>{calls++;return new Promise(r=>{resolve=()=>r(response(i));});});
 const waiting=ctx.controller.open(ctx.input);ctx.controller.open(ctx.input);assert.equal(calls,1);
 const root={innerHTML:''};renderAIPractice({root,state:ctx.store.getState(),catalog,ui:ctx.ui,practice:ctx.controller});assert.match(root.innerHTML,/기존 문제로 바로 연습/);
 ctx.controller.useExisting();resolve();await waiting;
 assert.equal(ctx.store.getState().generatedPractice.length,0);assert.equal(ctx.store.getState().initialAssessments[0].roadmapPractice.questionId,ctx.input.baseQuestionId);
});
test('invalid output, missing key and duplicate problems fall back; no effect after navigation or revision changes',async()=>{
 for(const request of [async()=>({status:'failed',code:'ai_not_configured'}),async i=>({...response(i),spec:{}})]) {
  const c=setup(request);await c.controller.open(c.input);assert.equal(c.store.getState().generatedPractice.length,0);assert.equal(c.store.getState().initialAssessments[0].roadmapPractice.questionId,c.input.baseQuestionId);
 }
 const c=setup(async i=>response(i));await c.controller.open(c.input);await c.controller.more();assert.equal(c.store.getState().generatedPractice.length,1);assert.equal(c.store.getState().activeGeneratedPracticeId,null);
 let finish;const d=setup(i=>new Promise(r=>{finish=()=>r(response(i));}));const p=d.controller.open(d.input);d.store.update(s=>({...s,revision:s.revision+1}));finish();await p;assert.equal(d.store.getState().generatedPractice.length,0);
});
test('help flag belongs to the current question and is cleared when leaving',async()=>{
 const c=setup(async i=>response(i));await c.controller.open(c.input);c.ui.practiceHelp=true;c.controller.cancel({close:true});assert.equal(c.ui.practiceHelp,false);
});
test('browser deadline ends even if the fetch implementation ignores abort',async()=>{
 const result=await requestPractice({requestId:'slow'},{timeoutMs:10,fetchImpl:()=>new Promise(()=>{})});assert.equal(result.code,'ai_timeout');
 const controller=new AbortController();controller.abort();assert.equal((await requestPractice({},{signal:controller.signal})).status,'canceled');
});

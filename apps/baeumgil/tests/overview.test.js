import test from 'node:test';
import assert from 'node:assert/strict';
import * as overview from '../public/src/ui/learning-overview.js';
import { readFileSync } from 'node:fs';
import { mergeCatalogParts } from '../public/src/content/catalog.js';
import { createStore, createDemoState } from '../public/src/state/store.js';
import { initialAssessmentSummary } from '../public/src/learning/initial-assessment.js';
import { buildLearnerSummary } from '../public/src/mentoring/summary.js';

const catalog=mergeCatalogParts(['questions','concepts','routes','review','exam-bank'].map(n=>JSON.parse(readFileSync(new URL(`../public/src/content/${n}.json`,import.meta.url),'utf8'))));
function diagnosed(correct=false){
  const store=createStore({initialState:createDemoState(),catalog});store.startInitialAssessment();
  while(store.getState().initialAssessments[0].status==='active'){
    const record=store.getState().initialAssessments[0],q=catalog.questions.find(q=>q.id===record.diagnostic.currentId);
    store.presentInitialQuestion({assessmentId:record.id,questionId:q.id});
    store.submitInitialAnswer({assessmentId:record.id,questionId:q.id,...(correct?{choiceId:q.choices.find(c=>c.value===q.answer).id}:{abstained:true})});
  }return store.getState();
}
test('learner result prioritizes one evidence-based next action without embedding every roadmap card',()=>{
  assert.equal(typeof overview.renderDiagnosticOverview,'function');
  const state=diagnosed(),summary=initialAssessmentSummary(state,state.learnerId,{catalog}),before=JSON.stringify(state);
  const html=overview.renderDiagnosticOverview(summary);
  assert.match(html,/동류항 정리/);assert.match(html,/모름/);
  assert.match(html,/data-initial-action="next-practice"/);
  assert.equal((html.match(/class="primary/g)??[]).length,1);
  assert.doesNotMatch(html,/class="roadmap-card/);assert.equal(JSON.stringify(state),before);
  const passed=initialAssessmentSummary(diagnosed(true),'learner-1',{catalog});
  const passedHtml=overview.renderDiagnosticOverview(passed);
  assert.doesNotMatch(passedHtml,/data-initial-action="next-practice"/);
  assert.match(passedHtml,/이번 진단/);assert.doesNotMatch(passedHtml,/모든 개념.*숙달/);
});
test('mentor home has a focused next step while planning, diagnosis and evidence remain reachable',()=>{
  assert.equal(typeof overview.renderMentorHome,'function');
  const state=diagnosed(),summary=buildLearnerSummary(state,state.learnerId,{catalog});
  const html=overview.renderMentorHome(state,catalog,summary,[]);
  assert.match(html,/data-goto="planning"/);assert.match(html,/data-goto="assessment"/);assert.match(html,/data-goto="roadmap"/);
  assert.doesNotMatch(html,/initial-concept|assign-select|roadmap-card|data-ai="request"/);
  assert.equal((html.match(/class="primary/g)??[]).length,1);
  const completed=[{id:'done',status:'completed',mentorRequests:[{stage:'original_attempt'}]}];
  const doneHtml=overview.renderMentorHome(state,catalog,summary,completed);
  assert.doesNotMatch(doneHtml,/도움 요청 1건/);
});
test('path results link to pending work and keep skipped, unknown and assisted evidence distinct',()=>{
  assert.equal(typeof overview.renderPathResult,'function');
  const path={id:'p1',stage:'completed',status:'completed',pastItems:[{stage:'original_attempt',result:'incorrect'}],retryResult:'correct',transferStatus:'not_measured',skippedStageIds:['foundation_practice']};
  const html=overview.renderPathResult(path,[path,{id:'p2',status:'active'}]);
  assert.match(html,/data-result-path="p2"/);assert.match(html,/미측정/);assert.match(html,/건너뛴/);
  assert.match(html,/<details/);assert.doesNotMatch(html,/완전히.*숙달/);
  const waiting=overview.renderPathResult({...path,stage:'needs_mentor',status:'needs_mentor'},[]);
  assert.match(waiting,/멘토와 함께/);assert.match(waiting,/data-action="result-roadmap"/);
});

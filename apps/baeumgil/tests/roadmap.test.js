import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startDiagnostic, submitDiagnostic, validateDiagnostic, restoreDiagnostic, diagnosticReport } from '../public/src/learning/diagnostic.js';
import { buildRoadmap } from '../public/src/learning/roadmap.js';
import { startInitialAssessment, presentInitialQuestion, submitInitialAnswer, pauseInitialAssessment, openInitialRoadmap, answerInitialRoadmap } from '../public/src/learning/initial-assessment.js';
import { createInitialState, validateState } from '../public/src/domain/contracts.js';
import { mergeCatalogParts } from '../public/src/content/catalog.js';
const read = name => JSON.parse(readFileSync(new URL(`../public/src/content/${name}.json`, import.meta.url)));
const bank = read('questions').questions, config = read('diagnostic');
const qOf = id => bank.find(q => q.id === id);
const high = n => `ged-high-2025-1-math-q${String(n).padStart(2, '0')}`;
const send = (s, correct = false, extra = {}) => {
  const q = qOf(s.currentId);
  return submitDiagnostic(s, { id: `a${s.attempts.length}`, questionId: q.id, choiceId: q.choices.find(c => (c.value === q.answer) === correct).id, ...extra }, bank, config);
};
const finish = (decide = () => false, extra = {}) => { let s = startDiagnostic(bank, config); while (s.status === 'active') s = send(s, decide(qOf(s.currentId)), extra); return s; };

test('four corrected chains target their actual prerequisites, never an arbitrary domain neighbour', () => {
  for (const [n, mid, low] of [[1, '일차식의 계산', '동류항'], [15, '진리집합', '참'], [16, '함숫값', '대입'], [11, '피타고라스', '제곱']]) {
    const root = qOf(high(n)), first = qOf(root.fallback_question_id), second = qOf(first.fallback_question_id);
    assert.equal(first.level, 2); assert.equal(second.level, 1);
    assert.match(first.curriculum.core, new RegExp(mid)); assert.match(second.curriculum.core, new RegExp(low));
    assert.ok(first.conceptIds.every(id => root.prerequisite_concept.includes(id)));
  }
  assert.ok(qOf(high(11)).prerequisite_question_ids.includes('roadmap-line-basic'));
});
test('all wrong covers every high concept and builds bottom-up cards grounded in actual answers', () => {
  const state = finish(), roadmap = buildRoadmap(state, bank, config);
  assert.equal(state.attempts.filter(a => a.level === 3).length, 12);
  assert.equal(roadmap.mastered.length, 0);
  for (const d of roadmap.domains) assert.deepEqual(d.steps.map(s => s.step), [1, 2, 3]);
  for (const a of state.attempts) {
    assert.equal(a.correct, a.result === 'correct'); assert.ok(a.conceptTags.length);
    assert.ok(['original', 'prerequisite', 'foundation'].includes(a.stage)); assert.ok(a.rootQuestionId); assert.ok(a.answeredAt);
    assert.ok(roadmap.domains.flatMap(d => d.steps.flatMap(s => s.cards)).some(c => c.evidenceQuestionIds.includes(a.questionId)));
  }
});
test('independent original passes are mastered only for measured concepts; assisted passes need checking', () => {
  const passed = buildRoadmap(finish(() => true), bank, config);
  assert.equal(passed.mastered.length, 12); assert.equal(passed.domains.flatMap(d => d.steps.flatMap(s => s.cards)).length, 0);
  const helped = buildRoadmap(finish(() => true, { helpUsed: true }), bank, config);
  assert.equal(helped.mastered.length, 0); assert.equal(helped.recheck.length, 12);
  const empty = buildRoadmap(startDiagnostic(bank, config), bank, config);
  assert.equal(empty.mastered.length, 0); assert.equal(empty.unmeasured.length, 12);
});
test('one correct answer without enough tier evidence is pending, not a demonstrated foundational weakness',()=>{
  const s=send(startDiagnostic(bank,config),true);
  assert.equal(diagnosticReport(s,bank,config).domains[0].evidence,'insufficient');
});
test('no lower failure invents no foundational weakness, and report generation never changes logs', () => {
  const state = finish(q => q.level < 3), before = JSON.stringify(state);
  const road = buildRoadmap(state, bank, config);
  assert.ok(road.domains.every(d => d.steps[0].cards.length === 0 && d.steps[1].cards.length === 0));
  assert.equal(road.domains.flatMap(d => d.steps[2].cards).length, 12);
  assert.equal(JSON.stringify(state), before);
});
test('a later practice error reopens the card while keeping the diagnostic evidence unchanged',()=>{
  const state=finish(), card=buildRoadmap(state,bank,config).domains[0].steps[0].cards[0];
  const practice={attempts:card.questionIds.map(questionId=>({cardId:card.id,questionId,result:'correct'}))};
  assert.equal(buildRoadmap(state,bank,config,practice).domains[0].steps[0].cards[0].practiceComplete,true);
  practice.attempts.push({cardId:card.id,questionId:card.questionIds[0],result:'incorrect'});
  assert.equal(buildRoadmap(state,bank,config,practice).domains[0].steps[0].cards[0].practiceComplete,false);
});
test('invalid bundle references and fallback concept mismatch are rejected', () => {
  const broken = structuredClone(config); broken.learningBundles[0].questionIds.push('missing');
  assert.throws(() => validateDiagnostic(bank, broken));
  const wrong = structuredClone(bank); wrong.find(q => q.id === high(1)).prerequisite_concept = ['unrelated'];
  assert.throws(() => validateDiagnostic(wrong, config));
});

test('parallel prerequisites are both measured and never leak into another domain', () => {
  const state=finish();const ids=state.attempts.map(a=>a.questionId);
  const index=ids.indexOf(high(11));
  assert.deepEqual(ids.slice(index,index+5),[high(11),'roadmap-pythagoras','roadmap-square-sum','roadmap-line-basic','roadmap-point-value']);
  assert.equal(new Set(ids).size,ids.length);
});
test('legacy logs restore without replay or data loss; missing metadata is explicit in the roadmap', () => {
  const old=finish();old.version=1;
  for(const a of old.attempts){delete a.conceptTags;delete a.stage;delete a.conceptName;delete a.answeredAt;}
  const restored=restoreDiagnostic(old,bank,config);
  assert.deepEqual(restored,old);assert.equal(buildRoadmap(restored,bank,config).legacy,true);
  const corrupt=structuredClone(old);corrupt.attempts[0].questionId='missing';assert.throws(()=>restoreDiagnostic(corrupt,bank,config));
});
test('restore rejects contradictory help evidence and malformed practice without rewriting valid past evidence',()=>{
  const state=finish(()=>true), contradictory=structuredClone(state);
  contradictory.attempts[0].helpUsed=true;
  assert.throws(()=>restoreDiagnostic(contradictory,bank,config));
  const broken=structuredClone(state);broken.roadmapPractice={attempts:{}};
  const recovered=restoreDiagnostic(broken,bank,config);
  assert.deepEqual(recovered.attempts,state.attempts);
  assert.deepEqual(recovered.roadmapPractice.recovery.original,broken.roadmapPractice);
  assert.doesNotThrow(()=>buildRoadmap(recovered,bank,config,recovered.roadmapPractice));
  state.seenBefore.push(state.attempts[0].questionId); // reviewed after answering, while paused
  assert.deepEqual(restoreDiagnostic(state,bank,config),state);
});
test('regular lesson routes reuse the corrected graph with enough relevant practice items',()=>{
  const routes=read('exam-bank').routes;
  for(const d of config.domains)for(const id of d.levels[3]){
    const route=routes.find(r=>r.questionId===id), q=qOf(id);
    assert.deepEqual(route.conceptCheckQuestionIds,q.prerequisite_question_ids);
    assert.ok(route.foundationQuestionIds.length>=3);
    assert.ok(route.foundationQuestionIds.every(id=>qOf(id)?.domain===q.domain));
  }
});

test('practice persists separately, guards stale inputs, and preserves all original records', () => {
  const catalog = mergeCatalogParts(['questions', 'concepts', 'routes', 'review', 'exam-bank'].map(read));
  const ctx = { catalog }, at = '2026-10-24T12:00:00.000Z';
  let s = startInitialAssessment(createInitialState(), { learnerId:'learner-1', id:'assessment', at }, ctx);
  for(let i=0;i<3;i++) {
    const id=s.initialAssessments[0].diagnostic.currentId;
    s=presentInitialQuestion(s,{assessmentId:'assessment',questionId:id,at},ctx);
    s=submitInitialAnswer(s,{assessmentId:'assessment',questionId:id,abstained:true,at},ctx);
  }
  s=pauseInitialAssessment(s,{assessmentId:'assessment',at});
  const original=JSON.stringify(s.initialAssessments[0].diagnostic), untouched=JSON.stringify([s.assignments,s.paths,s.sessions,s.logs,s.attempts]);
  const road=buildRoadmap(s.initialAssessments[0].diagnostic,bank,config), card=road.domains[0].steps[0].cards[0];
  assert.throws(()=>answerInitialRoadmap(s,{assessmentId:'assessment',choiceId:'a',at},ctx));
  s=openInitialRoadmap(s,{assessmentId:'assessment',cardId:card.id,questionId:card.questionIds[0],at},ctx);
  const roundId=s.initialAssessments[0].roadmapPractice.roundId, q=qOf(card.questionIds[0]);
  const input={assessmentId:'assessment',roundId,choiceId:q.choices.find(c=>c.value===q.answer).id,at};
  assert.throws(()=>answerInitialRoadmap(s,{...input,roundId:'stale'},ctx));
  s=answerInitialRoadmap(s,input,ctx);
  assert.equal(answerInitialRoadmap(s,input,ctx),s);
  const restored=JSON.parse(JSON.stringify(s));
  assert.ok(validateState(restored).ok);
  assert.equal(restored.initialAssessments[0].roadmapPractice.attempts.length,1);
  assert.equal(JSON.stringify(restored.initialAssessments[0].diagnostic),original);
  assert.equal(JSON.stringify([s.assignments,s.paths,s.sessions,s.logs,s.attempts]),untouched);
  const practiced=buildRoadmap(restored.initialAssessments[0].diagnostic,bank,config,restored.initialAssessments[0].roadmapPractice).domains[0].steps[0].cards[0];
  assert.equal(practiced.practiceCorrect,1);assert.equal(practiced.practiceComplete,false);
  assert.ok(s.exposures.some(e=>e.stage==='roadmap_practice'));
  const bad=structuredClone(s);bad.initialAssessments[0].roadmapPractice.attempts[0].result='made-up';assert.equal(validateState(bad).ok,false);
});

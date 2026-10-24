import test from 'node:test';
import assert from 'node:assert/strict';
import {setupAI,recordFor} from './practice-state-fixtures.js';
import {acceptAIPractice,presentAIPractice,submitAIPractice} from '../public/src/learning/ai-practice.js';
import {catalog,sample,n,expr} from './practice-fixtures.js';
import {validateLinearPractice} from '../public/src/learning/linear-practice.js';
import {openInitialRoadmap,answerInitialRoadmap} from '../public/src/learning/initial-assessment.js';
import {roadmapCards,buildRoadmap} from '../public/src/learning/roadmap.js';
import {saveSession} from '../public/src/mentoring/logs.js';
import {validateState} from '../public/src/domain/contracts.js';
import {gradeAnswer} from '../public/src/learning/grading.js';
import {buildWeeklyGoal,shareGoalMessage} from '../public/src/learning/weekly-goal.js';
import {renderWeeklyGoal} from '../public/src/ui/weekly-goal.js';
const now='2026-10-24T13:00:00Z';
function completed(at=now,count=2,initialState=setupAI().getState()){
 let state=structuredClone(initialState);const a=state.initialAssessments[0];
 const cards=roadmapCards(buildRoadmap(a.diagnostic,catalog.questions,catalog.diagnostic)).slice(0,count);
 for(const card of cards)for(const questionId of card.questionIds){
  state=openInitialRoadmap(state,{assessmentId:a.id,cardId:card.id,questionId,at},{catalog});
  const q=catalog.questions.find(q=>q.id===questionId);
  state=answerInitialRoadmap(state,{assessmentId:a.id,roundId:state.initialAssessments[0].roadmapPractice.roundId,choiceId:q.choices.find(c=>gradeAnswer(q,{choiceId:c.id})==='correct').id,at},{catalog});
 }
 return state;
}
const attended=(state,localDate='2026-10-24',id='session-week',attendance='attended')=>saveSession(state,{id,learnerId:state.learnerId,mentorId:state.mentorId,localDate,attendance,actualMinutes:30});

test('successful AI supplement concepts advance the participation goal and share the same concept deduplication',()=>{
 let state=setupAI().getState();const diagnostic=structuredClone(state.initialAssessments);
 for(const [i,concept] of ['roadmap-like-terms','roadmap-linear-sum'].entries()){
  const r=recordFor(state,concept,`goal-ai-${i}`);state=presentAIPractice(acceptAIPractice(state,{record:r},{catalog}),{id:r.id,at:now});
  state=submitAIPractice(state,{id:r.id,submissionId:`goal-answer-${i}`,choiceId:'option-1',helpUsed:true,at:now},{catalog});
 }
 assert.equal(buildWeeklyGoal(state,catalog,{now}).concepts,2);assert.deepEqual(state.initialAssessments,diagnostic);
 const duplicate=structuredClone(state.generatedPractice[0]);duplicate.id='legacy-duplicate';state.generatedPractice.push(duplicate);
 assert.equal(buildWeeklyGoal(state,catalog,{now}).concepts,2);
});

test('weekly goal counts completed bundles once per week and attended sessions only, without mutating evidence',()=>{
 let state=attended(completed());state=attended(state,'2026-10-23','absent','absent');state=attended(state,'2026-10-24','canceled','canceled');state=attended(state,'2026-10-25','future');
 const a=state.initialAssessments[0],card=roadmapCards(buildRoadmap(a.diagnostic,catalog.questions,catalog.diagnostic)).find(c=>c.id===a.roadmapPractice.cardId),q=catalog.questions.find(q=>q.id===card.questionIds[0]);
 state=openInitialRoadmap(state,{assessmentId:a.id,cardId:card.id,questionId:q.id,at:now},{catalog});
 state=answerInitialRoadmap(state,{assessmentId:a.id,roundId:state.initialAssessments[0].roadmapPractice.roundId,choiceId:q.choices.find(c=>gradeAnswer(q,{choiceId:c.id})==='correct').id,at:now},{catalog});
 const before=JSON.stringify(state),goal=buildWeeklyGoal(state,catalog,{now});
 assert.equal(goal.weekStart,'2026-10-19');assert.equal(goal.concepts,2);assert.equal(goal.sessions,1);assert.equal(goal.complete,true);
 assert.equal(JSON.stringify(state),before);assert.equal(validateState(state).ok,true);
});

test('Seoul Monday rollover excludes last week completion and missing, future, duplicate or other learner records',()=>{
 let state=attended(completed('2026-10-18T13:00:00Z'),'2026-10-18');
 state.sessions.push({...state.sessions[0],id:'other',learnerId:'other',localDate:'2026-10-24'});
 assert.equal(buildWeeklyGoal(state,catalog,{now}).concepts,0);assert.equal(buildWeeklyGoal(state,catalog,{now}).sessions,0);
 const next=buildWeeklyGoal(attended(completed()),catalog,{now:'2026-10-25T15:00:00Z'});
 assert.equal(next.weekStart,'2026-10-26');assert.equal(next.complete,false);assert.equal(next.concepts,0);assert.equal(next.sessions,0);
 const future=completed('2026-10-24T14:00:00Z');assert.equal(buildWeeklyGoal(future,catalog,{now}).concepts,0);
});

test('mentor encouragement is allowed before participation and persists without changing learning evidence',()=>{
 let state=setupAI().getState();const evidence=structuredClone(state.initialAssessments);
 state=shareGoalMessage(state,{text:'  함께 한 걸음 나아갔어요!  ',at:now},{catalog,role:'mentor'});
 assert.equal(validateState(state).ok,true);assert.equal(buildWeeklyGoal(JSON.parse(JSON.stringify(state)),catalog,{now}).message.text,'함께 한 걸음 나아갔어요!');
 assert.equal(state.guardianMessages,undefined);assert.deepEqual(state.initialAssessments,evidence);
 assert.equal(buildWeeklyGoal(state,catalog,{now:'2026-10-25T15:00:00Z'}).message,null);
 assert.throws(()=>shareGoalMessage(state,{text:'학생이 위조',at:now},{catalog,role:'learner'}),/mentor_required/);
 assert.throws(()=>shareGoalMessage(state,{text:'x'.repeat(201),at:now},{catalog,role:'mentor'}),/invalid_goal_message/);
 assert.throws(()=>shareGoalMessage(state,{text:' ',at:now},{catalog,role:'mentor'}),/invalid_goal_message/);
 assert.throws(()=>shareGoalMessage(state,{text:'응원',at:now},{catalog,role:'guardian'}),/mentor_required/);
 const corrupt=structuredClone(state);corrupt.weeklyGoalMessages[0].learnerId='other';assert.equal(validateState(corrupt).ok,false);
});

test('reviewing last week bundles earns this week participation without changing previous attempts',()=>{
 const previous=completed('2026-10-18T13:00:00Z'),before=structuredClone(previous);
 const reviewed=completed(now,2,previous),goal=buildWeeklyGoal(reviewed,catalog,{now});
 assert.equal(goal.concepts,2);assert.equal(goal.complete,false);
 assert.deepEqual(previous,before);
 assert.deepEqual(reviewed.initialAssessments[0].diagnostic,before.initialAssessments[0].diagnostic);
 const past=before.initialAssessments[0].roadmapPractice.attempts;
 assert.deepEqual(reviewed.initialAssessments[0].roadmapPractice.attempts.slice(0,past.length),past);
 assert.equal(buildWeeklyGoal(completed(now,2,reviewed),catalog,{now}).concepts,2);
 assert.equal(validateState(JSON.parse(JSON.stringify(reviewed))).ok,true);
});

test('a partial review cannot reuse last week answers to claim a full bundle this week',()=>{
 let state=completed('2026-10-18T13:00:00Z',1);const a=state.initialAssessments[0];
 const card=roadmapCards(buildRoadmap(a.diagnostic,catalog.questions,catalog.diagnostic))[0];
 assert.ok(card.questionIds.length>1);
 const questionId=card.questionIds[0],q=catalog.questions.find(q=>q.id===questionId);
 state=openInitialRoadmap(state,{assessmentId:a.id,cardId:card.id,questionId,at:now},{catalog});
 state=answerInitialRoadmap(state,{assessmentId:a.id,roundId:state.initialAssessments[0].roadmapPractice.roundId,choiceId:q.choices.find(c=>gradeAnswer(q,{choiceId:c.id})==='correct').id,at:now},{catalog});
 assert.equal(buildWeeklyGoal(state,catalog,{now}).concepts,0);
});

test('AI review counts again in the new Seoul week and deduplicates with registered practice',()=>{
 let state=completed(now);const previous='2026-10-18T13:00:00Z';
 for(const [i,at] of [previous,now,now].entries()){
  const spec=sample('roadmap-like-terms');spec.expression.right=n(4+i);spec.claimedAnswer.b=-4-i;
  spec.options=[expr(5,-4-i),expr(5,4+i),expr(1,-4-i),expr(1,4+i)];
  const r={...recordFor(state,'roadmap-like-terms',`review-ai-${i}`),...validateLinearPractice(spec),generatedAt:at};
  state=presentAIPractice(acceptAIPractice(state,{record:r},{catalog}),{id:r.id,at});
  state=submitAIPractice(state,{id:r.id,submissionId:`review-answer-${i}`,choiceId:'option-1',at},{catalog});
 }
 const aiOnly={...state,initialAssessments:[]};
 assert.equal(buildWeeklyGoal(aiOnly,catalog,{now}).concepts,1);
 // The same concept was also completed in the registered bundle this week.
 assert.equal(buildWeeklyGoal(state,catalog,{now}).concepts,2);
});

test('student achievement stays visible while the shared lesson is pending, and both complete independently',()=>{
 const student=completed(),lesson=attended(setupAI().getState());
 assert.match(renderWeeklyGoal(student,catalog,{now}),/학생 학습 완료/);
 assert.match(renderWeeklyGoal(student,catalog,{now}),/함께하는 수업 대기/);
 assert.doesNotMatch(renderWeeklyGoal(student,catalog,{now}),/✓ 함께 목표 완료/);
 assert.match(renderWeeklyGoal(lesson,catalog,{now}),/학생 학습 목표 진행 중/);
 assert.match(renderWeeklyGoal(lesson,catalog,{now}),/함께하는 수업 완료/);
 assert.match(renderWeeklyGoal(attended(student),catalog,{now}),/✓ 함께 목표 완료/);
 const empty=setupAI().getState();
 assert.match(renderWeeklyGoal(empty,catalog,{mentor:true,now}),/data-action="share-goal-message"/);
 assert.doesNotMatch(renderWeeklyGoal(empty,catalog,{now}),/data-action="share-goal-message"/);
});

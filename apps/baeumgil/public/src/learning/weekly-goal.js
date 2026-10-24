import {buildRoadmap,roadmapCards} from './roadmap.js';
const DAY=86400000,KST=9*3600000;
export function goalWeek(now){
 const time=Date.parse(now);if(!Number.isFinite(time))throw Error('invalid_goal_date');
 const local=new Date(time+KST),day=local.getUTCDay(),monday=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())-((day+6)%7)*DAY;
 return {weekStart:new Date(monday).toISOString().slice(0,10),weekEnd:new Date(monday+6*DAY).toISOString().slice(0,10),start:monday-KST,end:monday+7*DAY-KST,time};
}
// 이번 주 연습만으로 완료한 개념을 주당 한 번 센다. 과거 기록과 숙달 판정은 바꾸지 않는다.
export function buildWeeklyGoal(state,catalog,{now=new Date().toISOString()}={}){
 const week=goalWeek(now),completed=new Set();
 const inWeek=at=>{const time=Date.parse(at);return Number.isFinite(time)&&time>=week.start&&time<week.end&&time<=week.time;};
 for(const record of (state.initialAssessments??[]).filter(a=>a.learnerId===state.learnerId&&a.version===2)){
  if(!catalog.diagnostic||!record.diagnostic)continue;
  const cards=roadmapCards(buildRoadmap(record.diagnostic,catalog.questions,catalog.diagnostic));
  for(const card of cards){
   const latest=new Map();
   const attempts=(record.roadmapPractice?.attempts??[]).filter(a=>a.cardId===card.id&&card.questionIds.includes(a.questionId)&&inWeek(a.answeredAt)).sort((a,b)=>Date.parse(a.answeredAt)-Date.parse(b.answeredAt));
   for(const a of attempts){
    latest.set(a.questionId,a.result);
    if(card.questionIds.length&&card.questionIds.every(id=>latest.get(id)==='correct')){
     completed.add(card.conceptId);break;
    }
   }
  }
 }
 // AI 추가 연습은 로드맵 숙달과 별개로, 정답까지 확인한 개념의 참여로 센다.
 for(const record of (state.generatedPractice??[]).filter(r=>r.learnerId===state.learnerId&&r.status==='answered')){
  const concept=record.spec?.conceptId;if(!concept)continue;
  for(const a of record.attempts??[]){
   if(a.result==='correct'&&inWeek(a.answeredAt))completed.add(concept);
  }
 }
 const concepts=completed.size;
 const sessions=new Set((state.sessions??[]).filter(s=>s.learnerId===state.learnerId&&s.attendance==='attended'&&s.localDate>=week.weekStart&&s.localDate<=week.weekEnd&&s.localDate<=new Date(week.time+KST).toISOString().slice(0,10)).map(s=>s.id)).size;
 const message=(state.weeklyGoalMessages??[]).filter(m=>m.learnerId===state.learnerId&&m.weekStart===week.weekStart&&Date.parse(m.sharedAt)<=week.time).at(-1)??null;
 const learningComplete=concepts>=2,sessionComplete=sessions>=1;
 return {weekStart:week.weekStart,weekEnd:week.weekEnd,concepts,sessions,learningComplete,sessionComplete,complete:learningComplete&&sessionComplete,message};
}
export function shareGoalMessage(state,{text,at},{role}){
 if(role!=='mentor')throw Error('mentor_required');
 if(typeof text!=='string'||!text.trim()||text.trim().length>200)throw Error('invalid_goal_message');
 const week=goalWeek(at);
 return {...state,revision:(state.revision??0)+1,weeklyGoalMessages:[...(state.weeklyGoalMessages??[]),{learnerId:state.learnerId,mentorId:state.mentorId,weekStart:week.weekStart,text:text.trim(),sharedAt:at}]};
}
export function validGoalMessages(state){
 if(state.weeklyGoalMessages===undefined)return true;
 try{return Array.isArray(state.weeklyGoalMessages)&&state.weeklyGoalMessages.every(m=>m&&state.learners?.some(l=>l.id===m.learnerId)&&state.mentors?.some(p=>p.id===m.mentorId)&&typeof m.text==='string'&&Boolean(m.text.trim())&&m.text.length<=200&&m.weekStart===goalWeek(m.sharedAt).weekStart);}catch{return false;}
}

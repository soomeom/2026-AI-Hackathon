import {validateLinearPractice} from './linear-practice.js';

// 자유 생성 문장을 학생에게 직접 전달하지 않는다. 검토된 질문 후보의 ID만 AI가 고른다.
// solutionSteps 첫 줄은 정답을 포함할 수 있어 실패 시에도 아래 질문으로 대체한다.
const QUESTIONS={
 like:[['문자 부분이 같은 항을 어떤 기준으로 모을 수 있을까요?','각 항에서 문자 부분과 수 부분을 나누어 볼 수 있을까요?'],['같은 문자끼리 모은 뒤 어떤 수들을 계산해야 할까요?','괄호 앞의 부호가 안쪽 항에 어떤 영향을 주는지 살펴볼까요?'],['계산한 뒤 문자항과 상수항이 각각 남아 있는지 확인해 볼까요?','원래 식과 정리한 식에 같은 수를 넣어 비교해 볼 수 있을까요?']],
 linear:[['괄호 안의 항과 괄호 밖의 수를 각각 찾아볼까요?','문자항과 상수항을 먼저 나누어 볼 수 있을까요?'],['괄호 밖의 수를 안쪽 모든 항에 빠짐없이 곱했나요?','괄호를 풀 때 각 항의 부호는 어떻게 달라질까요?'],['괄호를 푼 식에서 같은 문자항끼리 모았나요?','정리한 식에 같은 수를 넣어 원래 식과 비교해 볼까요?']],
 general:[['문제에서 주어진 것과 구해야 하는 것을 나누어 말해 볼까요?','이 문제에서 사용할 개념은 무엇인지 먼저 떠올려 볼까요?'],['사용할 개념을 떠올렸다면 첫 계산을 어떻게 시작할까요?','조건을 식이나 그림으로 옮겨 볼 수 있을까요?'],['계산한 과정이 문제의 모든 조건에 맞는지 확인해 볼까요?','다른 방법으로 계산 과정을 점검해 볼 수 있을까요?']],
};
const theme=q=>(q.conceptIds??[]).some(id=>id.includes('like-terms'))?'like':(q.conceptIds??[]).some(id=>id.includes('linear-sum'))?'linear':'general';
const validStep=step=>Number.isInteger(step)&&step>=1&&step<=3;
export function hintCandidates(question,step){
 if(!validStep(step))throw Error('invalid_hint_step');const group=theme(question);
 return QUESTIONS[group][step-1].map((question,i)=>({id:`${group}-${step}-${i+1}`,question}));
}
export const hintQuestion=id=>{
 const match=/^(like|linear|general)-([123])-([12])$/.exec(id??'');
 return match?QUESTIONS[match[1]][Number(match[2])-1][Number(match[3])-1]:null;
};
export function buildHintInput({question,step,requestId,inputRevision,hintSource={kind:'catalog',questionId:question.id}}){
 return {contractVersion:1,kind:'hint',requestId,inputRevision,learnerAlias:'학습자 A',hintSource,
  facts:{hintStep:step,question:{id:question.id,prompt:String(question.prompt??'').slice(0,4000),conceptIds:question.conceptIds??[]},candidates:hintCandidates(question,step)},
  allowedConceptIds:question.conceptIds??[],allowedQuestionIds:[question.id],allowedEvidenceIds:[],note:'',constraints:{language:'ko',forbidAffectiveStatements:true}};
}
export function canonicalizeHintInput(input,catalog){
 let q;const source=input.hintSource;
 if(source?.kind==='catalog')q=catalog.questions.find(q=>q.id===source.questionId&&q.contentStatus==='approved');
 else if(source?.kind==='generated'){
  const result=validateLinearPractice(source.spec);if(result.ok)q=result.question;
 }
 if(!q||!validStep(input.facts?.hintStep))throw Error('invalid_hint_source');
 return buildHintInput({question:q,step:input.facts.hintStep,requestId:input.requestId,inputRevision:input.inputRevision,hintSource:source});
}
export function validHintOutput(input,output){
 if(output?.kind!=='hint'||Object.keys(output).length!==2||typeof output.hintId!=='string')return false;
 try{return hintCandidates(input.facts.question,input.facts.hintStep).some(c=>c.id===output.hintId);}catch{return false;}
}
export const hintKey=t=>t?.kind==='generated'?`generated:${t.practiceId}`:t?.kind==='roadmap'?`roadmap:${t.assessmentId}:${t.roundId}`:null;
export const hintsFor=(state,target)=>(state.hintUsage??[]).filter(h=>h.learnerId===state.learnerId&&hintKey(h.target)===hintKey(target));
export function resolveHintTarget(state,target,catalog){
 if(target?.kind==='generated'){
  const r=(state.generatedPractice??[]).find(r=>r.id===target.practiceId&&r.learnerId===state.learnerId);
  if(!r||state.activeGeneratedPracticeId!==r.id||r.status!=='ready'||!r.presentedAt||r.attempts.length)throw Error('hint_not_active');
  return {question:r.question,hintSource:{kind:'generated',spec:r.spec}};
 }
 const a=(state.initialAssessments??[]).find(a=>a.id===target?.assessmentId&&a.learnerId===state.learnerId);
 const p=a?.roadmapPractice,q=catalog.questions.find(q=>q.id===p?.questionId);
 if(target?.kind!=='roadmap'||a?.status!=='completed'||!p?.cardId||p.roundId!==target.roundId||p.answerId||!q)throw Error('hint_not_active');
 return {question:q,hintSource:{kind:'catalog',questionId:q.id}};
}
export function currentHintTarget(state){
 if(state.activeGeneratedPracticeId)return {kind:'generated',practiceId:state.activeGeneratedPracticeId};
 const a=(state.initialAssessments??[]).filter(a=>a.learnerId===state.learnerId&&a.version===2).at(-1);
 return a?.roadmapPractice?.cardId?{kind:'roadmap',assessmentId:a.id,roundId:a.roadmapPractice.roundId}:null;
}
export function recordHint(state,{target,step,hintId,source,at},{catalog}){
 const {question}=resolveHintTarget(state,target,catalog),previous=hintsFor(state,target);
 if(previous.some(h=>h.step===step&&h.hintId===hintId))return state;
 if(!validStep(step)||step!==previous.length+1||!hintCandidates(question,step).some(c=>c.id===hintId)||!['ai','fallback'].includes(source)||!Number.isFinite(Date.parse(at)))throw Error('invalid_hint_record');
 const record={id:`hint:${hintKey(target)}:${step}`,learnerId:state.learnerId,target:{...target},questionId:question.id,conceptIds:[...(question.conceptIds??[])],step,hintId,source,shownAt:at};
 return {...state,revision:(state.revision??0)+1,hintUsage:[...(state.hintUsage??[]),record]};
}
export function validHintUsage(state){
 if(state.hintUsage===undefined)return true;
 try{
  const groups=new Map(),ids=new Set();
  return Array.isArray(state.hintUsage)&&state.hintUsage.every(h=>{
   if(!h||typeof h.id!=='string'||ids.has(h.id)||!state.learners?.some(l=>l.id===h.learnerId)||!validStep(h.step)||!['ai','fallback'].includes(h.source)||typeof h.questionId!=='string'||!Number.isFinite(Date.parse(h.shownAt))||!Array.isArray(h.conceptIds)||!h.conceptIds.every(c=>typeof c==='string'))return false;
   const key=hintKey(h.target);if(!key||h.id!==`hint:${key}:${h.step}`)return false;
   const group=`${h.learnerId}:${key}`,next=(groups.get(group)??0)+1;if(h.step!==next)return false;
   let question;
   if(h.target.kind==='generated'){
    const r=(state.generatedPractice??[]).find(r=>r.id===h.target.practiceId&&r.learnerId===h.learnerId);
    if(!r||r.question.id!==h.questionId)return false;question=r.question;
   }else{
    const a=(state.initialAssessments??[]).find(a=>a.id===h.target.assessmentId&&a.learnerId===h.learnerId),p=a?.roadmapPractice;
    if(!p||typeof h.target.roundId!=='string'||!(state.exposures??[]).some(e=>e.learnerId===h.learnerId&&e.stage==='roadmap_practice'&&e.sourceQuestionId===h.questionId))return false;
    const answered=p.attempts.find(r=>r.id===h.target.roundId);
    if(p.roundId===h.target.roundId){if(p.questionId!==h.questionId)return false;}
    else if(answered){if(answered.questionId!==h.questionId)return false;}
    else{
     const round=h.target.roundId,prefixes=[`${a.id}:practice:${h.questionId}:`,`${a.id}:practice:`];
     const prefix=prefixes.find(prefix=>round.startsWith(prefix)&&/^\d+$/.test(round.slice(prefix.length)));
     if(!prefix||Number(round.slice(prefix.length))>p.attempts.length)return false;
    }
    question={conceptIds:answered?.conceptTags??h.conceptIds};
   }
   if(!hintCandidates(question,h.step).some(c=>c.id===h.hintId))return false;
   ids.add(h.id);groups.set(group,next);return true;
  });
 }catch{return false;}
}

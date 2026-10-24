import { newRequestId } from './client.js';
import { validateLinearPractice, AI_CONCEPTS } from '../learning/linear-practice.js';
import { acceptAIPractice, presentAIPractice, selectAIPractice, submitAIPractice, closeAIPractice, aiPracticeSummary, practiceCard } from '../learning/ai-practice.js';
import { openInitialRoadmap } from '../learning/initial-assessment.js';
export async function requestPractice(input,{signal,timeoutMs=6000,fetchImpl=globalThis.fetch}={}) {
 const controller=new AbortController();let timer;
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
 const canceled=new Promise(resolve=>controller.signal.addEventListener('abort',()=>resolve({status:signal?.aborted?'canceled':'failed',code:signal?.aborted?'ai_canceled':'ai_timeout'}),{once:true}));
 try {
  if(signal?.aborted)return {status:'canceled',code:'ai_canceled'};
  timer=setTimeout(abort,timeoutMs);
  return await Promise.race([canceled,(async()=>{
   try {
    const res=await fetchImpl('/api/practice',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input),signal:controller.signal});
    const body=await res.json();return res.ok&&body.status==='ok'?body:{status:'failed',code:body.error?.code??'ai_unavailable'};
   }catch{return {status:'failed',code:'ai_unavailable'};}
  })()]);
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function createPracticeController({getState,update,catalog,ui,rerender,request=requestPractice,canWrite=()=>true,now=()=>new Date().toISOString()}) {
 let token=0,pending=null,context=null;
 function cancel({close=false}={}) {
  token++;pending?.abort();pending=null;ui.practiceLoading=null;ui.practiceHelp=false;
  if(close&&canWrite())update(closeAIPractice);
 }
 function useExisting(code='manual',input=null) {
  if(input)context={assessmentId:input.assessmentId,cardId:input.cardId,baseQuestionId:input.baseQuestionId};
  const current=context;if(!current)return;cancel({close:true});
  if(!canWrite())return;
  ui.practiceFallback={...current,code};
  if(code!=='manual'&&code!=='unsupported')console.info('AI practice fallback:',code);
  update(s=>openInitialRoadmap(s,{assessmentId:current.assessmentId,cardId:current.cardId,questionId:current.baseQuestionId,at:now()},{catalog}));rerender();
 }
 async function open(input,{force=false}={}) {
  if(pending&&context?.assessmentId===input.assessmentId&&context?.cardId===input.cardId)return;
  if(!canWrite())return;
  const {assessment,card}=practiceCard(getState(),input,{catalog});
  cancel({close:true});context={...input};ui.practiceFallback=null;
  if(!AI_CONCEPTS.includes(card.conceptId)){useExisting('unsupported');return;}
  const existing=aiPracticeSummary(getState(),input).readyRecord;
  if(existing&&!force){update(s=>presentAIPractice(s,{id:existing.id,at:now()}));rerender();return;}
  if(ui.health?.aiConfigured===false){useExisting('ai_not_configured');return;}
  const snapshot=getState(),requestId=newRequestId(),revision=snapshot.revision;
  const evidence=[...assessment.diagnostic.attempts,...(assessment.roadmapPractice?.attempts??[])].filter(a=>catalog.questions.some(q=>q.id===a.questionId&&q.conceptIds.includes(card.conceptId))).slice(-3).map(a=>({questionId:a.questionId,result:a.result,choiceId:a.choiceId??null,helpUsed:Boolean(a.helpUsed)}));
  const body={...input,conceptId:card.conceptId,evidence,requestId,inputRevision:revision};
  const activeToken=token;pending=new AbortController();ui.practiceLoading={...context};rerender();
  let result;
  try {result=await request(body,{signal:pending.signal});}catch{result={status:'failed',code:'ai_unavailable'};}
  if(token!==activeToken)return;
  pending=null;ui.practiceLoading=null;
  if(!canWrite()||getState().revision!==revision){rerender();return;}
  const v=validateLinearPractice(result.spec,{conceptId:card.conceptId});
  if(result.status!=='ok'||result.requestId!==requestId||result.inputRevision!==revision||result.assessmentId!==input.assessmentId||result.cardId!==input.cardId||!v.ok){useExisting(result.code??'ai_invalid_output');return;}
  const record={id:`practice-${requestId}`,learnerId:snapshot.learnerId,...input,requestId,inputRevision:revision,...v,evidence,model:typeof result.model==='string'?result.model.slice(0,100):null,generatedAt:now(),status:'ready',presentedAt:null,draftChoiceId:null,attempts:[]};
  try {update(s=>presentAIPractice(acceptAIPractice(s,{record},{catalog}),{id:record.id,at:now()}));}
  catch{useExisting('duplicate_or_invalid');return;}
  rerender();
 }
 return {open,cancel,useExisting,
  choose(id,choiceId){if(canWrite())update(s=>selectAIPractice(s,{id,choiceId}));},
  submit(id,abstained,helpUsed=false){if(canWrite())update(s=>submitAIPractice(s,{id,submissionId:`answer:${id}`,choiceId:abstained?null:s.generatedPractice.find(r=>r.id===id)?.draftChoiceId,abstained,helpUsed,at:now()},{catalog}));},
  more(){const r=aiPracticeSummary(getState()).records.find(r=>r.id===getState().activeGeneratedPracticeId);if(r)context={assessmentId:r.assessmentId,cardId:r.cardId,baseQuestionId:r.baseQuestionId};return context?open(context,{force:true}):undefined;},
  close(){const active=(getState().generatedPractice??[]).find(r=>r.id===getState().activeGeneratedPracticeId);const current=context??active;cancel({close:true});ui.practiceFallback=null;if(current&&canWrite())update(s=>openInitialRoadmap(s,{assessmentId:current.assessmentId,cardId:null,at:now()},{catalog}));rerender();},
 };
}

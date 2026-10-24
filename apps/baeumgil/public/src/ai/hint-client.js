import {requestAI,newRequestId} from './client.js';
import {buildHintInput,currentHintTarget,hintCandidates,hintKey,hintsFor,recordHint,resolveHintTarget,validHintOutput} from '../learning/hints.js';

export function createHintController({getState,update,catalog,ui,rerender,request=requestAI,canWrite=()=>true,now=()=>new Date().toISOString()}){
 let token=0,controller=null,finish=null;
 function cancel(){token++;controller?.abort();finish?.({status:'canceled'});controller=null;finish=null;ui.hintLoading=false;}
 async function ask(){
  if(ui.role!=='learner'||ui.hintLoading||!canWrite())return;
  const state=getState(),target=currentHintTarget(state);let context;
  try{context=resolveHintTarget(state,target,catalog);}catch{return;}
  const step=hintsFor(state,target).length+1;if(step>3)return;
  cancel();const active=token;controller=new AbortController();ui.hintLoading=true;rerender();
  const input=buildHintInput({...context,step,requestId:newRequestId(),inputRevision:state.revision});
  let timer;
  const deadline=new Promise(resolve=>{finish=resolve;timer=setTimeout(()=>{controller?.abort();resolve({status:'failed'});},5500);});
  let result;
  try{result=ui.health?.aiConfigured===false?{status:'failed'}:await Promise.race([request(input,{signal:controller.signal,timeoutMs:5000}),deadline]);}
  catch{result={status:'failed'};}
  finally{clearTimeout(timer);}
  if(token!==active)return;
  ui.hintLoading=false;controller=null;finish=null;
  if(ui.role!=='learner'||!canWrite()||hintKey(currentHintTarget(getState()))!==hintKey(target))return;
  try{
   resolveHintTarget(getState(),target,catalog);
   const valid=result.status==='ok'&&result.requestId===input.requestId&&result.inputRevision===input.inputRevision&&validHintOutput(input,result.output);
   const hintId=valid?result.output.hintId:hintCandidates(context.question,step)[0].id;
   update(s=>recordHint(s,{target,step,hintId,source:valid?'ai':'fallback',at:now()},{catalog}));
  }catch{ /* 답을 제출했거나 화면이 바뀐 뒤 온 힌트는 기록하지 않는다. */ }
  rerender();
 }
 return {ask,cancel};
}

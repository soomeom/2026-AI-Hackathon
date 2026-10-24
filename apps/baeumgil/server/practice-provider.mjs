import { createGeminiTransport, AIProviderError } from './gemini-transport.mjs';
import { AI_CONCEPTS, validateLinearPractice } from '../public/src/learning/linear-practice.js';
const only=(o,fields)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>fields.includes(k));
const id=v=>typeof v==='string'&&v.trim().length>0&&v.length<=200;
// Keep generation in a small, varied subset of the validator's larger safe grammar.
// A schema improves syntax/bounds; independent algebra checks remain mandatory.
export function buildPracticeSchema(conceptId) {
 const integer=(minimum,maximum)=>({type:'INTEGER',minimum,maximum});
 const object=properties=>({type:'OBJECT',properties,required:Object.keys(properties)});
 const node=(types,properties={})=>object({type:{type:'STRING',enum:types},...properties});
 const variable=()=>node(['variable']);
 const literal=(lo=-6,hi=6)=>node(['integer'],{value:integer(lo,hi)});
 const term=(lo=1,hi=4)=>node(['scale'],{factor:integer(lo,hi),expression:variable()});
 const combine=(types,left,right)=>node(types,{left,right});
 const expression=conceptId==='roadmap-like-terms'
   ?combine(['add','subtract'],combine(['add'],term(),term()),literal())
   :combine(['subtract'],node(['scale'],{factor:integer(2,4),expression:combine(['add','subtract'],variable(),literal(-2,2))}),combine(['add','subtract'],variable(),literal(-2,2)));
 return object({version:integer(1,1),conceptId:{type:'STRING',enum:[conceptId]},expression,
   options:{type:'ARRAY',items:combine(['add','subtract'],term(1,9),literal(-12,12)),minItems:4,maxItems:4},
   claimedAnswer:object({a:integer(-50,50),b:integer(-50,50)}),focus:{type:'STRING',enum:[conceptId==='roadmap-like-terms'?'like_terms':'minus_parentheses']}});
}
export function validatePracticeInput(i,catalog) {
 if(!only(i,['requestId','inputRevision','assessmentId','cardId','conceptId','baseQuestionId','evidence'])||![i.requestId,i.assessmentId,i.cardId].every(id)||!Number.isSafeInteger(i.inputRevision)||i.inputRevision<0||!AI_CONCEPTS.includes(i.conceptId))return false;
 const bundle=catalog.diagnostic.learningBundles.find(b=>b.conceptId===i.conceptId&&`${b.domain}:${b.conceptId}`===i.cardId);
 const questions=catalog.questions,base=questions.find(q=>q.id===i.baseQuestionId);
 if(!bundle?.questionIds.includes(i.baseQuestionId)||!base?.conceptIds.includes(i.conceptId)||base.contentStatus!=='approved')return false;
 if(!Array.isArray(i.evidence)||i.evidence.length>3)return false;
 return i.evidence.every(e=>{
   const q=questions.find(q=>q.id===e?.questionId);
   if(!only(e,['questionId','result','choiceId','helpUsed'])||!q?.conceptIds.includes(i.conceptId)||q.contentStatus!=='approved'||typeof e.helpUsed!=='boolean')return false;
   if(e.result==='abstained')return e.choiceId===null;
   const c=q.choices.find(c=>c.id===e.choiceId);
   return c&&['correct','incorrect'].includes(e.result)&&(String(c.value)===String(q.answer))===(e.result==='correct');
 });
}
export function createPracticeProvider({catalog,transport=createGeminiTransport()}={}) {
 return {configured:transport.configured,model:transport.model,async generate(input,{signal}={}) {
  if(!validatePracticeInput(input,catalog))throw new AIProviderError('invalid_practice_input',400);
  const prompt=`Create ONE new Korean middle-school algebra practice specification. Return only JSON, no prose. Do not diagnose the learner. Use the observed registered responses only to suggest a suitable expression and plausible distractors.\nAllowed AST: {type:"integer",value:integer -12..12}, {type:"variable"}, {type:"add"|"subtract",left:AST,right:AST}, {type:"scale",factor:nonzero integer -9..9,expression:AST}. Max depth 4 (root 0), nodes 32, final |a|,|b|<=50, a!=0. Output {version:1,conceptId:"${input.conceptId}",expression:AST,options:[AST,AST,AST,AST],claimedAnswer:{a:integer,b:integer},focus:"like_terms"|"distributive"|"minus_parentheses"}. Exactly one option equals the expression, all four options must have different (a,b). For roadmap-like-terms: focus like_terms, at least two variable terms, no scaling of sums and no subtraction of sums. For roadmap-linear-sum: focus distributive requires scaling a sum/difference; focus minus_parentheses requires subtracting a sum/difference. Do not add any other keys.\nEvidence: ${JSON.stringify(input.evidence.map(e=>({...e,question:catalog.questions.find(q=>q.id===e.questionId).prompt,selected:catalog.questions.find(q=>q.id===e.questionId).choices.find(c=>c.id===e.choiceId)?.text??null})))}`;
  const variable={type:'variable'},integer=value=>({type:'integer',value}),scale=(factor,expression)=>({type:'scale',factor,expression}),add=(left,right)=>({type:'add',left,right}),subtract=(left,right)=>({type:'subtract',left,right});
  const example={version:1,conceptId:input.conceptId,expression:input.conceptId==='roadmap-like-terms'?add(subtract(scale(4,variable),scale(2,variable)),integer(3)):subtract(scale(3,add(variable,integer(2))),subtract(variable,integer(1))),
    options:input.conceptId==='roadmap-like-terms'?[add(scale(2,variable),integer(3)),add(scale(6,variable),integer(3)),add(scale(2,variable),integer(-3)),add(scale(6,variable),integer(-3))]:[add(scale(2,variable),integer(7)),add(scale(2,variable),integer(5)),add(scale(4,variable),integer(7)),add(scale(4,variable),integer(5))],
    claimedAnswer:{a:2,b:input.conceptId==='roadmap-like-terms'?3:7},focus:input.conceptId==='roadmap-like-terms'?'like_terms':'minus_parentheses'};
  const guidance=`\nIMPORTANT: variable nodes have ONLY the type key: {"type":"variable"}; never add value:"x". Bounds apply to EVERY option as well as the question. Prefer small coefficients -5..5 in the question and -9..9 in options; factor:10 is invalid even as a distractor. Avoid scale factor 0. For subtraction use subtract with a positive right-hand term instead of adding a negative factor where possible. Complete valid example (vary its numbers and structure; do not copy this example or the registered question): ${JSON.stringify(example)}`;
  const {text,model}=await transport.generate({contents:[{role:'user',parts:[{text:prompt+guidance}]}],generationConfig:{responseMimeType:'application/json',responseSchema:buildPracticeSchema(input.conceptId),temperature:0.7}},{signal});
  let spec;try{spec=JSON.parse(text);}catch{throw new AIProviderError('ai_invalid_output');}
  const verified=validateLinearPractice(spec,{conceptId:input.conceptId});
  if(!verified.ok)throw new AIProviderError('ai_invalid_output');
  return {...verified,model};
 }};
}

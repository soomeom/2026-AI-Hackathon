import {readFileSync} from 'node:fs';
import {mergeCatalogParts} from '../public/src/content/catalog.js';
export const n = value => ({type:'integer',value});
export const x = {type:'variable'};
export const add = (left,right) => ({type:'add',left,right});
export const sub = (left,right) => ({type:'subtract',left,right});
export const scale = (factor,expression) => ({type:'scale',factor,expression});
export const expr = (a,b) => add(scale(a,x),n(b));
export const sample = (conceptId='roadmap-linear-sum') => ({version:1,conceptId,
  expression:conceptId==='roadmap-linear-sum'?sub(scale(2,add(x,n(3))),sub(x,n(1))):sub(add(scale(3,x),scale(2,x)),n(4)),
  options:conceptId==='roadmap-linear-sum'?[expr(1,7),expr(1,5),expr(3,7),expr(3,5)]:[expr(5,-4),expr(5,4),expr(1,-4),expr(1,4)],
  claimedAnswer:conceptId==='roadmap-linear-sum'?{a:1,b:7}:{a:5,b:-4},focus:conceptId==='roadmap-linear-sum'?'minus_parentheses':'like_terms'});


export const catalog=mergeCatalogParts(['questions','concepts','routes','review','exam-bank'].map(n=>JSON.parse(readFileSync(new URL(`../public/src/content/${n}.json`,import.meta.url)))));
export const inputFor=(conceptId='roadmap-linear-sum')=>({requestId:'req-1',inputRevision:3,assessmentId:'assessment-1',cardId:`${catalog.diagnostic.learningBundles.find(b=>b.conceptId===conceptId).domain}:${conceptId}`,conceptId,baseQuestionId:conceptId,evidence:[{questionId:conceptId,result:'incorrect',choiceId:'b',helpUsed:false}]});

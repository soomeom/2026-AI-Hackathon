// Explicit opt-in smoke check: synthetic registered answers only, never browser/user records.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {mergeCatalogParts} from '../public/src/content/catalog.js';
const origin=process.argv.find(a=>a.startsWith('--url='))?.slice(6)??'http://127.0.0.1:4174';
const count=Number(process.argv.find(a=>a.startsWith('--count='))?.slice(8)??1);
if(!process.argv.includes('--live')||!Number.isInteger(count)||count<1||count>5)throw new Error('Use --live --count=1..5; this calls the configured AI provider.');
const catalog=mergeCatalogParts(['questions','concepts','routes','review','exam-bank'].map(n=>JSON.parse(readFileSync(new URL(`../public/src/content/${n}.json`,import.meta.url)))));
const rows=[];
for(const conceptId of ['roadmap-like-terms','roadmap-linear-sum'])for(let i=0;i<count;i++) {
 const bundle=catalog.diagnostic.learningBundles.find(b=>b.conceptId===conceptId);
 const input={requestId:`smoke-${Date.now()}-${i}`,inputRevision:0,assessmentId:'synthetic-smoke-check',cardId:`${bundle.domain}:${conceptId}`,conceptId,baseQuestionId:conceptId,evidence:[{questionId:conceptId,result:'incorrect',choiceId:'b',helpUsed:false}]};
 const started=performance.now();const res=await fetch(`${origin}/api/practice`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});const body=await res.json();
 const row={conceptId,status:body.status,code:body.error?.code??null,elapsedMs:Math.round(performance.now()-started),model:body.model??null,validatorVersion:body.validatorVersion??null};rows.push(row);console.log(JSON.stringify(row));
}
mkdirSync('preview',{recursive:true});writeFileSync('preview/ai-practice-live-check.json',JSON.stringify({checkedAt:new Date().toISOString(),synthetic:true,rows},null,2));

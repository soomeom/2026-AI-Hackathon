import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeCatalogParts } from '../public/src/content/catalog.js';
import { createPracticeProvider, validatePracticeInput } from '../server/practice-provider.mjs';
import { createAppServer } from '../server.mjs';
import {sample,catalog,inputFor} from './practice-fixtures.js';
test('provider verifies server catalog mapping and algebra before accepting output',async()=>{
 const input=inputFor(); input.cardId=`${catalog.diagnostic.learningBundles.find(b=>b.conceptId===input.conceptId).domain}:${input.conceptId}`;
 assert.equal(validatePracticeInput(input,catalog),true);
 const p=createPracticeProvider({catalog,transport:{configured:true,model:'test',generate:async()=>({text:JSON.stringify(sample()),model:'test'})}});
 assert.equal((await p.generate(input)).question.kind,'ai_generated');
 for(const bad of [{...input,baseQuestionId:'q-eq-1'},{...input,note:'instruction'},{...input,evidence:[{questionId:input.conceptId,result:'correct',choiceId:'not-real',helpUsed:false}]}])assert.equal(validatePracticeInput(bad,catalog),false);
 const bad=sample();bad.claimedAnswer.b=2;
 const wrong=createPracticeProvider({catalog,transport:{configured:true,generate:async()=>({text:JSON.stringify(bad)})}});
 await assert.rejects(wrong.generate(input),/ai_invalid_output/);
});
test('generation prompt supplies a complete bounded example with exact variable fields',async()=>{
 let prompt,config;
 const provider=createPracticeProvider({catalog,transport:{configured:true,generate:async body=>{prompt=body.contents[0].parts[0].text;config=body.generationConfig;return {text:JSON.stringify(sample('roadmap-like-terms'))};}}});
 await provider.generate(inputFor('roadmap-like-terms'));
 assert.match(prompt,/Complete valid example/);assert.match(prompt,/variable nodes have ONLY/);
 assert.match(prompt,/minified JSON/);
 assert.equal(config.responseSchema.properties.options.minItems,4);
});
function followsSchema(value,schema){
 if(schema.type==='OBJECT')return value&&typeof value==='object'&&!Array.isArray(value)&&schema.required.every(k=>Object.hasOwn(value,k))&&Object.entries(value).every(([k,v])=>schema.properties[k]&&followsSchema(v,schema.properties[k]));
 if(schema.type==='ARRAY')return Array.isArray(value)&&value.length>=schema.minItems&&value.length<=schema.maxItems&&value.every(v=>followsSchema(v,schema.items));
 if(schema.type==='INTEGER')return Number.isSafeInteger(value)&&value>=schema.minimum&&value<=schema.maximum;
 if(schema.type==='STRING')return typeof value==='string'&&(!schema.enum||schema.enum.includes(value));
 return false;
}
test('every supplied example follows its own output schema and independent math checks',async()=>{
 const {validateLinearPractice}=await import('../public/src/learning/linear-practice.js');
 for(const conceptId of ['roadmap-like-terms','roadmap-linear-sum']){
  let body;
  const p=createPracticeProvider({catalog,transport:{configured:true,generate:async b=>{body=b;return {text:JSON.stringify(sample(conceptId))};}}});
  await p.generate(inputFor(conceptId));
  const match=body.contents[0].parts[0].text.match(/Complete valid example[^:\n]*:\s*(\{.*\})/);
  assert.ok(match,'one complete JSON example is present');const example=JSON.parse(match[1]);
  assert.equal(followsSchema(example,body.generationConfig.responseSchema),true,`${conceptId} example contradicts schema`);
  assert.equal(validateLinearPractice(example,{conceptId}).ok,true,`${conceptId} example has wrong algebra`);
 }
});
test('practice HTTP echoes identity, blocks origins, enforces deadline and releases slots',async t=>{
 let pending=false;
 const p={configured:true,generate:async()=>pending?new Promise(()=>{}):({spec:sample(),model:'test'})};
 const server=createAppServer({catalog,practiceProvider:p,practiceTimeoutMs:25});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 const url=`http://127.0.0.1:${server.address().port}/api/practice`;
 const input=inputFor();input.cardId=`${catalog.diagnostic.learningBundles.find(b=>b.conceptId===input.conceptId).domain}:${input.conceptId}`;
 const post=(headers={})=>fetch(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(input)});
 let res=await post();assert.equal(res.status,200);let body=await res.json();assert.equal(body.cardId,input.cardId);assert.equal(body.inputRevision,3);assert.equal(body.question.kind,'ai_generated');
 assert.equal((await post({origin:'https://foreign.test'})).status,403);
 pending=true;const timed=await Promise.all(Array.from({length:5},()=>post().then(r=>r.json())));assert.ok(timed.some(x=>x.error.code==='ai_busy'));assert.ok(timed.some(x=>x.error.code==='ai_timeout'));
 pending=false;assert.equal((await post()).status,200);
});

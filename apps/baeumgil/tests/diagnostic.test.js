import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {startDiagnostic,submitDiagnostic,diagnosticReport,validateDiagnostic} from '../public/src/learning/diagnostic.js';
const read=n=>JSON.parse(readFileSync(new URL('../public/src/content/'+n,import.meta.url)));
const bank=read('questions.json').questions,config=read('diagnostic.json');
const katex=createRequire(import.meta.url)('../public/vendor/katex/katex.min.js');
function send(s,correct=true,extra={}){const q=bank.find(q=>q.id===s.currentId);return submitDiagnostic(s,{id:`a${s.attempts.length}`,questionId:q.id,choiceId:q.choices.find(c=>(c.value===q.answer)===correct).id,...extra},bank,config);}
test('approved diagnostic graph, asset paths and every LaTeX expression validate',()=>{
 validateDiagnostic(bank,config);
 for(const q of bank.filter(q=>q.role==='diagnostic')){
  assert(!/[\uE000-\uF8FF]/.test(JSON.stringify(q)));
  for(const text of [q.prompt,...q.solutionSteps,...q.choices.map(c=>c.latex?`$${c.latex}$`:c.text)]) for(const [i,s] of text.split('$').entries())if(i%2)assert.doesNotThrow(()=>katex.renderToString(s,{throwOnError:true}));
  for(const path of [q.sourceImage,q.figure?.src].filter(Boolean))assert(existsSync(new URL('../public'+path,import.meta.url)),path);
 }
});
test('wrong high-school answer immediately moves to lower prerequisite',()=>{const s=startDiagnostic(bank,config),next=send(s,false);const q=bank.find(q=>q.id===s.currentId);assert.equal(next.currentId,q.fallback_question_id);assert(bank.find(q=>q.id===next.currentId).level<3);assert.equal(s.attempts.length,0);});
test('all correct visits six domains and requires two responses per high-school domain',()=>{let s=startDiagnostic(bank,config);while(s.status==='active')s=send(s);assert.equal(s.attempts.length,12);const r=diagnosticReport(s,bank,config);assert(r.allDomainsCompleted);assert(r.domains.every(d=>d.demonstrated===3));});
test('all wrong and all abstained terminate without mastered tier',()=>{for(const abstained of [false,true]){let s=startDiagnostic(bank,config);while(s.status==='active')s=send(s,false,{abstained});assert(s.attempts.length<=config.maxQuestions);assert(diagnosticReport(s,bank,config).domains.every(d=>d.demonstrated===0));}});
test('high failures then middle successes yield middle evidence',()=>{let s=startDiagnostic(bank,config);while(s.status==='active')s=send(s,bank.find(q=>q.id===s.currentId).level<3);const r=diagnosticReport(s,bank,config);assert(r.domains.every(d=>d.demonstrated>0&&d.demonstrated<3));});
test('seen and assisted correct answers do not count as independent evidence',()=>{for(const helped of [true,false]){let s=startDiagnostic(bank,config,{previouslySeen:helped?[]:bank.map(q=>q.id)});while(s.status==='active')s=send(s,true,{helpUsed:helped});assert(diagnosticReport(s,bank,config).domains.every(d=>d.demonstrated===0));}});
test('rejects empty, stale submissions and closed session; duplicate is idempotent',()=>{let s=startDiagnostic(bank,config);assert.throws(()=>submitDiagnostic(s,{id:'x',questionId:s.currentId},bank,config));assert.throws(()=>submitDiagnostic(s,{id:'x',questionId:'other',choiceId:'a'},bank,config));s=send(s);assert.equal(submitDiagnostic(s,{id:'a0'},bank,config),s);while(s.status==='active')s=send(s);assert.throws(()=>send(s));});
test('question cap never labels unvisited domains completed',()=>{const c={...config,maxQuestions:1};const s=send(startDiagnostic(bank,c));const result=submitDiagnostic(startDiagnostic(bank,c),{id:'x',questionId:config.domains[0].rootQuestionId,choiceId:'a'},bank,c);assert.equal(result.status,'completed');assert.equal(diagnosticReport(result,bank,c).allDomainsCompleted,false);});
test('imported answer keys match the final supplied key',()=>{const keys=JSON.parse(readFileSync(new URL('../data/exam-sources/math-answer-keys.json',import.meta.url))).keys;for(const q of bank.filter(q=>q.role==='diagnostic'&&q.kind==='official')){const k=keys.find(k=>k.examId===q.reference.providedFile);assert.equal(Number(q.answer),k.answers.find(a=>a.questionNumber===q.reference.questionNumber).choiceNumber);assert.equal(k.reviewStatus,'visual_verified');}});
test('도움·재노출로만 맞힌 영역은 낮은 수준이 아니라 판단 보류로 표시한다',()=>{let s=startDiagnostic(bank,config);while(s.status==='active')s=send(s,true,{helpUsed:true});const r=diagnosticReport(s,bank,config);assert(r.domains.every(d=>d.evidence==='insufficient'&&d.label==='판단 보류 · 도움 없이 푼 응답 부족'));assert.equal(r.tier,'판단 보류 · 도움 없이 푼 응답이 부족해요');});
test('모두 틀린 영역은 판단 보류가 아니라 기초 추가 확인으로 표시한다',()=>{let s=startDiagnostic(bank,config);while(s.status==='active')s=send(s,false);const r=diagnosticReport(s,bank,config);assert(r.domains.every(d=>d.evidence==='not_demonstrated'&&d.label==='기초 추가 확인 필요'));});
test('판단 보류 영역은 전체 수준 계산에서 빼고 수를 따로 알린다',()=>{let s=startDiagnostic(bank,config);let first=true;while(s.status==='active'){const d=bank.find(q=>q.id===s.currentId).domain;s=send(s,true,{helpUsed:d!=='algebra'});first=false;}const r=diagnosticReport(s,bank,config);assert.equal(r.insufficientDomains,5);assert.equal(r.domains.find(d=>d.id==='algebra').demonstrated,3);assert.match(r.tier,/판단 보류 5영역/);});

import { readFileSync } from 'node:fs';
import { validateCatalog, validateExamRoutes, mergeCatalogParts, listAssignableQuestions } from '../public/src/content/catalog.js';
import { validateDiagnostic } from '../public/src/learning/diagnostic.js';

const content = new URL('../public/src/content/', import.meta.url);
const catalog = mergeCatalogParts(['questions.json', 'concepts.json', 'routes.json', 'review.json', 'exam-bank.json']
  .map(name => JSON.parse(readFileSync(new URL(name, content), 'utf8'))));
const config=JSON.parse(readFileSync(new URL('diagnostic.json',content),'utf8'));
const errors=[...validateCatalog(catalog).errors,...validateExamRoutes(catalog).errors];
try{validateDiagnostic(catalog.questions,config);}catch(error){errors.push({code:'invalidDiagnostic',message:error.message});}
if(JSON.stringify(config)!==JSON.stringify(catalog.diagnostic))errors.push({code:'staleDiagnosticCopy',message:'exam-bank.json의 진단 설정을 다시 생성해야 합니다.'});
const result={ok:errors.length===0,errors};
console.log(JSON.stringify({
  ok: result.ok,
  assignableCount: listAssignableQuestions(catalog).length,
  note: '출제 가능 수는 자체 제작 문항을 포함합니다. 공식 기출 확보 수와 다릅니다.',
  errors: result.errors,
}, null, 2));
if (!result.ok) process.exitCode = 1;

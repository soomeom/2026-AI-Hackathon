import { readFileSync } from 'node:fs';
import { validateCatalog, listAssignableQuestions } from '../public/src/content/catalog.js';

const content = new URL('../public/src/content/', import.meta.url);
const catalog = Object.assign({}, ...['questions.json', 'concepts.json', 'routes.json', 'review.json']
  .map(name => JSON.parse(readFileSync(new URL(name, content), 'utf8'))));
const result = validateCatalog(catalog);
console.log(JSON.stringify({
  ok: result.ok,
  assignableCount: listAssignableQuestions(catalog).length,
  note: '출제 가능 수는 자체 제작 문항을 포함합니다. 공식 기출 확보 수와 다릅니다.',
  errors: result.errors,
}, null, 2));
if (!result.ok) process.exitCode = 1;

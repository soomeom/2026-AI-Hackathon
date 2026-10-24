import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLinear, validateLinearPractice } from '../public/src/learning/linear-practice.js';
import {n,x,add,sub,scale,expr,sample} from './practice-fixtures.js';

test('exact integer normalization and both concepts produce canonical verified questions',()=>{
  assert.deepEqual(normalizeLinear(sample().expression),{a:1,b:7});
  assert.deepEqual(normalizeLinear(sample('roadmap-like-terms').expression),{a:5,b:-4});
  for(const id of ['roadmap-linear-sum','roadmap-like-terms']) {
    const v=validateLinearPractice(sample(id),{conceptId:id}); assert.equal(v.ok,true); assert.equal(v.question.kind,'ai_generated'); assert.equal(v.question.choices.length,4);
  }
});
test('wrong claimed answer and semantically duplicate options are rejected',()=>{
  const s=sample(); s.claimedAnswer.b=8; assert.equal(validateLinearPractice(s).ok,false);
  const d=sample(); d.options[1]=add(n(7),x); assert.equal(validateLinearPractice(d).ok,false);
});
test('unsafe AST, non-linear, decimals, deep/wide, constants and concept mismatch are rejected',()=>{
  for(const expression of [{type:'multiply',left:x,right:x},n(1.2),scale(0,x),scale(10,x),n(13),sub(x,x),expr(9,50),{type:'variable',html:'<script>'}]) {
    assert.equal(validateLinearPractice({...sample(),expression}).ok,false,JSON.stringify(expression));
  }
  let deep=x; for(let i=0;i<6;i++)deep=add(deep,x);
  assert.equal(validateLinearPractice({...sample(),expression:deep}).ok,false);
  assert.equal(validateLinearPractice(sample(),{conceptId:'roadmap-like-terms'}).ok,false);
  assert.equal(validateLinearPractice({...sample('roadmap-like-terms'),expression:expr(3,2)}).ok,false);
  assert.equal(validateLinearPractice({...sample(),options:[]}).ok,false);
});

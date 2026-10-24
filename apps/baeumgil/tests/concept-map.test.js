import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeCatalogParts } from '../public/src/content/catalog.js';
import * as maps from '../public/src/learning/concept-map.js';
import { startDiagnostic, submitDiagnostic } from '../public/src/learning/diagnostic.js';
import { buildRoadmap } from '../public/src/learning/roadmap.js';

const catalog = mergeCatalogParts(['questions','concepts','routes','review','exam-bank'].map(name =>
  JSON.parse(readFileSync(new URL(`../public/src/content/${name}.json`, import.meta.url), 'utf8'))));
const { questions: bank, diagnostic: config } = catalog;

test('map keeps direct prerequisite edges and both distance branches without inventing shortcuts', () => {
  assert.equal(typeof maps.buildConceptMap, 'function');
  const map = maps.buildConceptMap(null, bank, config);
  const byTitle = title => map.nodes.find(n => n.title === title).id;
  const edge = (a,b) => map.edges.some(e => e.from === byTitle(a) && e.to === byTitle(b));
  assert.ok(edge('동류항 정리','일차식의 계산'));
  assert.ok(edge('일차식의 계산','다항식의 덧셈'));
  assert.equal(edge('동류항 정리','다항식의 덧셈'), false);
  assert.ok(edge('피타고라스 정리와 좌표 거리','점과 직선 사이의 거리'));
  assert.ok(edge('직선의 방정식 기본형','점과 직선 사이의 거리'));
  assert.ok(edge('진리집합의 포함 관계','필요조건'));
  assert.ok(edge('일차함수의 기본 개념과 함숫값','합성함수'));
  assert.equal(new Set(map.nodes.map(n=>n.id)).size,map.nodes.length);
  assert.equal(new Set(map.edges.map(e=>`${e.from}>${e.to}`)).size,map.edges.length);
  assert.ok(map.nodes.every(n=>n.status==='unmeasured' && !n.cardId));
});

test('map separates practice completion from diagnostic evidence and never mutates saved inputs', () => {
  assert.equal(typeof maps.buildConceptMap, 'function');
  let d = startDiagnostic(bank,config);
  for (let i=0;i<3;i++) d=submitDiagnostic(d,{id:`a${i}`,questionId:d.currentId,abstained:true},bank,config);
  const p={attempts:['roadmap-like-terms','roadmap-like-terms-practice'].map(questionId=>({cardId:'algebra:roadmap-like-terms',questionId,result:'correct'}))};
  const roadmap=buildRoadmap(d,bank,config,p), before=JSON.stringify({roadmap,bank,config});
  const map=maps.buildConceptMap(roadmap,bank,config);
  const node=map.nodes.find(n=>n.id==='algebra:roadmap-like-terms');
  assert.equal(node.status,'needs_learning');
  assert.equal(node.practiceComplete,true);
  assert.equal(node.cardId,'algebra:roadmap-like-terms');
  assert.ok(map.nodes.some(n=>n.status==='unmeasured'));
  assert.equal(JSON.stringify({roadmap,bank,config}),before);
  const path=maps.selectMapNodes(map,{scope:'path',nodeId:node.id});
  assert.deepEqual(path.map(n=>n.title).sort(),['다항식의 덧셈','동류항 정리','일차식의 계산'].sort());
  assert.ok(maps.selectMapNodes(map,{scope:'domain',domainId:'geometry'}).every(n=>n.domain==='geometry'));
});

test('all-correct diagnosis leaves unasked prerequisites unmeasured and old cards remain accessible', () => {
  assert.equal(typeof maps.buildConceptMap,'function');
  let d=startDiagnostic(bank,config);
  while(d.status==='active') {
    const q=bank.find(q=>q.id===d.currentId);
    d=submitDiagnostic(d,{id:`a${d.attempts.length}`,questionId:q.id,choiceId:q.choices.find(c=>c.value===q.answer).id},bank,config);
  }
  const roadmap=buildRoadmap(d,bank,config);
  const map=maps.buildConceptMap(roadmap,bank,config);
  assert.equal(map.nodes.filter(n=>n.status==='mastered').length,12);
  assert.ok(map.nodes.filter(n=>n.level<3).every(n=>n.status==='unmeasured'));
  assert.equal(map.nextNodeId,null);
  const legacy={...roadmap,recheck:[{id:'old:c',domain:'old',conceptId:'c',title:'이전 개념',level:2,status:'needs_recheck',questionIds:[],practiceComplete:false}]};
  assert.ok(maps.buildConceptMap(legacy,bank,config).nodes.some(n=>n.id==='old:c'&&n.cardId==='old:c'));
  assert.deepEqual(maps.buildConceptMap(null,[],null).nodes,[]);
});

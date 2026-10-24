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

test('learner map shows only the current domain path; other domains live in the overview dialog', async () => {
  const { renderConceptMap, growthCount, focusNodeOf, chapterSummary } = await import('../public/src/ui/concept-map.js');
  let d=startDiagnostic(bank,config);
  for (let i=0;i<3;i++) d=submitDiagnostic(d,{id:`a${i}`,questionId:d.currentId,abstained:true},bank,config);
  const map=maps.buildConceptMap(buildRoadmap(d,bank,config),bank,config);
  const next=map.nodes.find(n=>n.id===map.nextNodeId);
  const html=renderConceptMap(map,{},{cards:[],canPractice:false});
  assert.equal((html.match(/class="map-focus"/g)??[]).length,1);
  assert.equal((html.match(/class="map-row"/g)??[]).length,0);
  assert.match(html,/id="map-course"[^>]*data-map-action="overview"/);
  assert.match(html,/1\. 수와 다항식/);
  assert.doesNotMatch(html,/role="dialog"/);
  assert.match(html,/id="map-detail-title"/);
  assert.ok(html.indexOf(next.title)>html.indexOf('map-focus'));
  const other=config.domains[1].id;
  const switched=renderConceptMap(map,{mapDomainId:other,mapNodeId:next.id},{cards:[],canPractice:false});
  assert.match(switched,new RegExp(`2\\. ${config.domains[1].name}`));
  assert.match(switched,new RegExp(`data-map-action="domain" data-map-value="${config.domains[0].id}" aria-label="이전 영역`));
  assert.doesNotMatch(switched,new RegExp(`data-map-node="${next.id}"`),'다른 영역의 개념은 메인 화면에 그리지 않는다');
  const open=renderConceptMap(map,{mapOverviewOpen:true},{cards:[],canPractice:false,cta:'<div class="map-cta">진단 진행 중</div>'});
  assert.match(open,/role="dialog" aria-modal="true"/);
  assert.equal((open.match(/class="map-chapter[ "]/g)??[]).length,config.domains.length);
  assert.ok(open.includes(`data-map-node="${next.id}"`),'전체 보기 창에서는 모든 개념이 점으로 보인다');
  assert.match(open,/중졸 검정고시 수학/);assert.match(open,/진단 진행 중/);
  const algebra=map.nodes.filter(n=>n.domain==='algebra').sort((a,b)=>a.level-b.level);
  assert.equal(chapterSummary(algebra),`${algebra[0].title}에서 시작해 ${[...new Set(algebra.filter(n=>n.level===3).map(n=>n.title))].join(' · ')}까지 이어져요.`);
  assert.equal(focusNodeOf(map,next.domain).id,next.id);
  const mentor=renderConceptMap(map,{},{cards:[],canPractice:false,mentor:true});
  assert.doesNotMatch(mentor,/class="map-focus"/);
  assert.equal((mentor.match(/class="map-row"/g)??[]).length,config.domains.length);
  assert.match(mentor,/id="map-detail"/);
  const practiced={...map,nodes:map.nodes.map(n=>n.id===next.id?{...n,practiceComplete:true}:n)};
  assert.equal(growthCount(practiced),growthCount(map),'보충 연습 완료는 성장 수에 넣지 않는다');
});

test('lesson panel lists every diagnostic and review question with its result without clicking', async () => {
  const { renderConceptMap, lessonRows } = await import('../public/src/ui/concept-map.js');
  let d=startDiagnostic(bank,config);
  for (let i=0;i<3;i++) d=submitDiagnostic(d,{id:`a${i}`,questionId:d.currentId,abstained:true},bank,config);
  const practice={attempts:[{cardId:'algebra:roadmap-like-terms',questionId:'roadmap-like-terms',result:'correct',helpUsed:true}]};
  const roadmap=buildRoadmap(d,bank,config,practice);
  const map=maps.buildConceptMap(roadmap,bank,config);
  const node=map.nodes.find(n=>n.id==='algebra:roadmap-like-terms');
  const cards=[...roadmap.domains.flatMap(x=>x.steps.flatMap(s=>s.cards)),...roadmap.recheck];
  const entries=d.attempts.map(a=>({questionId:a.questionId,result:a.result,independent:a.independent}));
  const rows=lessonRows(node,{cards,entries,practice,questions:bank});
  assert.deepEqual(rows.diagnostic.map(r=>r.result),['abstained']);
  assert.deepEqual(rows.review.map(r=>r.result),['helped','todo']);
  const html=renderConceptMap(map,{mapNodeId:node.id},{cards,canPractice:true,entries,practice,questions:bank});
  assert.match(html,/진단에서 푼 문제/);assert.match(html,/보충 연습 문제 <small>1\/2/);
  assert.match(html,/아직 안 풂/);assert.match(html,/모름/);assert.match(html,/50%/);
  assert.match(html,/연습 1\/2/,'경로 줄에도 진행 수가 보인다');
  assert.match(html,/class="primary map-practice" data-roadmap-action="open" data-roadmap-card="algebra:roadmap-like-terms" data-roadmap-question="roadmap-like-terms-practice"/,'안 푼 문제부터 연다');
});

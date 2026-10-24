import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeCatalogParts } from '../public/src/content/catalog.js';
import { buildConceptMap } from '../public/src/learning/concept-map.js';
import { startDiagnostic, submitDiagnostic } from '../public/src/learning/diagnostic.js';
import { buildRoadmap } from '../public/src/learning/roadmap.js';
import { relationLayout, studyOrder, relationViewBox, relationTarget, relationChain, renderRelationMap, RELATION_HEIGHT } from '../public/src/ui/relation-map.js';

const catalog = mergeCatalogParts(['questions','concepts','routes','review','exam-bank'].map(name =>
  JSON.parse(readFileSync(new URL(`../public/src/content/${name}.json`, import.meta.url), 'utf8'))));
const { questions: bank, diagnostic: config } = catalog;
const diagnosed = () => {
  let d = startDiagnostic(bank, config);
  for (let i = 0; i < 3; i++) d = submitDiagnostic(d, { id: `a${i}`, questionId: d.currentId, abstained: true }, bank, config);
  return buildConceptMap(buildRoadmap(d, bank, config), bank, config);
};

test('layout puts every concept in its domain column, levels bottom-up, with no overlapping nodes', () => {
  const map = buildConceptMap(null, bank, config);
  const layout = relationLayout(map);
  assert.equal(layout.pos.size, map.nodes.length);
  assert.equal(layout.columns.length, config.domains.length);
  const seen = new Set();
  for (const n of map.nodes) {
    const p = layout.pos.get(n.id), col = layout.columns.find(c => c.id === n.domain);
    assert.ok(p.x > col.x && p.x < col.x + col.width, `${n.title}는 자기 영역 기둥 안`);
    const key = `${Math.round(p.x)}:${p.y}`; assert.ok(!seen.has(key), '겹치는 노드 없음'); seen.add(key);
  }
  const y = l => layout.pos.get(map.nodes.find(n => n.level === l).id).y;
  assert.ok(y(1) > y(2) && y(2) > y(3) && y(3) > layout.goal.y, '기초가 아래, 목표가 맨 위');
  assert.equal(layout.height, RELATION_HEIGHT);
  for (const e of map.edges) {
    const a = map.nodes.find(n => n.id === e.from), b = map.nodes.find(n => n.id === e.to);
    assert.equal(a.domain, b.domain, '선은 같은 기둥 안에서만 이어져 영역끼리 교차하지 않는다');
  }
});

test('study order starts at the diagnosis recommendation and only numbers concepts that need work', () => {
  const map = diagnosed();
  const order = studyOrder(map);
  assert.ok(order.length > 0);
  assert.equal(order[0], map.nextNodeId);
  assert.ok(order.every(id => ['needs_learning', 'needs_recheck'].includes(map.nodes.find(n => n.id === id).status)));
  assert.deepEqual(studyOrder(buildConceptMap(null, bank, config)), []);
});

test('zoom box contains the selected chain, keeps the map ratio and stays inside the map', () => {
  const map = diagnosed();
  const layout = relationLayout(map);
  const chain = [...relationChain(map, map.nextNodeId)];
  const box = relationTarget(map, layout, { relationZoom: true }, map.nextNodeId);
  for (const id of chain) {
    const p = layout.pos.get(id);
    assert.ok(p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h, '사슬 노드가 확대 영역 안');
  }
  assert.ok(Math.abs(box.w / box.h - layout.width / layout.height) < 0.01);
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= layout.width + 0.01 && box.y + box.h <= layout.height + 0.01);
  assert.ok(box.w >= layout.width * 0.4 - 0.01, '너무 크게 확대하지 않는다');
  assert.deepEqual(relationTarget(map, layout, { relationZoom: false }, map.nextNodeId), { x: 0, y: 0, w: layout.width, h: layout.height });
  assert.deepEqual(relationViewBox(layout, []), { x: 0, y: 0, w: layout.width, h: layout.height });
});

test('rendered map highlights the chain, dims the rest, and keeps the lesson panel and order chips', () => {
  const map = diagnosed();
  const html = renderRelationMap(map, {}, { cards: [], canPractice: false, entries: [], practice: null, questions: bank });
  assert.match(html, /class="rm-node needs_learning sel"/);
  assert.match(html, /rm-node [^"]* dim"/);
  assert.match(html, /role="button" tabindex="0"/);
  assert.match(html, /학습 순서 1 · 지금 여기/);
  assert.match(html, /id="map-detail"/);
  assert.match(html, /추천 학습 순서/);
  assert.match(html, /class="rm-chip needs_learning sel"/);
  assert.match(html, /고졸 검정고시 수학/);
  assert.match(html, /<ul class="sr-only" aria-label="영역별 개념 목록">/);
  assert.match(renderRelationMap(map, { relationZoom: true }, { cards: [], canPractice: false }), /data-map-value="on" aria-pressed="true"/);
});

test('completion seal appears only on fully completed concepts and domain seals require every concept',()=>{
  const map=diagnosed();
  assert.doesNotMatch(renderRelationMap(map,{},{}),/class="rm-seal"/);
  const first=map.nodes[0];first.courseComplete=true;
  let html=renderRelationMap(map,{},{});
  assert.match(html,/class="rm-seal"/);assert.match(html,/이수 완료 ·/);
  assert.doesNotMatch(html,/class="rm-domain-seal"/);
  map.nodes.filter(n=>n.domain===first.domain&&!n.legacy).forEach(n=>n.courseComplete=true);
  html=renderRelationMap(map,{},{});assert.match(html,/class="rm-domain-seal"/);
});

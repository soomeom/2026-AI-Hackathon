import { selectMapNodes } from '../learning/concept-map.js';
import { esc } from './text.js';

export const MAP_STATUS = { unmeasured: '미확인', needs_learning: '보완 필요', needs_recheck: '혼자 다시 확인', mastered: '진단 통과', confirmed: '선수 개념 확인' };

// Native HTML buttons provide keyboard access; the SVG only decorates direct edges.
export function renderConceptMap(map, ui, { cards, canPractice, entries = [] }) {
  const scope = ui.mapScope ?? 'path';
  const selected = map.nodes.find(n => n.id === ui.mapNodeId) ?? map.nodes.find(n => n.id === map.nextNodeId) ?? map.nodes[0];
  if (!selected) return '<p class="msg">아직 표시할 개념 자료가 없어요. 학습 화면에서 기존 기록을 확인할 수 있어요.</p>';
  const domainId = ui.mapDomainId ?? selected.domain;
  const nodes = selectMapNodes(map, { scope, domainId, nodeId: selected.id });
  const domains = [...new Map(map.nodes.map(n => [n.domain, n.domainName])).entries()];
  const positions = new Map();
  let row = 0;
  for (const [domain] of domains) {
    const group = nodes.filter(n => n.domain === domain);
    if (!group.length) continue;
    for (let level = 1; level <= 3; level++) group.filter(n => n.level === level).forEach((n, i) => positions.set(n.id, { x: 12 + (level - 1) * 340, y: 62 + (row + i) * 142 }));
    row += Math.max(...[1,2,3].map(level => group.filter(n => n.level === level).length));
  }
  const height = 70 + row * 142;
  const related = new Set([selected.id]);
  map.edges.forEach(e => { if (e.from === selected.id) related.add(e.to); if (e.to === selected.id) related.add(e.from); });
  const edges = map.edges.filter(e => positions.has(e.from) && positions.has(e.to)).map(e => {
    const a = positions.get(e.from), b = positions.get(e.to), start = a.x + 294, end = b.x;
    return `<path class="${e.from === selected.id || e.to === selected.id ? 'map-edge-selected' : ''}" d="M ${start} ${a.y+56} C ${(start+end)/2} ${a.y+56}, ${(start+end)/2} ${b.y+56}, ${end-6} ${b.y+56}" marker-end="url(#map-arrow)"/>`;
  }).join('');
  const card = cards.find(c => c.id === selected.cardId);
  const evidence = entries.filter(e => selected.evidenceQuestionIds.includes(e.questionId));
  const neighbours = (direction, label) => {
    const ids = map.edges.filter(e => e[direction === 'before' ? 'to' : 'from'] === selected.id).map(e => e[direction === 'before' ? 'from' : 'to']);
    return `<div class="map-relations"><h4>${label}</h4>${ids.length ? ids.map(id => `<button class="ghost small" data-map-action="select" data-map-node="${esc(id)}">${esc(map.nodes.find(n => n.id === id).title)} ${direction === 'before' ? '→' : ''}</button>`).join('') : '<p class="muted small">연결된 개념이 없어요.</p>'}</div>`;
  };
  return `<section class="concept-map" aria-labelledby="map-heading">
    <div class="map-toolbar"><div><p class="meta">개념의 연결을 따라, 기초부터</p><h3 id="map-heading" tabindex="-1">개념 관계 지도</h3></div>
      <div class="map-controls" aria-label="지도 표시 범위">${[['path','추천 경로'],['domain','영역별'],['all','전체 보기']].map(([id,label]) => `<button data-map-action="scope" data-map-value="${id}" aria-pressed="${scope===id}">${label}</button>`).join('')}</div></div>
    <p class="muted small">기초 → 선수 개념 → 고졸 개념으로 이어져요. 개념을 누르면 연결 이유와 학습 기록을 볼 수 있어요.</p>
    ${scope==='domain' ? `<div class="map-domains" aria-label="영역 선택">${domains.map(([id,name])=>`<button class="ghost small" data-map-action="domain" data-map-value="${esc(id)}" aria-pressed="${domainId===id}">${esc(name)}</button>`).join('')}</div>` : ''}
    <div class="map-legend">${Object.entries(MAP_STATUS).map(([status,label])=>`<span class="map-status ${status}">${label}</span>`).join('')}<span class="map-practice-label">✓ 보충 연습 완료는 별도 표시</span></div>
    <div class="map-canvas" style="--map-height:${height}px">
      <div class="map-columns"><span>Step 1 · 기초 다지기</span><span>Step 2 · 핵심 선수 개념</span><span>Step 3 · 고졸 기출</span></div>
      <svg class="map-edges" viewBox="0 0 1000 ${height}" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="map-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z"/></marker></defs>${edges}</svg>
      ${[...nodes].sort((a,b)=>a.level-b.level).map(n=>{const pos=positions.get(n.id); return `<button class="map-node ${esc(n.status)}${n.id===selected.id?' selected':''}${n.id===map.nextNodeId?' recommended':''}${related.has(n.id)?' related':''}" style="left:${pos.x/10}%;top:${pos.y}px" data-map-action="select" data-map-node="${esc(n.id)}" aria-pressed="${n.id===selected.id}" aria-controls="map-detail">
        <span class="map-node-meta">${esc(n.domainName)} · Step ${n.level}</span><strong>${esc(n.title)}</strong>
        <span class="map-node-status">${n.id===map.nextNodeId?'여기부터 시작 · ':''}${MAP_STATUS[n.status]??'미확인'}</span>
        ${n.practiceComplete?'<span class="map-practice-label">✓ 보충 연습 완료</span>':n.practiceTotal?`<span class="map-practice-label">보충 연습 ${n.practiceCorrect}/${n.practiceTotal}</span>`:''}
      </button>`;}).join('')}
    </div>
    <section id="map-detail" class="map-detail" aria-labelledby="map-detail-title">
      <div><p class="meta">${esc(selected.domainName)} · Step ${selected.level}</p><h3 id="map-detail-title" tabindex="-1">${esc(selected.title)}</h3>
        <p><span class="map-status ${esc(selected.status)}">${MAP_STATUS[selected.status]??'미확인'}</span>${selected.practiceComplete?' <span class="map-practice-label">✓ 보충 연습 완료</span>':''}</p><p>${esc(selected.reason)}</p>
        ${selected.legacy?'<p class="muted small">이전 진단에 남은 개념이에요. 현재 지도에 없는 관계는 임의로 연결하지 않았어요.</p>':''}
        ${evidence.length?`<details><summary>이 개념의 진단 기록 ${evidence.length}건</summary><ul>${evidence.map(e=>`<li>${esc(e.questionId)} · ${{correct:'정답',incorrect:'오답',abstained:'모름'}[e.result]}${e.result==='correct'?(e.independent?' · 도움 없이 처음 풂':' · 도움 또는 재노출'):''}</li>`).join('')}</ul></details>`:'<p class="muted small">직접 응답 기록이 없어 통과나 약점으로 판단하지 않아요.</p>'}
        ${canPractice && card?.questionIds.length?`<button class="primary map-practice" data-roadmap-action="open" data-roadmap-card="${esc(card.id)}" data-roadmap-question="${esc(card.questionIds[0])}">해설과 보충 문제 풀기 →</button>`:'<p class="muted small">첫 수준 확인을 마치거나 중간 결과를 넘기면, 확인한 개념의 보충 학습이 연결돼요.</p>'}
      </div><div>${neighbours('before','먼저 연결되는 개념')}${neighbours('after','다음으로 이어지는 개념')}</div>
    </section>
  </section>`;
}

// 관계 지도: 영역 6개를 기둥으로 세우고 기초(아래) → 선수 → 고졸 → 목표(맨 위)로 오르는 원 노드 지도.
// 계산(relationLayout · studyOrder · relationViewBox)과 그리기(renderRelationMap)를 나누고, 확대 이동만 브라우저에서 한다.
import { esc } from './text.js';
import { selectMapNodes } from '../learning/concept-map.js';
import { MAP_STATUS, lessonPanel } from './concept-map.js';

const STEP = { 1: '기초', 2: '선수', 3: '고졸' };
const R = 18, SLOT = 78, GAP = 26, LEFT = 58, RIGHT = 20;
const LEVEL_Y = { 3: 156, 2: 276, 1: 396 };
const GOAL = { r: 26, y: 50 };
export const RELATION_HEIGHT = 486;
const TASK = ['needs_learning', 'needs_recheck'];

// 추천 학습 순서: 진단 추천 1번(nextNodeId)을 맨 앞에, 나머지 보완 대상은 기초 → 고졸, 영역 순서대로
export function studyOrder(map) {
  const domains = [...new Set(map.nodes.map(n => n.domain))];
  const tasks = map.nodes.filter(n => TASK.includes(n.status) && !n.legacy)
    .sort((a, b) => (b.id === map.nextNodeId) - (a.id === map.nextNodeId) || a.level - b.level || domains.indexOf(a.domain) - domains.indexOf(b.domain));
  return tasks.map(n => n.id);
}

// 좌표 계산. 같은 단계 안에서는 위 단계 이웃의 평균 위치 순으로 놓아 선이 덜 엇갈리게 한다.
export function relationLayout(map) {
  const domains = [...new Map(map.nodes.filter(n => !n.legacy).map(n => [n.domain, n.domainName])).entries()];
  const pos = new Map(), columns = [];
  let x = LEFT;
  for (const [id, name] of domains) {
    const group = map.nodes.filter(n => n.domain === id && !n.legacy);
    const slots = Math.max(...[1, 2, 3].map(l => group.filter(n => n.level === l).length), 1);
    const width = slots * SLOT;
    for (const level of [3, 2, 1]) {
      const row = group.filter(n => n.level === level);
      const upper = n => {
        const xs = map.edges.filter(e => e.from === n.id && pos.has(e.to)).map(e => pos.get(e.to).x);
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Infinity;
      };
      if (level < 3) row.sort((a, b) => upper(a) - upper(b));
      row.forEach((n, i) => pos.set(n.id, { x: x + (width - row.length * SLOT) / 2 + SLOT * (i + 0.5), y: LEVEL_Y[level] }));
    }
    columns.push({ id, name, x, width, nodes: group.map(n => n.id) });
    x += width + GAP;
  }
  const width = x - GAP + RIGHT;
  return { width, height: RELATION_HEIGHT, columns, pos, goal: { x: LEFT + (width - LEFT - RIGHT) / 2, y: GOAL.y, r: GOAL.r } };
}

// 확대 영역: 고른 노드들(+이름 칸)을 감싸고, 지도 비율을 지키며, 너무 크게 확대하지 않고, 지도 밖으로 나가지 않는다.
export function relationViewBox(layout, ids, { pad = 24, minShare = 0.4 } = {}) {
  const full = { x: 0, y: 0, w: layout.width, h: layout.height };
  const points = ids.map(id => id === 'goal' ? { x: layout.goal.x, y: layout.goal.y } : layout.pos.get(id)).filter(Boolean);
  if (!points.length) return full;
  let x0 = Math.min(...points.map(p => p.x)) - R - pad, x1 = Math.max(...points.map(p => p.x)) + R + pad;
  let y0 = Math.min(...points.map(p => p.y)) - R - pad, y1 = Math.max(...points.map(p => p.y)) + R + 34 + pad;
  const ratio = layout.width / layout.height;
  let w = Math.max(x1 - x0, layout.width * minShare), h = Math.max(y1 - y0, w / ratio);
  w = Math.max(w, h * ratio);
  w = Math.min(w, layout.width); h = Math.min(w / ratio, layout.height);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x: Math.max(0, Math.min(layout.width - w, cx - w / 2)), y: Math.max(0, Math.min(layout.height - h, cy - h / 2)), w, h };
}

const wrap = title => {
  const t = [...title];
  if (t.length <= 6) return [title];
  const space = title.lastIndexOf(' ', 7);
  const cut = space > 2 ? space : 6;
  const rest = title.slice(cut).trim();
  return [title.slice(0, cut).trim(), [...rest].length > 7 ? `${[...rest].slice(0, 6).join('')}…` : rest];
};
const curve = (a, b) => {
  const my = (a.y + b.y) / 2;
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} C${a.x.toFixed(1)} ${my.toFixed(1)}, ${b.x.toFixed(1)} ${my.toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
};
const vb = v => `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`;

export function relationChain(map, nodeId) {
  return new Set(selectMapNodes(map, { scope: 'path', nodeId }).map(n => n.id));
}

export function relationTarget(map, layout, ui, selectedId) {
  if (!ui.relationZoom || !selectedId) return { x: 0, y: 0, w: layout.width, h: layout.height };
  // 목표 노드까지 넣으면 지도 전체 높이가 되어 확대가 일어나지 않는다. 목표로 가는 점선은 위쪽에 이어져 보인다.
  return relationViewBox(layout, [...relationChain(map, selectedId)]);
}

export function renderRelationMap(map, ui, ctx) {
  const layout = relationLayout(map);
  const order = studyOrder(map), rank = new Map(order.map((id, i) => [id, i + 1]));
  const selected = map.nodes.find(n => n.id === ui.mapNodeId && !n.legacy) ?? map.nodes.find(n => n.id === map.nextNodeId) ?? map.nodes.find(n => !n.legacy);
  if (!selected) return '<p class="msg">아직 표시할 개념 자료가 없어요.</p>';
  const chain = relationChain(map, selected.id);
  const dim = id => !chain.has(id);
  const target = relationTarget(map, layout, ui, selected.id);
  const start = ui.mapViewBox && ui.mapViewBox.layoutWidth === layout.width ? ui.mapViewBox : target;

  const lanes = layout.columns.map((c, i) => `<rect class="rm-lane${i % 2 ? ' alt' : ''}" x="${c.x - GAP / 2}" y="${GOAL.y + GOAL.r + 18}" width="${c.width + GAP}" height="${RELATION_HEIGHT - GOAL.y - GOAL.r - 18}"/>`).join('');
  const ticks = [3, 2, 1].map(l => `<text class="rm-step" x="8" y="${LEVEL_Y[l] + 4}">${STEP[l]}</text>`).join('');
  const names = layout.columns.map(c => {
    const group = map.nodes.filter(n => n.domain === c.id && !n.legacy);
    const done = group.filter(n => n.status === 'mastered' || n.status === 'confirmed').length;
    const complete = group.length > 0 && group.every(n => n.courseComplete);
    return `${complete ? `<g class="rm-domain-seal" transform="translate(${c.x + c.width / 2} 105) rotate(-8)" role="img" aria-label="${esc(c.name)} 이수 완료"><rect x="-40" y="-14" width="80" height="28" rx="3"/><text text-anchor="middle" y="5">이수 완료</text></g>` : ''}<text class="rm-domain" x="${c.x + c.width / 2}" y="${RELATION_HEIGHT - 26}" text-anchor="middle">${esc(c.name)}</text><text class="rm-domain-sub" x="${c.x + c.width / 2}" y="${RELATION_HEIGHT - 10}" text-anchor="middle">도움 없이 확인 ${done}/${group.length}</text>`;
  }).join('');
  const edges = map.edges.filter(e => layout.pos.has(e.from) && layout.pos.has(e.to)).map(e => {
    const a = layout.pos.get(e.from), b = layout.pos.get(e.to);
    const on = chain.has(e.from) && chain.has(e.to);
    return `<path class="rm-edge${on ? ' on' : ' dim'}" d="${curve({ x: a.x, y: a.y - R - 2 }, { x: b.x, y: b.y + R + 30 })}" marker-end="url(#rm-arrow)"/>`;
  }).join('');
  const goalEdges = map.nodes.filter(n => n.level === 3 && layout.pos.has(n.id)).map(n => {
    const a = layout.pos.get(n.id);
    return `<path class="rm-goal-edge${chain.has(n.id) ? ' on' : ' dim'}" d="${curve({ x: a.x, y: a.y - R - 2 }, { x: layout.goal.x, y: layout.goal.y + GOAL.r + 2 })}"/>`;
  }).join('');
  const nodes = map.nodes.filter(n => layout.pos.has(n.id)).map(n => {
    const p = layout.pos.get(n.id), r = rank.get(n.id);
    const inner = r ?? (n.status === 'mastered' || n.status === 'confirmed' ? '✓' : '');
    const label = `${n.courseComplete ? '이수 완료 · ' : ''}${n.title} · ${STEP[n.level]} · ${MAP_STATUS[n.status] ?? '미확인'}${r ? ` · 학습 순서 ${r}` : ''}${n.practiceComplete ? ' · 보충 연습 완료' : ''}${n.id === map.nextNodeId ? ' · 지금 여기' : ''}`;
    return `<g class="rm-node ${esc(n.status)}${n.level === 3 ? ' goal-step' : ''}${n.id === selected.id ? ' sel' : ''}${dim(n.id) ? ' dim' : ''}" data-map-action="select" data-map-node="${esc(n.id)}" role="button" tabindex="0" aria-pressed="${n.id === selected.id}" aria-label="${esc(label)}"><title>${esc(label)}</title>
      ${n.id === map.nextNodeId ? `<circle class="rm-halo" cx="${p.x}" cy="${p.y}" r="${R + 6}"/>` : ''}
      <circle class="rm-c" cx="${p.x}" cy="${p.y}" r="${R}"/>
      ${n.courseComplete ? `<g class="rm-seal" transform="translate(${p.x} ${p.y}) rotate(-12)" aria-hidden="true"><circle r="23"/><circle r="19"/><text y="-1" text-anchor="middle">이수</text><text class="rm-seal-small" y="11" text-anchor="middle">완료</text></g>` : ''}
      ${inner !== '' && !n.courseComplete ? `<text class="rm-num" x="${p.x}" y="${p.y + 4.5}" text-anchor="middle">${inner}</text>` : ''}
      ${n.practiceComplete ? `<circle class="rm-badge" cx="${p.x + 13}" cy="${p.y - 13}" r="7"/><text class="rm-badge-t" x="${p.x + 13}" y="${p.y - 10}" text-anchor="middle">✓</text>` : ''}
      ${wrap(n.title).map((l, i) => `<text class="rm-name" x="${p.x}" y="${p.y + R + 14 + i * 13}" text-anchor="middle">${esc(l)}</text>`).join('')}</g>`;
  }).join('');
  const goal = `<g class="rm-goal"><circle cx="${layout.goal.x}" cy="${layout.goal.y}" r="${GOAL.r}"/><text class="rm-goal-t" x="${layout.goal.x}" y="${layout.goal.y + 4}" text-anchor="middle">목표</text><text class="rm-goal-name" x="${layout.goal.x + GOAL.r + 10}" y="${layout.goal.y + 5}">고졸 검정고시 수학</text></g>`;

  const chips = order.length ? `<ol class="rm-order">${order.map((id, i) => {
    const n = map.nodes.find(x => x.id === id);
    return `<li><button class="rm-chip ${esc(n.status)}${id === selected.id ? ' sel' : ''}" data-map-action="select" data-map-node="${esc(id)}" aria-pressed="${id === selected.id}"><b>${i + 1}</b>${esc(n.title)}<small>${esc(n.domainName)}</small></button></li>`;
  }).join('')}</ol>` : '<p class="muted small">진단에서 보완할 개념이 아직 없어요. 첫 수준 확인을 하면 학습 순서가 생겨요.</p>';
  const list = layout.columns.map(c => `<li>${esc(c.name)}: ${map.nodes.filter(n => n.domain === c.id && !n.legacy).sort((a, b) => a.level - b.level).map(n => `${esc(n.title)}(${STEP[n.level]}, ${MAP_STATUS[n.status] ?? '미확인'}${rank.get(n.id) ? `, 순서 ${rank.get(n.id)}` : ''})`).join(', ')}</li>`).join('');

  return `<section class="relation-map" aria-labelledby="map-heading">
    <div class="rm-toolbar"><div><p class="meta">기초에서 고졸, 목표까지 오르는 개념의 연결</p><h3 id="map-heading" tabindex="-1">개념 관계 지도</h3></div>
      <div class="map-controls" aria-label="지도 확대"><button data-map-action="zoom" data-map-value="off" aria-pressed="${!ui.relationZoom}">전체 보기</button><button data-map-action="zoom" data-map-value="on" aria-pressed="${Boolean(ui.relationZoom)}">개념 확대</button></div></div>
    <div class="rm-canvas"><svg id="relation-svg" viewBox="${vb(start)}" data-target="${vb(target)}" data-layout-width="${layout.width}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="개념 ${layout.pos.size}개의 선수 관계 지도. 노드를 고르면 그 개념까지 가는 길이 강조돼요.">
      <defs><marker id="rm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z"/></marker></defs>
      ${lanes}${ticks}${names}${goalEdges}${edges}${goal}${nodes}</svg></div>
    <div class="map-legend rm-legend"><span class="map-key rm-seal-key"><i aria-hidden="true">印</i>도장 · 묶음 문제 모두 정답</span><span class="map-key mastered"><i aria-hidden="true">✓</i>확인</span><span class="map-key needs_recheck"><i aria-hidden="true">◐</i>혼자 다시 확인</span><span class="map-key needs_learning"><i aria-hidden="true">1</i>보완 필요 · 숫자 = 학습 순서</span><span class="map-key unmeasured"><i aria-hidden="true"></i>미확인</span><span class="map-key"><i aria-hidden="true">✓</i>보충 연습 완료(작은 배지)</span><span class="map-key recommended"><i aria-hidden="true"></i>지금 여기</span></div>
    <ul class="sr-only" aria-label="영역별 개념 목록">${list}</ul>
    <div class="rm-below">${lessonPanel(map, selected, { cards: [], entries: [], ...ctx })}<section class="rm-order-box" aria-labelledby="rm-order-title"><h4 id="rm-order-title">추천 학습 순서</h4>${chips}</section></div>
  </section>`;
}

// 브라우저 전용: 다시 그린 뒤 마지막 위치에서 목표 viewBox로 부드럽게 옮긴다.
let frame = 0;
export function animateRelationMap(root, ui) {
  const svg = root.querySelector?.('#relation-svg');
  if (!svg?.getAttribute) return;
  const parse = s => { const [x, y, w, h] = s.split(' ').map(Number); return { x, y, w, h }; };
  const from = parse(svg.getAttribute('viewBox')), to = parse(svg.dataset.target), layoutWidth = Number(svg.dataset.layoutWidth);
  const set = v => { svg.setAttribute('viewBox', vb(v)); ui.mapViewBox = { ...v, layoutWidth }; };
  globalThis.cancelAnimationFrame?.(frame);
  const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !globalThis.requestAnimationFrame || ['x', 'y', 'w', 'h'].every(k => Math.abs(from[k] - to[k]) < 0.5)) { set(to); return; }
  const t0 = performance.now(), D = 500, ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const step = now => {
    const t = Math.min(1, (now - t0) / D), e = ease(t);
    set({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e });
    if (t < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
}

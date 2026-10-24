// 멘토 홈 다이어그램: 멘토링 흐름(학생이 지금 어느 단계인지) + 영역별 개념 상태 막대.
// 모두 이미 저장된 기록에서 계산하고, 새 판정을 만들지 않는다.
import { esc } from './text.js';
import { buildConceptMap } from '../learning/concept-map.js';
import { roadmapCards } from '../learning/roadmap.js';

// 확인 → 다시 확인 → 보완 필요 순서는 색약 검증(인접 쌍 ΔE ≥ 8)을 통과한 순서다. 미확인은 회색 바탕.
export const DOMAIN_SEGMENTS = [
  ['done', '도움 없이 확인', '●'], ['recheck', '혼자 다시 확인', '◐'], ['learn', '보완 필요', '○'], ['unmeasured', '미확인', '·'],
];

export function mentoringFlow({ initial, paths = [], sessions = [], pendingLogs = 0, assignments = 0 }) {
  const tasks = initial?.roadmap ? roadmapCards(initial.roadmap).filter(c => ['needs_learning', 'needs_recheck'].includes(c.status)) : [];
  const practiced = tasks.filter(c => c.practiceComplete).length;
  const finished = paths.filter(p => p.status === 'completed').length;
  const open = paths.filter(p => ['active', 'paused', 'needs_mentor'].includes(p.status)).length;
  const planned = Boolean(initial?.startingPoint) || assignments > 0;
  const steps = [
    { id: 'assessment', label: '첫 수준 확인', done: initial?.status === 'completed',
      fact: initial ? `${initial.counts.total}문제 응답${initial.stopReason === 'user_paused' ? ' · 중간 결과' : ''}` : '시작 전' },
    { id: 'planning', label: '시작점 정하기', done: planned, fact: planned ? (initial?.startingPoint ? '멘토 확정' : `문제 지정 ${assignments}개`) : '멘토 확정 전' },
    { id: 'roadmap', label: '보충 학습', done: tasks.length > 0 && practiced === tasks.length,
      fact: tasks.length ? `보완 개념 ${practiced}/${tasks.length} 연습 완료` : '보완 과제 없음' },
    { id: 'learning', label: '다시 풀기', done: finished > 0 && open === 0, fact: paths.length ? `완료 ${finished} · 진행 ${open}` : '지정된 문제 없음' },
    { id: 'sessions', label: '수업·일지', done: sessions.length > 0 && pendingLogs === 0,
      fact: sessions.length ? `회기 ${sessions.length}${pendingLogs ? ` · 확정 대기 ${pendingLogs}` : ''}` : '기록 없음' },
  ];
  const current = steps.find(s => !s.done);
  return steps.map(s => ({ ...s, state: s.done ? 'done' : s === current ? 'current' : 'waiting' }));
}

export function renderFlowDiagram(steps) {
  const word = { done: '완료', current: '지금 단계', waiting: '대기' };
  return `<section class="flow-diagram" aria-labelledby="flow-title">
    <h3 id="flow-title">멘토링 흐름</h3>
    <ol class="flow-steps">${steps.map((s, i) => `<li class="flow-step ${s.state}"${s.state === 'current' ? ' aria-current="step"' : ''}>
      <button class="flow-node" data-goto="${s.id}"><span class="flow-dot" aria-hidden="true">${s.state === 'done' ? '✓' : i + 1}</span>
        <span class="flow-text"><b>${esc(s.label)}</b><small>${esc(s.fact)}</small><em>${word[s.state]}</em></span></button>
    </li>`).join('')}</ol>
  </section>`;
}

export function domainProgress(initial, catalog) {
  const map = buildConceptMap(initial?.roadmap ?? null, catalog.questions ?? [], catalog.diagnostic);
  const domains = [...new Map(map.nodes.map(n => [n.domain, n.domainName])).entries()];
  return domains.map(([id, name]) => {
    const nodes = map.nodes.filter(n => n.domain === id);
    const count = st => nodes.filter(n => st.includes(n.status)).length;
    return { id, name, total: nodes.length, done: count(['mastered', 'confirmed']), recheck: count(['needs_recheck']),
      learn: count(['needs_learning']), unmeasured: count(['unmeasured']) };
  });
}

export function renderDomainBars(rows) {
  if (!rows.length) return '';
  const max = Math.max(...rows.map(r => r.total));
  const bar = r => DOMAIN_SEGMENTS.map(([key, label]) => r[key] ? `<span class="seg ${key}" style="flex:${r[key]}" title="${esc(`${r.name} · ${label} ${r[key]}개`)}"></span>` : '').join('');
  return `<section class="domain-bars" aria-labelledby="domain-bars-title">
    <div class="domain-bars-head"><h3 id="domain-bars-title">영역별 개념 상태</h3>
      <div class="domain-legend">${DOMAIN_SEGMENTS.map(([key, label, mark]) => `<span><i class="seg ${key}" aria-hidden="true">${mark}</i>${label}</span>`).join('')}</div></div>
    <ul class="domain-rows" aria-hidden="true">${rows.map(r => `<li><button class="domain-name" data-goto="roadmap" tabindex="-1">${esc(r.name)}</button>
      <span class="domain-track" style="width:${(r.total / max) * 100}%">${bar(r)}</span>
      <span class="domain-count"><b>${r.done}</b>/${r.total}${r.learn ? ` · 보완 ${r.learn}` : ''}</span></li>`).join('')}</ul>
    <div class="sr-only"><table><caption>영역별 개념 상태</caption><thead><tr><th>영역</th>${DOMAIN_SEGMENTS.map(([, label]) => `<th>${label}</th>`).join('')}<th>전체</th></tr></thead>
      <tbody>${rows.map(r => `<tr><th>${esc(r.name)}</th>${DOMAIN_SEGMENTS.map(([key]) => `<td>${r[key]}</td>`).join('')}<td>${r.total}</td></tr>`).join('')}</tbody></table></div>
  </section>`;
}

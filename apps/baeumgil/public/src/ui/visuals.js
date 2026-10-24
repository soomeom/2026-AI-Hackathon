// 화면 곳곳의 작은 시각화 부품. 모두 저장된 기록에서 계산만 하고 새 판정을 만들지 않는다.
// 색: 맞힘 초록 · 틀림 주황 · 모름 보라 (멘토 홈 막대와 같은, 색약 검증을 통과한 세 색). 색만으로 구분하지 않도록 기호를 함께 쓴다.
import { esc, STAGE_LABEL } from './text.js';

const MARK = { correct: '✓', incorrect: '✗', abstained: '?' };
const WORD = { correct: '맞힘', incorrect: '틀림', abstained: '모름' };
export const JOURNEY_STAGES = ['original_attempt', 'concept_check', 'foundation_practice', 'similar_practice', 'original_retry', 'transfer_check'];

// ① 풀이 여정: 가로 = 풀이 순서, 세로 = 학습 단계(위가 기출). 틀리면 아래 단계로 내려갔다가 다시 올라오는 모양이 보인다.
export function renderJourney(attempts) {
  const points = attempts.filter(a => JOURNEY_STAGES.includes(a.stage) && MARK[a.result]);
  if (!points.length) return '';
  // 점이 적으면 간격을 넓혀 흐름이 잘 보이게 한다
  const rowH = 30, colW = Math.min(72, Math.max(34, Math.floor(640 / points.length))), left = 92, top = 16;
  const width = left + points.length * colW + 12, height = top + JOURNEY_STAGES.length * rowH;
  const y = stage => top + JOURNEY_STAGES.indexOf(stage) * rowH + rowH / 2;
  const x = i => left + i * colW + colW / 2;
  const lanes = JOURNEY_STAGES.map(s => `<text class="j-lane" x="${left - 10}" y="${y(s) + 4}" text-anchor="end">${STAGE_LABEL[s]}</text><line class="j-grid" x1="${left}" x2="${width - 6}" y1="${y(s)}" y2="${y(s)}"/>`).join('');
  const line = `<polyline class="j-path" points="${points.map((a, i) => `${x(i)},${y(a.stage)}`).join(' ')}"/>`;
  const dots = points.map((a, i) => `<g class="j-dot ${a.result}${a.helpUsed ? ' helped' : ''}"><title>${i + 1}번째 · ${STAGE_LABEL[a.stage]} · ${WORD[a.result]}${a.helpUsed ? ' · 도움 사용' : ''}</title><circle cx="${x(i)}" cy="${y(a.stage)}" r="10"/><text x="${x(i)}" y="${y(a.stage) + 4}" text-anchor="middle">${MARK[a.result]}</text></g>`).join('');
  return `<figure class="journey"><figcaption>풀이 여정 <span class="muted small">왼쪽부터 푼 순서 · 위가 기출 · 점선 테두리는 도움 사용</span></figcaption>
    <div class="journey-scroll"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="풀이 ${points.length}회의 단계 이동. 아래 풀이 기록 목록과 같은 내용이에요.">${lanes}${line}${dots}</svg></div>
    <div class="result-key" aria-hidden="true">${Object.keys(MARK).map(k => `<span class="${k}"><i>${MARK[k]}</i>${WORD[k]}</span>`).join('')}</div></figure>`;
}

// ② 처음 풀이 → 재도전 → 새 문제: 화살표로 이은 세 칸. 표본이 작아 백분율 대신 개수를 보여 준다.
export function renderOutcomeFlow(steps) {
  const icon = s => s.result ? `<i class="flow-result ${s.result}" aria-hidden="true">${MARK[s.result]}</i>` : '<i class="flow-result none" aria-hidden="true">—</i>';
  return `<ol class="outcome-flow">${steps.map(s => `<li class="${s.result ?? 'none'}">${icon(s)}<div><span>${esc(s.label)}</span><strong>${esc(s.value)}</strong>${s.note ? `<small>${esc(s.note)}</small>` : ''}</div></li>`).join('')}</ol>`;
}

const statValue = s => s.attempted ? `${s.correct}/${s.attempted} 맞힘` : '기록 없음';
const statResult = s => !s.attempted ? null : s.correct === s.attempted ? 'correct' : s.correct === 0 ? (s.abstained === s.attempted ? 'abstained' : 'incorrect') : 'mixed';
export const statFlowSteps = summary => [
  { label: '처음 풀이', value: statValue(summary.originalStats), result: statResult(summary.originalStats), note: summary.originalStats.abstained ? `모름 ${summary.originalStats.abstained}` : '' },
  { label: '기출 재도전', value: statValue(summary.retryStats), result: statResult(summary.retryStats), note: '이미 본 문제' },
  { label: '새 문제 혼자 적용', value: statValue(summary.transferStats), result: statResult(summary.transferStats), note: summary.unmeasuredCount ? `제외 ${summary.unmeasuredCount}` : '처음 보고 도움 없이' },
];

// ③ 영역별 수준 사다리: 기초 → 선수 → 고졸 세 칸. 칸 상태는 그 단계에서 실제로 푼 응답으로만 정한다.
const LADDER = { pass: ['통과', '●'], above: ['위 단계 통과', '◌'], pending: ['판단 보류', '◐'], blocked: ['막힘', '○'], none: ['미측정', '·'] };
export function levelLadder(summary) {
  return summary.report.domains.map(d => {
    const own = (summary.entries ?? []).filter(e => e.domain === d.id);
    const cells = [1, 2, 3].map(level => {
      const at = own.filter(e => e.level === level);
      if (level <= d.demonstrated) return at.length ? 'pass' : 'above';
      if (!at.length) return 'none';
      return at.some(e => e.result !== 'correct') ? 'blocked' : 'pending';
    });
    return { id: d.id, name: d.name, cells };
  });
}
export function renderLadder(rows, { legend = true } = {}) {
  const head = ['기초', '선수', '고졸'];
  return `<div class="ladder">${legend ? `<div class="ladder-legend" aria-hidden="true">${Object.entries(LADDER).map(([k, [t, m]]) => `<span><i class="cell ${k}">${m}</i>${t}</span>`).join('')}</div>` : ''}
    <table class="ladder-table"><caption class="sr-only">영역별 기초·선수·고졸 단계 확인 상태</caption><thead><tr><th scope="col">영역</th>${head.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr><th scope="row">${esc(r.name)}</th>${r.cells.map((c, i) => `<td><span class="cell ${c}" title="${esc(`${r.name} · ${head[i]} · ${LADDER[c][0]}`)}"><span aria-hidden="true">${LADDER[c][1]}</span><span class="sr-only">${LADDER[c][0]}</span></span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export const ladderCells = row => `<span class="ladder-inline">${row.cells.map((c, i) => `<span class="cell ${c}" title="${['기초', '선수', '고졸'][i]} · ${LADDER[c][0]}"><span aria-hidden="true">${LADDER[c][1]}</span><span class="sr-only">${['기초', '선수', '고졸'][i]} ${LADDER[c][0]}</span></span>`).join('')}</span>`;

// ④ 진단 진행: 영역 이름이 붙은 6칸 막대
export function renderDomainSteps(domains, index) {
  return `<ol class="domain-steps" aria-label="확인한 영역 ${Math.min(index, domains.length)}/${domains.length}">${domains.map((d, i) => `<li class="${i < index ? 'done' : i === index ? 'now' : ''}"${i === index ? ' aria-current="step"' : ''}><i aria-hidden="true"></i><span>${esc(d.name)}</span></li>`).join('')}</ol>`;
}

// ⑤ 개념 근거 카드의 미니 막대: 맞힘·틀림·모름 개수
export function resultMiniBar(rows) {
  const n = k => rows.filter(r => r.result === k).length;
  const parts = Object.keys(MARK).map(k => [k, n(k)]).filter(([, v]) => v);
  if (!parts.length) return '';
  return `<div class="mini-result"><span class="mini-bar" aria-hidden="true">${parts.map(([k, v]) => `<i class="${k}" style="flex:${v}"></i>`).join('')}</span><span class="mini-count">${parts.map(([k, v]) => `${WORD[k]} ${v}`).join(' · ')}</span></div>`;
}
export const ladderLegend = () => `<div class="ladder-legend" aria-hidden="true">${Object.entries(LADDER).map(([k, [t, m]]) => `<span><i class="cell ${k}">${m}</i>${t}</span>`).join('')}</div>`;

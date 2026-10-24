import test from 'node:test';
import assert from 'node:assert/strict';
import { renderJourney, renderOutcomeFlow, statFlowSteps, levelLadder, renderLadder, ladderCells, renderDomainSteps, resultMiniBar } from '../public/src/ui/visuals.js';

test('journey plots each attempt in order on its stage lane and skips unknown stages', () => {
  const html = renderJourney([
    { stage: 'original_attempt', result: 'incorrect' }, { stage: 'concept_check', result: 'abstained', helpUsed: true },
    { stage: 'original_retry', result: 'correct' }, { stage: 'diagnostic', result: 'correct' },
  ]);
  assert.equal((html.match(/class="j-dot /g) ?? []).length, 3);
  assert.match(html, /j-dot abstained helped/);
  assert.match(html, /1번째 · 기출 풀이 · 틀림/);
  assert.match(html, /3번째 · 기출 재도전 · 맞힘/);
  assert.equal(renderJourney([]), '');
});

test('outcome flow shows counts, never a percentage from a tiny sample', () => {
  const stats = (correct, attempted, abstained = 0) => ({ correct, attempted, abstained, rate: attempted ? correct / attempted : null });
  const steps = statFlowSteps({ originalStats: stats(0, 1), retryStats: stats(1, 1), transferStats: stats(0, 0), unmeasuredCount: 0 });
  assert.deepEqual(steps.map(s => s.result), ['incorrect', 'correct', null]);
  const html = renderOutcomeFlow(steps);
  assert.match(html, /0\/1 맞힘/);assert.match(html, /1\/1 맞힘/);assert.match(html, /기록 없음/);
  assert.doesNotMatch(html, /%/);
});

test('ladder cells come only from answers at that level; levels below a pass are marked as implied', () => {
  const summary = {
    report: { domains: [
      { id: 'a', name: '수와 다항식', demonstrated: 3 },
      { id: 'b', name: '함수', demonstrated: 1 },
      { id: 'c', name: '도형', demonstrated: 0 },
    ] },
    entries: [
      { domain: 'a', level: 3, result: 'correct' },
      { domain: 'b', level: 1, result: 'correct' }, { domain: 'b', level: 2, result: 'incorrect' },
      { domain: 'c', level: 3, result: 'correct' },
    ],
  };
  const rows = levelLadder(summary);
  assert.deepEqual(rows.map(r => r.cells), [['above', 'above', 'pass'], ['pass', 'blocked', 'none'], ['none', 'none', 'pending']]);
  const html = renderLadder(rows);
  assert.match(html, /<caption class="sr-only">/);
  assert.match(html, /<span class="sr-only">막힘<\/span>/);
  assert.match(ladderCells(rows[1]), /선수 막힘/);
});

test('domain steps mark done, current and remaining domains; mini bar counts each result', () => {
  const html = renderDomainSteps([{ name: 'A' }, { name: 'B' }, { name: 'C' }], 1);
  assert.match(html, /<li class="done"><i aria-hidden="true"><\/i><span>A/);
  assert.match(html, /<li class="now" aria-current="step">/);
  assert.match(html, /확인한 영역 1\/3/);
  const bar = resultMiniBar([{ result: 'incorrect' }, { result: 'incorrect' }, { result: 'correct' }]);
  assert.match(bar, /맞힘 1 · 틀림 2/);
  assert.equal(resultMiniBar([]), '');
});

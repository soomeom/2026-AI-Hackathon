import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeCatalogParts } from '../public/src/content/catalog.js';
import { mentoringFlow, renderFlowDiagram, domainProgress, renderDomainBars } from '../public/src/ui/mentor-diagrams.js';
import { createStore, createDemoState } from '../public/src/state/store.js';
import { initialAssessmentSummary } from '../public/src/learning/initial-assessment.js';

const catalog = mergeCatalogParts(['questions','concepts','routes','review','exam-bank'].map(name =>
  JSON.parse(readFileSync(new URL(`../public/src/content/${name}.json`, import.meta.url), 'utf8'))));

test('mentoring flow marks finished steps, exactly one current step, and links each step to its page', () => {
  const fresh = mentoringFlow({});
  assert.deepEqual(fresh.map(s => s.state), ['current', 'waiting', 'waiting', 'waiting', 'waiting']);
  const store = createStore({ initialState: createDemoState(), catalog });
  store.startInitialAssessment();
  const id = store.getState().initialAssessments[0].id;
  while (store.getState().initialAssessments[0].status === 'active') {
    const q = store.getState().initialAssessments[0].diagnostic.currentId;
    store.presentInitialQuestion({ assessmentId: id, questionId: q });
    store.submitInitialAnswer({ assessmentId: id, questionId: q, abstained: true });
  }
  const initial = initialAssessmentSummary(store.getState(), 'learner-1', { catalog });
  const steps = mentoringFlow({ initial });
  assert.equal(steps[0].state, 'done');
  assert.equal(steps.filter(s => s.state === 'current').length, 1);
  assert.equal(steps[1].state, 'current');
  assert.match(steps[2].fact, /보완 개념 0\/\d+ 연습 완료/);
  const html = renderFlowDiagram(steps);
  for (const target of ['assessment', 'planning', 'roadmap', 'learning', 'sessions']) assert.match(html, new RegExp(`data-goto="${target}"`));
  assert.match(html, /aria-current="step"/);
  assert.doesNotMatch(html, /class="flow-step todo/, '기존 .todo 카드 스타일과 겹치지 않는다');

  const rows = domainProgress(initial, catalog);
  assert.equal(rows.length, catalog.diagnostic.domains.length);
  for (const r of rows) assert.equal(r.done + r.recheck + r.learn + r.unmeasured, r.total);
  assert.ok(rows.some(r => r.learn > 0), '모름 응답은 보완 필요로 집계된다');
  const bars = renderDomainBars(rows);
  assert.match(bars, /<div class="sr-only"><table>/, '스크린리더용 표를 함께 둔다');
  assert.match(bars, /보완 필요/);
  assert.equal(renderDomainBars([]), '');
});

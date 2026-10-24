import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderInitialAssessment, initialAssessmentPanel, handleInitialAssessmentAction, isInitialAssessmentVisible } from '../public/src/ui/initial-assessment.js';
import { renderLearner } from '../public/src/ui/learner.js';
import { renderMentor } from '../public/src/ui/mentor.js';
import { createStore, createDemoState } from '../public/src/state/store.js';
import { initialAssessmentSummary } from '../public/src/learning/initial-assessment.js';
import { mergeCatalogParts } from '../public/src/content/catalog.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../public/src/content/${name}.json`, import.meta.url), 'utf8'));
const catalog = mergeCatalogParts(['questions', 'concepts', 'routes', 'review', 'exam-bank'].map(read));
const setup = (options = {}) => {
  const store = createStore({ initialState: createDemoState(), catalog, ...options });
  const ui = { ai: {}, selected: {}, help: {}, openEvidence: {}, mentorTab: 'home', initialChoices: {} };
  const root = { innerHTML: '', onclick: null, onchange: null };
  const props = { ...store, catalog, ui, root, state: store.getState() };
  props.rerender = () => { props.state = props.getState(); };
  return props;
};
const current = (props) => props.getState().initialAssessments.at(-1).diagnostic.currentId;
const finish = (props) => {
  props.startInitialAssessment();
  const assessmentId = props.getState().initialAssessments[0].id;
  while (props.getState().initialAssessments[0].status === 'active') {
    const id = current(props);
    props.presentInitialQuestion({ assessmentId, questionId: id });
    props.submitInitialAnswer({ assessmentId, questionId: id, abstained: true });
  }
  props.state = props.getState();
  return assessmentId;
};
const click = (props, dataset) => props.root.onclick({ target: { closest: () => ({ disabled: false, dataset }) } });

test('처음 멘티 화면에 6개 영역 안내·모름·시간 제한 없음을 보여 주고 기존 학습은 계속할 수 있다', () => {
  const props = setup();
  renderLearner(props);
  assert.match(props.root.innerHTML, /첫 수준 확인/);
  assert.match(props.root.innerHTML, /6개 영역/);
  assert.match(props.root.innerHTML, /시간 제한/);
  assert.match(props.root.innerHTML, /합격을 판정하는 검사가 아니에요/);
  props.assignQuestion({ questionId: 'q-eq-1' }); props.state = props.getState();
  renderInitialAssessment(props);
  assert.match(props.root.innerHTML, /기존 학습 이어가기/);
});

test('현재 문항(기출 출처·수식)을 보여 주고 미선택 제출은 비활성화하며 다시 그려도 노출은 하나다', () => {
  const props = setup(); props.startInitialAssessment(); props.state = props.getState();
  renderInitialAssessment(props); props.state = props.getState();
  renderInitialAssessment(props);
  assert.match(props.root.innerHTML, /영역 1\/6/);
  assert.match(props.root.innerHTML, /2025년 1회 고졸 검정고시 수학/);
  assert.match(props.root.innerHTML, /도움을 받았어요/);
  assert.match(props.root.innerHTML, /data-initial-action="submit" disabled/);
  assert.equal(props.getState().exposures.length, 1);
});

test('모름 제출은 저장되고 연결된 선수 문항으로 이어진다', () => {
  const props = setup(); props.startInitialAssessment(); props.state = props.getState();
  renderInitialAssessment(props); props.state = props.getState(); renderInitialAssessment(props);
  const first = current(props);
  click(props, { initialAction: 'unknown', initialQuestion: first });
  const attempts = props.getState().initialAssessments[0].diagnostic.attempts;
  assert.equal(attempts[0].result, 'abstained');
  assert.equal(current(props), catalog.questions.find((q) => q.id === first).fallback_question_id);
});

test('도움 표시를 켜고 맞히면 독립 수행 근거에서 빠진다', () => {
  const props = setup(); props.startInitialAssessment(); props.state = props.getState();
  renderInitialAssessment(props); props.state = props.getState(); renderInitialAssessment(props);
  const id = current(props);
  const q = catalog.questions.find((x) => x.id === id);
  props.root.onchange({ target: { id: 'initial-help', checked: true } });
  click(props, { initialChoice: q.choices.find((c) => c.value === q.answer).id, initialQuestion: id });
  click(props, { initialAction: 'submit', initialQuestion: id });
  const attempt = props.getState().initialAssessments[0].diagnostic.attempts[0];
  assert.equal(attempt.result, 'correct');
  assert.equal(attempt.independent, false);
  assert.equal(props.ui.initialHelp, false);
});

test('이전 문제의 제출 이벤트가 늦게 도착해도 다음 문항을 대신 제출하지 않는다', () => {
  const props = setup(); props.startInitialAssessment(); props.state = props.getState();
  renderInitialAssessment(props); renderInitialAssessment(props);
  const event = { initialAction: 'unknown', initialQuestion: current(props) };
  click(props, event);
  renderInitialAssessment(props); renderInitialAssessment(props);
  click(props, event);
  assert.equal(props.getState().initialAssessments[0].diagnostic.attempts.length, 1);
});

test('중간에 멈추면 결과가 멘토에게 넘어가고, 멘티는 이어서 풀 수 있다', () => {
  const props = setup(); props.startInitialAssessment(); props.state = props.getState();
  renderInitialAssessment(props); renderInitialAssessment(props);
  click(props, { initialAction: 'unknown', initialQuestion: current(props) });
  renderInitialAssessment(props); renderInitialAssessment(props);
  click(props, { initialAction: 'pause' });
  assert.equal(props.getState().initialAssessments[0].stopReason, 'user_paused');
  assert.match(initialAssessmentPanel(props.getState(), catalog, props.ui), /학생이 중간에 멈춤/);
  props.state = props.getState(); renderInitialAssessment(props);
  assert.match(props.root.innerHTML, /이어서 풀기/);
  click(props, { initialAction: 'resume' });
  assert.equal(props.getState().initialAssessments[0].status, 'active');
});

test('완료 후 멘티는 영역별 결과·멘토 대기를 보고 멘토 확정 후 배정된 학습으로 간다', () => {
  const props = setup(); const assessmentId = finish(props);
  assert.equal(renderInitialAssessment(props), true);
  assert.match(props.root.innerHTML, /멘토가 결과를 보고/);
  assert.match(props.root.innerHTML, /수와 다항식/);
  const { recommendation } = initialAssessmentSummary(props.state, 'learner-1', { catalog });
  const pathId = props.planInitialLesson({ assessmentId, conceptId: recommendation.conceptId, questionId: recommendation.questionIds[0] });
  props.state = props.getState();
  assert.equal(renderInitialAssessment(props), false);
  renderLearner(props);
  assert.match(props.root.innerHTML, /첫 수업 시작 단원/);
  assert.equal(props.state.paths[0].id, pathId);
});

test('멘토 홈에 미시작·진행 중·완료(영역별 표·추천·확정) 보고서를 구분해서 표시한다', () => {
  const props = setup(); renderMentor(props);
  assert.match(props.root.innerHTML, /첫 수준 확인/);
  assert.match(props.root.innerHTML, /아직/);
  props.startInitialAssessment(); props.state = props.getState();
  assert.match(initialAssessmentPanel(props.state, catalog, props.ui), /진행 중/);
  finish(props); renderMentor(props);
  for (const text of [/영역/, /확인 수준/, /다시 볼 개념/, /추천:/, /시작 단원/, /첫 문제/, /멘토가 확정/, /결과 JSON 저장/, /초기 운영 규칙/]) {
    assert.match(props.root.innerHTML, text);
  }
});

test('멘토는 추천과 다른 단원을 골라 그 단원의 문항만 보고 지정할 수 있다', () => {
  const props = setup(); finish(props);
  initialAssessmentPanel(props.state, catalog, props.ui);
  props.ui.initialConceptId = 'c-frac-reciprocal';
  const html = initialAssessmentPanel(props.state, catalog, props.ui);
  const select = html.match(/<select id="initial-question">([\s\S]*?)<\/select>/)[1];
  assert.match(select, /q-rat-1/);
  assert.doesNotMatch(select, /q-eq-1/);
  props.ui.initialQuestionId = 'q-rat-1';
  assert.equal(handleInitialAssessmentAction({ dataset: { initialAction: 'plan' } }, props), true);
  assert.equal(props.getState().startingPoints[0].conceptId, 'c-frac-reciprocal');
  assert.equal(props.getState().paths[0].questionId, 'q-rat-1');
});

test('선택 이유는 HTML로 실행되지 않고 텍스트로 표시된다', () => {
  const props = setup(); const assessmentId = finish(props);
  props.planInitialLesson({ assessmentId, conceptId: 'c-int-addsub', questionId: 'q-rat-1', reason: '<script>unsafe()</script>' });
  props.state = props.getState();
  const html = initialAssessmentPanel(props.state, catalog, props.ui);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

function timedExistingPath() {
  let ms = 0;
  const props = setup({ now: () => new Date(Date.parse('2026-10-24T10:00:00Z') + ms).toISOString() });
  const pathId = props.assignQuestion({ questionId: 'q-eq-1' });
  const itemId = props.getState().paths[0].items[0].id;
  props.dispatch({ type: 'PRESENT_QUESTION', pathId, itemId });
  props.syncVisibility = () => {
    const visible = !isInitialAssessmentVisible(props.getState(), props.ui);
    if (props.getState().paths[0].visible !== visible) props.dispatch({ type: 'SET_VISIBILITY', pathId, visible });
  };
  return { props, pathId, itemId, time: (value) => { ms = value; } };
}

test('기존 학습 이어가기는 이미 제시된 문제의 멈춘 풀이 시간을 다시 시작한다', () => {
  const { props, pathId, itemId, time } = timedExistingPath();
  time(10000); props.syncVisibility();
  props.state = props.getState(); renderInitialAssessment(props);
  time(20000);
  click(props, { initialAction: 'dismiss' });
  assert.equal(props.getState().paths[0].visible, true);
  time(50000); props.dispatch({ type: 'SUBMIT_ANSWER', pathId, itemId, submissionId: 'clock-resume', choiceId: 'c' });
  assert.equal(props.getState().attempts[0].activeMs, 40000);
});

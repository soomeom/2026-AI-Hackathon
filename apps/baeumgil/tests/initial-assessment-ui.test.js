import test from 'node:test';
import assert from 'node:assert/strict';
import { renderInitialAssessment, initialAssessmentPanel, handleInitialAssessmentAction, isInitialAssessmentVisible } from '../public/src/ui/initial-assessment.js';
import { renderLearner } from '../public/src/ui/learner.js';
import { renderMentor } from '../public/src/ui/mentor.js';
import { createStore, createDemoState } from '../public/src/state/store.js';
import { initialQuestions, initialAssessmentSummary } from '../public/src/learning/initial-assessment.js';
import { makeCatalog } from './fixtures.js';

const catalog = makeCatalog();
const setup = (options = {}) => {
  const store = createStore({ initialState: createDemoState(), catalog, ...options });
  const ui = { ai: {}, selected: {}, help: {}, openEvidence: {}, mentorTab: 'home', initialChoices: {} };
  const root = { innerHTML: '', onclick: null, onchange: null };
  const props = { ...store, catalog, ui, root, state: store.getState() };
  props.rerender = () => { props.state = props.getState(); };
  return props;
};
const finish = props => {
  props.startInitialAssessment();
  const assessmentId = props.getState().initialAssessments[0].id;
  for (const q of initialQuestions()) {
    props.presentInitialQuestion({ assessmentId, questionId: q.id });
    props.submitInitialAnswer({ assessmentId, questionId: q.id, abstained: true });
  }
  props.state = props.getState();
  return assessmentId;
};

test('처음 멘티 화면에 7문항 안내·모름·제한을 보여 주고 기존 학습은 계속할 수 있다', () => {
  const props = setup();
  renderLearner(props);
  assert.match(props.root.innerHTML, /첫 수준 확인/);
  assert.match(props.root.innerHTML, /7문제/);
  assert.match(props.root.innerHTML, /시간 제한/);
  assert.match(props.root.innerHTML, /전체 수학 실력/);
  props.assignQuestion({ questionId: 'q-eq-1' }); props.state = props.getState();
  renderInitialAssessment(props);
  assert.match(props.root.innerHTML, /기존 학습 이어가기/);
});

test('제시된 현재 문항을 보여 주고 미선택 제출은 비활성화하며 다시 그려도 노출은 하나다', () => {
  const props = setup(); props.startInitialAssessment(); props.state = props.getState();
  renderInitialAssessment(props); props.state = props.getState();
  renderInitialAssessment(props);
  assert.match(props.root.innerHTML, /1\s*\/\s*7/);
  assert.match(props.root.innerHTML, /잘 모르겠어요/);
  assert.match(props.root.innerHTML, /data-initial-action="submit" disabled/);
  assert.doesNotMatch(props.root.innerHTML, /정답이에요/);
  assert.equal(props.getState().exposures.length, 1);
});

test('UI 모름 제출은 저장 상태를 변경하고 다음 문항으로 이어진다', () => {
  const props = setup(); props.startInitialAssessment(); props.state = props.getState();
  renderInitialAssessment(props); props.state = props.getState();
  renderInitialAssessment(props);
  props.root.onclick({ target: { closest: () => ({ disabled: false, dataset: { initialAction: 'unknown', initialQuestion: initialQuestions()[0].id } }) } });
  props.state = props.getState(); renderInitialAssessment(props); props.state = props.getState(); renderInitialAssessment(props);
  assert.equal(props.state.initialAssessments[0].answers[0].result, 'abstained');
  assert.match(props.root.innerHTML, /2\s*\/\s*7/);
});

test('이전 문제의 제출 이벤트가 늦게 도착해도 다음 문항을 대신 제출하지 않는다', () => {
  const props = setup(); props.startInitialAssessment(); props.state = props.getState();
  renderInitialAssessment(props); renderInitialAssessment(props);
  const event = { target: { closest: () => ({ disabled: false, dataset: { initialAction: 'unknown', initialQuestion: initialQuestions()[0].id } }) } };
  props.root.onclick(event);
  renderInitialAssessment(props); renderInitialAssessment(props);
  props.root.onclick(event);
  assert.equal(props.getState().initialAssessments[0].answers.length, 1);
});

test('완료 후 멘티는 결과·멘토 대기를 보고 멘토 확정 후 배정된 기존 학습으로 간다', () => {
  const props = setup(); const assessmentId = finish(props);
  assert.equal(renderInitialAssessment(props), true);
  assert.match(props.root.innerHTML, /멘토가/);
  assert.match(props.root.innerHTML, /모름/);
  const pathId = props.planInitialLesson({ assessmentId, conceptId: 'c-int-addsub', questionId: 'q-rat-1' });
  props.state = props.getState();
  assert.equal(renderInitialAssessment(props), false);
  renderLearner(props);
  assert.match(props.root.innerHTML, /첫 수업 시작 개념/);
  assert.equal(props.state.paths[0].id, pathId);
});

test('멘토 홈에 미시작·진행 중·완료 보고서를 구분해서 표시한다', () => {
  const props = setup(); renderMentor(props);
  assert.match(props.root.innerHTML, /첫 수준 확인/);
  assert.match(props.root.innerHTML, /아직/);
  props.startInitialAssessment(); props.state = props.getState();
  assert.match(initialAssessmentPanel(props.state, catalog, props.ui), /진행 중/);
  finish(props); renderMentor(props);
  assert.match(props.root.innerHTML, /시작 개념/);
  assert.match(props.root.innerHTML, /첫 문제/);
  assert.match(props.root.innerHTML, /멘토가 확정/);
});

test('멘토는 추천과 다른 개념을 선택해 연결 문항만 보고 지정할 수 있다', () => {
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

test('선택 이유와 개념 이름은 HTML로 실행되지 않고 텍스트로 표시된다', () => {
  const props = setup(); const assessmentId = finish(props);
  props.planInitialLesson({ assessmentId, conceptId: 'c-int-addsub', questionId: 'q-rat-1', reason: '<script>unsafe()</script>' });
  props.state = props.getState();
  const html = initialAssessmentPanel(props.state, catalog, props.ui);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(initialAssessmentSummary(props.state, 'learner-1', { catalog }).startingPoint.pathId, props.state.paths[0].id);
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
  return { props, pathId, itemId, time: value => { ms = value; } };
}

test('기존 학습 이어가기는 이미 제시된 문제의 멈춘 풀이 시간을 다시 시작한다', () => {
  const { props, pathId, itemId, time } = timedExistingPath();
  time(10000); props.syncVisibility();
  props.state = props.getState(); renderInitialAssessment(props);
  time(20000);
  props.root.onclick({ target: { closest: () => ({ disabled: false, dataset: { initialAction: 'dismiss' } }) } });
  assert.equal(props.getState().paths[0].visible, true);
  time(50000); props.dispatch({ type: 'SUBMIT_ANSWER', pathId, itemId, submissionId: 'clock-resume', choiceId: 'c' });
  assert.equal(props.getState().attempts[0].activeMs, 40000);
});

test('이미 제시된 문제에서 초기 결과를 여는 동안은 풀이 시간에 포함하지 않는다', () => {
  const { props, pathId, itemId, time } = timedExistingPath();
  finish(props); props.ui.initialAssessmentDismissed = true;
  props.state = props.getState(); renderLearner(props);
  time(10000);
  props.root.onclick({ target: { closest: () => ({ disabled: false, dataset: { action: 'initial-open' } }) } });
  assert.equal(props.getState().paths[0].visible, false);
  props.state = props.getState(); renderInitialAssessment(props);
  time(40000);
  props.root.onclick({ target: { closest: () => ({ disabled: false, dataset: { initialAction: 'dismiss' } }) } });
  time(50000); props.dispatch({ type: 'SUBMIT_ANSWER', pathId, itemId, submissionId: 'clock-pause', choiceId: 'c' });
  assert.equal(props.getState().attempts[0].activeMs, 20000);
});

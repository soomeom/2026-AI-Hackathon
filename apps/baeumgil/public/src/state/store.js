// 화면용 상태 저장소. 학습 상태는 학습 엔진(applyLearningCommand)만 통해 바꾼다.
// createStore({ initialState, catalog, rng, now, onChange }) -> { getState, dispatch, subscribe, assignQuestion, update, replaceState }
// 저장(localStorage 등)은 여기서 하지 않는다. subscribe 로 persistence 어댑터를 연결한다.
import { applyLearningCommand } from '../learning/engine.js';
import { createInitialState } from '../domain/contracts.js';
import * as initial from '../learning/initial-assessment.js';

// 시연용 가명 데이터. 형식은 공통 계약(createInitialState)을 따른다.
export function createDemoState() {
  return createInitialState();
}

const nextIndex = (list, prefix) =>
  1 + Math.max(0, ...(list ?? []).map((x) => Number(String(x.id).slice(prefix.length)) || 0));

export function createStore({ initialState, catalog, rng = Math.random, now = () => new Date().toISOString(), onChange } = {}) {
  let state = initialState;
  let seq = 0;
  const subscribers = new Set(onChange ? [onChange] : []);

  const publish = (next, events) => {
    state = { ...next, revision: (next.revision ?? 0) + 1 };
    for (const fn of subscribers) fn(state, events);
  };

  function dispatch(command) {
    // 저장본을 다시 불러와도 이전 명령 ID 와 겹치지 않도록 무작위 ID 를 쓴다 (겹치면 엔진이 중복으로 무시)
    const full = { id: `cmd-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${++seq}`}`, at: now(), ...command };
    const { state: next, events } = applyLearningCommand(state, full, { catalog, rng });
    // 거부·중복이면 엔진이 원래 state 를 그대로 돌려준다
    if (next !== state) publish(next, events);
    return events;
  }

  // 멘토의 문항 지정: 과제를 만들고 새 학습 경로를 시작한다. 이전 경로는 덮어쓰지 않는다.
  function assignQuestion({ questionId, learnerId = state.learnerId, mentorId = state.mentorId }) {
    const assignmentId = `assignment-${nextIndex(state.assignments, 'assignment-')}`;
    const pathId = `path-${nextIndex(state.paths, 'path-')}`;
    const assignment = { id: assignmentId, learnerId, mentorId, questionId, assignedAt: now(), status: 'assigned' };
    publish({ ...state, assignments: [...(state.assignments ?? []), assignment] }, [{ type: 'assignmentCreated', assignmentId }]);
    const events = dispatch({ type: 'START_PATH', pathId, assignmentId, learnerId });
    if (events[0]?.type === 'commandRejected') throw new Error(`문항 지정 실패: ${events[0].reason}`);
    return pathId;
  }

  // 회기·일지·AI 기록처럼 엔진 밖의 변경. fn 은 새 state 를 돌려준다 (같은 객체면 변경 없음).
  // logs.js 함수는 revision 을 이미 올려서 돌려주므로 그대로 쓰고, 아니면 여기서 올린다.
  function update(fn, event = { type: 'stateUpdated' }) {
    const next = fn(state);
    if (next === state) return state;
    if ((next.revision ?? 0) > (state.revision ?? 0)) {
      state = next;
      for (const sub of subscribers) sub(state, [event]);
    } else {
      publish({ ...next, revision: state.revision ?? 0 }, [event]);
    }
    return state;
  }

  function replaceState(next) {
    state = next;
    for (const fn of subscribers) fn(state, [{ type: 'stateReplaced' }]);
  }

  return {
    getState: () => state,
    dispatch,
    assignQuestion,
    update,
    replaceState,
    startInitialAssessment: () => update(s => initial.startInitialAssessment(s, { learnerId: s.learnerId, id: `initial-${globalThis.crypto.randomUUID()}`, at: now() }, { catalog })),
    presentInitialQuestion: input => update(s => initial.presentInitialQuestion(s, { ...input, at: now() }, { catalog })),
    submitInitialAnswer: input => update(s => initial.submitInitialAnswer(s, { ...input, at: now() }, { catalog })),
    pauseInitialAssessment: input => update(s => initial.pauseInitialAssessment(s, { ...input, at: now() })),
    resumeInitialAssessment: input => update(s => initial.resumeInitialAssessment(s, { ...input, at: now() })),
    planInitialLesson(input) {
      update(s => initial.planInitialLesson(s, { learnerId: s.learnerId, mentorId: s.mentorId, ...input, at: now() }, { catalog, rng }));
      return state.startingPoints.find(p => p.assessmentId === input.assessmentId).pathId;
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}

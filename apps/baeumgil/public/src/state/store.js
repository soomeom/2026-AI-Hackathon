// 화면용 상태 저장소. 학습 상태는 학습 엔진(applyLearningCommand)만 통해 바꾼다.
// createStore({ initialState, catalog, rng, now, onChange }) -> { getState, dispatch, subscribe, assignQuestion, replaceState }
// 저장(localStorage 등)은 여기서 하지 않는다. subscribe 로 persistence 어댑터를 연결한다.
import { applyLearningCommand } from '../learning/engine.js';

export const DEMO_IDS = Object.freeze({ learnerId: 'learner-1', mentorId: 'mentor-1' });

// 시연용 가명 데이터. 실제 학생 정보를 넣지 않는다.
export function createDemoState() {
  return {
    schemaVersion: 1,
    revision: 0,
    learnerId: DEMO_IDS.learnerId,
    mentorId: DEMO_IDS.mentorId,
    learners: [{ id: DEMO_IDS.learnerId, alias: '하늘', note: '가명 · 고졸 검정고시 수학 준비' }],
    mentors: [{ id: DEMO_IDS.mentorId, alias: '김멘토' }],
    assignments: [],
    paths: [],
    attempts: [],
    exposures: [],
  };
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
    const full = { id: `cmd-${Date.now().toString(36)}-${++seq}`, at: now(), ...command };
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

  function replaceState(next) {
    state = next;
    for (const fn of subscribers) fn(state, [{ type: 'stateReplaced' }]);
  }

  return {
    getState: () => state,
    dispatch,
    assignQuestion,
    replaceState,
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}

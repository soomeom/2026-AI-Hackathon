// 테스트 공통 픽스처. 팀 공통 계약 ID는 여기서만 정의한다.
import { readFileSync } from 'node:fs';

export const IDS = Object.freeze({
  learnerId: 'learner-1',
  mentorId: 'mentor-1',
  assignmentId: 'assignment-1',
  pathId: 'path-1',
  originalAttemptId: 'original-1',
});

const CONTENT_DIR = new URL('../public/src/content/', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(new URL(name, CONTENT_DIR), 'utf8'));

// 매 호출마다 새 객체를 돌려주므로 테스트끼리 서로 오염시키지 않는다.
export function makeCatalog(overrides = {}) {
  return {
    ...readJson('questions.json'),
    ...readJson('concepts.json'),
    ...readJson('routes.json'),
    ...readJson('review.json'),
    ...structuredClone(overrides),
  };
}

export function makeQuestion(overrides = {}) {
  const base = makeCatalog().questions.find((q) => q.id === 'q-eq-1');
  return { ...base, ...structuredClone(overrides) };
}

// 학습 상태의 최소 형태. 필드 계약은 domain/contracts.js(지훈)가 확정되면 맞춘다.
export function makeState(overrides = {}) {
  return {
    learnerId: IDS.learnerId,
    mentorId: IDS.mentorId,
    assignments: [{ id: IDS.assignmentId, learnerId: IDS.learnerId, mentorId: IDS.mentorId, questionId: 'q-eq-1' }],
    paths: [{ id: IDS.pathId, assignmentId: IDS.assignmentId, stage: 'original_attempt', originalAttemptId: IDS.originalAttemptId }],
    attempts: [],
    exposures: [],
    ...structuredClone(overrides),
  };
}

export function command(type, payload = {}) {
  return { type, learnerId: IDS.learnerId, pathId: IDS.pathId, ...payload };
}

// reducer(state, command) => state 를 순서대로 적용한다.
export function runCommands(reducer, state, commands) {
  return commands.reduce((current, cmd) => reducer(current, cmd), state);
}

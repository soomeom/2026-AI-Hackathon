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

// 엔진이 저장하는 풀이 기록(attempt)과 같은 형태
let attemptSeq = 0;
export function makeAttempt(overrides = {}) {
  attemptSeq += 1;
  return {
    id: `attempt-${attemptSeq}`,
    submissionId: `sub-${attemptSeq}`,
    learnerId: IDS.learnerId,
    pathId: IDS.pathId,
    itemId: `item-${attemptSeq}`,
    sourceQuestionId: 'q-eq-1',
    stage: 'original_attempt',
    round: null,
    choiceId: 'c',
    abstained: false,
    result: 'correct',
    helpUsed: false,
    noveltyAtPresentation: 'first_seen',
    submittedAt: null,
    activeMs: null,
    ...overrides,
  };
}

// 시작된 경로(엔진 START_PATH 이후 형태)를 가진 상태
export function stateWithAttempts(attempts, pathOverrides = {}) {
  return makeState({
    paths: [{
      id: IDS.pathId, assignmentId: IDS.assignmentId, learnerId: IDS.learnerId, mentorId: IDS.mentorId,
      questionId: 'q-eq-1', routeId: 'route-eq-1', originalAttemptId: IDS.originalAttemptId,
      stage: 'completed', status: 'completed', items: [], pastItems: [], stageHistory: [],
      skippedStageIds: [], needsReview: false, overrides: [], helpUsage: [], mentorRequests: [],
      transferStatus: 'measured', transferResult: null, retryResult: null,
      ...pathOverrides,
    }],
    attempts,
  });
}

// 원 기출 오답 → 재도전 정답 → 새 적용 정답이지만, 새 적용 문항을 이미 본 적이 있는 상태
export function stateWithSeenTransfer() {
  return stateWithAttempts([
    makeAttempt({ id: IDS.originalAttemptId, stage: 'original_attempt', choiceId: 'b', result: 'incorrect' }),
    makeAttempt({ stage: 'original_retry', result: 'correct' }),
    makeAttempt({ stage: 'transfer_check', sourceQuestionId: 'q-eq-spare-1', choiceId: 'd', result: 'correct', noveltyAtPresentation: 'already_seen' }),
  ], { transferResult: 'correct', retryResult: 'correct' });
}

export function command(type, payload = {}) {
  return { type, learnerId: IDS.learnerId, pathId: IDS.pathId, ...payload };
}

// reducer(state, command) => state 를 순서대로 적용한다.
export function runCommands(reducer, state, commands) {
  return commands.reduce((current, cmd) => reducer(current, cmd), state);
}

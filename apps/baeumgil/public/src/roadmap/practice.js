// 로드맵 순서대로 문제 내기 (담당: 지훈)
// 적용 중인 루트(plans.js)의 노드를 앞에서부터 하나씩 연습한다. 문항과 규칙은 roadmap/practice-questions.json, 채점은 learning/grading.js(다은·수영).
// 한 노드는 3문항 묶음이다. 혼자 푼 정답이 2개 이상이면 다음 노드로 간다 (PRD 기초 연습 2/3 기준).
// 못 넘으면 두 번째 묶음을 내고, 그래도 못 넘으면 '멘토 확인 필요'로 남기고 다음 노드로 간다 (최대 두 묶음, 진행을 막지 않음).

import { gradeAnswer } from '../learning/grading.js';

export const PRACTICE_NODE_RESULTS = Object.freeze({
  PASSED: 'passed',
  NEEDS_MENTOR: 'needs_mentor',
  NO_QUESTIONS: 'no_questions',
});

const DEFAULT_RULES = { setSize: 3, passCorrect: 2, maxSets: 2 };

export function getPracticeQuestion(data, questionId) {
  return data.questions.find((question) => question.id === questionId) ?? null;
}

/** 노드의 n번째 묶음 문항 ID (문항 파일 순서) */
export function practiceQuestionIds(data, nodeId, set) {
  return data.questions.filter((question) => question.nodeId === nodeId && question.set === set).map((question) => question.id);
}

export function startRoadmapPractice(plan, data, { now = () => new Date() } = {}) {
  const session = {
    planId: plan.id,
    learnerId: plan.learnerId,
    status: 'active',
    nodeIds: [...plan.nodeIds],
    nodeIndex: 0,
    currentNodeId: null,
    set: 1,
    queue: [],
    currentId: null,
    attempts: [],
    nodeResults: [],
    startedAt: now().toISOString(),
    completedAt: null,
  };
  return enterNode(session, data, 0, now);
}

/** 원래 session은 바꾸지 않는다. 같은 제출 id를 다시 보내면 그대로 돌려준다 (중복 클릭) */
export function submitRoadmapPracticeAnswer(session, submission, data, { now = () => new Date() } = {}) {
  if (session.status !== 'active') {
    throw new Error('practiceClosed');
  }
  if (!submission.id) {
    throw new Error('submissionIdRequired');
  }
  if (session.attempts.some((attempt) => attempt.id === submission.id)) {
    return session;
  }
  if (submission.questionId !== session.currentId) {
    throw new Error('staleQuestion');
  }
  const question = getPracticeQuestion(data, session.currentId);
  // 무응답 제출은 gradeAnswer가 emptySubmission으로 막는다
  const result = gradeAnswer(question, { choiceId: submission.choiceId ?? null, abstained: Boolean(submission.abstained) });
  const next = structuredClone(session);
  next.attempts.push({
    id: submission.id,
    questionId: question.id,
    nodeId: next.currentNodeId,
    set: next.set,
    choiceId: submission.choiceId ?? null,
    result,
    helpUsed: Boolean(submission.helpUsed),
    independent: !submission.helpUsed,
    answeredAt: now().toISOString(),
  });
  next.queue.shift();
  if (next.queue.length > 0) {
    next.currentId = next.queue[0];
    return next;
  }

  const rules = { ...DEFAULT_RULES, ...data.rules };
  const independentCorrect = next.attempts.filter(
    (attempt) => attempt.nodeId === next.currentNodeId && attempt.set === next.set && attempt.result === 'correct' && attempt.independent,
  ).length;
  if (independentCorrect >= rules.passCorrect) {
    next.nodeResults.push({ nodeId: next.currentNodeId, result: PRACTICE_NODE_RESULTS.PASSED, sets: next.set });
    return enterNode(next, data, next.nodeIndex + 1, now);
  }
  const nextSet = practiceQuestionIds(data, next.currentNodeId, next.set + 1);
  if (next.set < rules.maxSets && nextSet.length > 0) {
    next.set += 1;
    next.queue = nextSet;
    next.currentId = nextSet[0];
    return next;
  }
  next.nodeResults.push({ nodeId: next.currentNodeId, result: PRACTICE_NODE_RESULTS.NEEDS_MENTOR, sets: next.set });
  return enterNode(next, data, next.nodeIndex + 1, now);
}

/** 화면 표시용: 루트의 노드마다 통과·멘토 확인 필요·진행 중·남음 */
export function summarizeRoadmapPractice(session) {
  const resultOf = new Map(session.nodeResults.map((entry) => [entry.nodeId, entry.result]));
  return {
    status: session.status,
    currentNodeId: session.currentNodeId,
    nodes: session.nodeIds.map((nodeId) => ({
      nodeId,
      status: resultOf.get(nodeId) ?? (nodeId === session.currentNodeId ? 'in_progress' : 'pending'),
    })),
    needsMentorNodeIds: session.nodeResults.filter((entry) => entry.result === PRACTICE_NODE_RESULTS.NEEDS_MENTOR).map((entry) => entry.nodeId),
  };
}

/** 진행 중이거나 끝난 연습을 state.roadmapPractices에 넣는다 (같은 id면 바꾼다) */
export function saveRoadmapPractice(state, { id, session, now = () => new Date() }) {
  const at = now().toISOString();
  const existing = (state.roadmapPractices ?? []).find((entry) => entry.id === id);
  const entry = {
    id,
    learnerId: session.learnerId,
    planId: session.planId,
    session,
    startedAt: existing?.startedAt ?? at,
    updatedAt: at,
    completedAt: session.status === 'completed' ? existing?.completedAt ?? at : null,
  };
  const others = (state.roadmapPractices ?? []).filter((other) => other.id !== id);
  return { ...state, roadmapPractices: [...others, entry] };
}

/** 학생의 가장 최근 연습 (이어서 풀기용) */
export function latestRoadmapPractice(state, learnerId) {
  return (state.roadmapPractices ?? [])
    .filter((entry) => entry.learnerId === learnerId)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .at(-1) ?? null;
}

// 문항이 없는 노드는 '문항 없음'으로 남기고 건너뛴다
function enterNode(session, data, index, now) {
  for (let i = index; i < session.nodeIds.length; i += 1) {
    const nodeId = session.nodeIds[i];
    const ids = practiceQuestionIds(data, nodeId, 1);
    if (ids.length === 0) {
      session.nodeResults.push({ nodeId, result: PRACTICE_NODE_RESULTS.NO_QUESTIONS, sets: 0 });
      continue;
    }
    session.nodeIndex = i;
    session.currentNodeId = nodeId;
    session.set = 1;
    session.queue = ids;
    session.currentId = ids[0];
    return session;
  }
  session.status = 'completed';
  session.nodeIndex = session.nodeIds.length;
  session.currentNodeId = null;
  session.queue = [];
  session.currentId = null;
  session.completedAt = now().toISOString();
  return session;
}

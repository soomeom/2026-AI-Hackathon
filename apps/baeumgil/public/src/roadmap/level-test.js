// 10분·30분 레벨테스트 진행·채점·요약 (담당: 지훈)
// 문항과 시험 구성은 roadmap/level-tests.json, 채점은 learning/grading.js(다은·수영)를 쓴다.
// 순서가 정해진 시험이다. 시간 제한은 화면이 재고, 시간이 끝나면 finishLevelTest로 닫는다.

import { gradeAnswer } from '../learning/grading.js';

export function getLevelTest(data, testId) {
  return data.tests.find((test) => test.id === testId) ?? null;
}

export function getLevelTestQuestion(data, questionId) {
  return data.questions.find((question) => question.id === questionId) ?? null;
}

export function startLevelTest(data, testId, { now = () => new Date() } = {}) {
  const test = getLevelTest(data, testId);
  if (!test) {
    throw new Error('unknownLevelTest');
  }
  return {
    testId,
    status: 'active',
    questionIds: [...test.questionIds],
    currentId: test.questionIds[0],
    attempts: [],
    timeLimitMinutes: test.timeLimitMinutes,
    startedAt: now().toISOString(),
    completedAt: null,
    stopReason: null,
  };
}

/** 원래 session은 바꾸지 않는다. 같은 제출 id를 다시 보내면 그대로 돌려준다 (중복 클릭) */
export function submitLevelTestAnswer(session, submission, data, { now = () => new Date() } = {}) {
  if (session.status !== 'active') {
    throw new Error('levelTestClosed');
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
  const question = getLevelTestQuestion(data, session.currentId);
  // 무응답 제출은 gradeAnswer가 emptySubmission으로 막는다
  const result = gradeAnswer(question, { choiceId: submission.choiceId ?? null, abstained: Boolean(submission.abstained) });
  const next = structuredClone(session);
  next.attempts.push({
    id: submission.id,
    questionId: question.id,
    choiceId: submission.choiceId ?? null,
    result,
    helpUsed: Boolean(submission.helpUsed),
    independent: !submission.helpUsed,
    answeredAt: now().toISOString(),
  });
  const nextIndex = next.questionIds.indexOf(question.id) + 1;
  if (nextIndex >= next.questionIds.length) {
    return close(next, 'all_answered', now);
  }
  next.currentId = next.questionIds[nextIndex];
  return next;
}

/** 시간이 끝났거나 학생이 그만둘 때. 답하지 않은 문항은 '미측정'으로 남는다 */
export function finishLevelTest(session, { reason = 'time_up', now = () => new Date() } = {}) {
  if (session.status !== 'active') {
    return session;
  }
  return close(structuredClone(session), reason, now);
}

export function remainingSeconds(session, { now = () => new Date() } = {}) {
  const elapsed = (now().getTime() - new Date(session.startedAt).getTime()) / 1000;
  return Math.max(0, Math.round(session.timeLimitMinutes * 60 - elapsed));
}

/**
 * 로드맵·AI가 읽는 요약. 모양은 diagnostic-log.js의 summarizeDiagnostic과 같다.
 * report.tier는 정답 수만 적는다. 수준을 단정하지 않는다 (PRD 2.3).
 */
export function summarizeLevelTest(session, data, graph) {
  const test = getLevelTest(data, session.testId);
  const clusterName = new Map((graph.clusters ?? []).map((cluster) => [cluster.id, cluster.name]));
  const attempts = session.attempts.map((attempt) => {
    const question = getLevelTestQuestion(data, attempt.questionId);
    return {
      id: attempt.id,
      domain: question.cluster,
      questionId: question.id,
      conceptIds: question.conceptIds,
      relatedNodeIds: question.relatedNodeIds ?? [],
      core: question.topic,
      level: question.grade,
      stage: test.name,
      result: attempt.result,
      independent: attempt.independent,
    };
  });

  const domains = [...new Set(session.questionIds.map((id) => getLevelTestQuestion(data, id).cluster))].map((cluster) => {
    const asked = session.questionIds.filter((id) => getLevelTestQuestion(data, id).cluster === cluster);
    const answered = attempts.filter((attempt) => attempt.domain === cluster);
    const correct = answered.filter((attempt) => attempt.result === 'correct').length;
    return {
      id: cluster,
      name: clusterName.get(cluster) ?? cluster,
      label: answered.length > 0 ? `${asked.length}문항 중 ${correct}개 정답` : '미측정',
      weak: answered.filter((attempt) => attempt.result !== 'correct').map((attempt) => attempt.core),
      unanswered: asked.length - answered.length,
    };
  });

  const correct = attempts.filter((attempt) => attempt.result === 'correct').length;
  const unanswered = session.questionIds.length - attempts.length;
  return {
    status: session.status,
    attempts,
    report: {
      tier: `${test.name}: ${session.questionIds.length}문항 중 ${correct}개 정답${unanswered > 0 ? `, ${unanswered}문항 미응답` : ''}`,
      domains,
      answered: attempts.length,
      unanswered,
      stopReason: session.stopReason,
      disclaimer: '선별 문항에 근거한 학습 시작점 추정입니다. 숙달이나 검정고시 합격을 보장하지 않습니다.',
    },
  };
}

function close(session, reason, now) {
  session.status = 'completed';
  session.stopReason = reason;
  session.currentId = null;
  session.completedAt = now().toISOString();
  return session;
}

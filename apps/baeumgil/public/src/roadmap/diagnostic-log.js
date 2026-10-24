// 레벨테스트 기록 저장과 요약 (담당: 지훈)
// 진행·채점은 learning/diagnostic.js(수영)가 하고, 여기서는 그 결과를 앱 기록에 남기고 로드맵·AI가 읽을 모양으로 정리한다.

import { diagnosticReport } from '../learning/diagnostic.js';

// depth: 영역의 고졸 본문항이 0, 틀려서 한 번 내려가면 1, 두 번 내려가면 2
export const DIAGNOSTIC_STAGES = Object.freeze({ 0: '고졸 본문항', 1: '1차 하위', 2: '2차 하위' });

/**
 * 진단 문항별 기록: [영역, 문항 ID, 개념 태그, 단계, 정답 여부]
 * 단계는 수준(level)이 아니라 같은 영역에서 몇 번 내려왔는지(depth)로 정한다.
 * 고졸 문항을 틀리고 중1~2로 바로 내려가도 처음 내려간 곳이면 '1차 하위'다.
 */
export function summarizeDiagnostic(session, bank, config) {
  const byId = new Map(bank.map((question) => [question.id, question]));
  const lastLevel = new Map();
  const depthByDomain = new Map();
  const attempts = session.attempts.map((attempt) => {
    const question = byId.get(attempt.questionId);
    let depth = 0;
    if (lastLevel.has(attempt.domain)) {
      depth = depthByDomain.get(attempt.domain) + (attempt.level < lastLevel.get(attempt.domain) ? 1 : 0);
    }
    lastLevel.set(attempt.domain, attempt.level);
    depthByDomain.set(attempt.domain, depth);
    return {
      id: attempt.id,
      domain: attempt.domain,
      questionId: attempt.questionId,
      conceptIds: question?.conceptIds ?? [],
      core: question?.curriculum?.core ?? null,
      level: attempt.level,
      depth,
      stage: DIAGNOSTIC_STAGES[Math.min(depth, 2)],
      result: attempt.result,
      independent: attempt.independent,
    };
  });
  return { status: session.status, attempts, report: diagnosticReport(session, bank, config) };
}

/** 진행 중이거나 끝난 레벨테스트를 state.diagnostics에 넣는다 (같은 id면 바꾼다) */
export function saveDiagnosticSession(state, { id, learnerId, session, now = () => new Date() }) {
  const at = now().toISOString();
  const existing = (state.diagnostics ?? []).find((entry) => entry.id === id);
  const entry = {
    id,
    learnerId,
    session,
    startedAt: existing?.startedAt ?? at,
    updatedAt: at,
    completedAt: session.status === 'completed' ? existing?.completedAt ?? at : null,
  };
  const others = (state.diagnostics ?? []).filter((other) => other.id !== id);
  return { ...state, diagnostics: [...others, entry] };
}

/** 학생의 가장 최근에 끝난 레벨테스트 */
export function latestCompletedDiagnostic(state, learnerId) {
  return (state.diagnostics ?? [])
    .filter((entry) => entry.learnerId === learnerId && entry.completedAt)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    .at(-1) ?? null;
}

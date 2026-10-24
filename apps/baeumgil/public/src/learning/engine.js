// 학습 상태 전이 엔진. applyLearningCommand(state, command, { catalog, rng }) -> { state, events }
// 입력 state 는 변경하지 않는다. 거부된 명령은 원래 state 와 commandRejected 이벤트를 돌려준다.
// 자율 학습만으로 sessions / logs(멘토링 회기·활동일지)는 만들지 않는다.
import { gradeAnswer } from './grading.js';
import { fingerprintQuestion, classifyNovelty } from './exposure.js';
import { generatePractice, instanceFromQuestion } from './generator.js';
import { listAssignableQuestions } from '../content/catalog.js';

export const STAGES = Object.freeze([
  'original_attempt', 'concept_check', 'foundation_practice', 'similar_practice',
  'original_retry', 'transfer_check', 'completed', 'needs_mentor',
]);
export const MAX_FOUNDATION_ROUNDS = 2;
export const FOUNDATION_PASS_COUNT = 2;

const TERMINAL = ['completed', 'needs_mentor'];
const SKIP_TO = { concept_check: 'foundation_practice', foundation_practice: 'similar_practice', similar_practice: 'original_retry' };
const HELP_TYPES = ['hint', 'solution'];
const DUPLICATE = Symbol('duplicate');

class Rejection extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}
const reject = (reason) => {
  throw new Rejection(reason);
};
const toMs = (at) => (at === undefined || at === null ? null : typeof at === 'number' ? at : Date.parse(at));

export function applyLearningCommand(state, command, { catalog, rng = Math.random } = {}) {
  if (command.id && (state.processedCommandIds ?? []).includes(command.id)) {
    return { state, events: [{ type: 'duplicateIgnored', commandId: command.id }] };
  }
  const handler = HANDLERS[command.type];
  const rejected = (reason) => ({ state, events: [{ type: 'commandRejected', commandType: command.type, reason }] });
  if (!handler) return rejected('unknownCommand');

  const next = structuredClone(state);
  next.attempts ??= [];
  next.exposures ??= [];
  let events;
  try {
    events = handler(next, command, { catalog, rng });
  } catch (err) {
    if (err instanceof Rejection) return rejected(err.reason);
    throw err;
  }
  if (events === DUPLICATE) return { state, events: [{ type: 'duplicateIgnored', submissionId: command.submissionId }] };
  if (command.id) next.processedCommandIds = [...(next.processedCommandIds ?? []), command.id];
  return { state: next, events };
}

/* ---------- 조회 ---------- */

function getPath(state, cmd) {
  const path = (state.paths ?? []).find((p) => p.id === cmd.pathId) ?? reject('pathNotFound');
  if (cmd.learnerId && path.learnerId && cmd.learnerId !== path.learnerId) reject('learnerMismatch');
  return path;
}
function requireStarted(path) {
  if (!path.routeId) reject('pathNotStarted');
}
function requireActive(path) {
  requireStarted(path);
  if (path.status === 'paused') reject('pathPaused');
  if (TERMINAL.includes(path.status)) reject('pathClosed');
}
const currentItem = (path, itemId) => path.items.find((i) => i.id === itemId) ?? reject('itemNotInStage');
const routeOf = (catalog, path) => catalog.routes.find((r) => r.id === path.routeId);
const questionOf = (catalog, id) => catalog.questions.find((q) => q.id === id);

/* ---------- 풀이 시간 (화면 숨김·일시정지 동안은 멈춤) ---------- */

function stopClock(path, reason, at) {
  if (path.clock.reasons.includes(reason)) return;
  if (path.clock.reasons.length === 0) path.clock.stoppedAt = at;
  path.clock.reasons.push(reason);
}
function startClock(path, reason, at) {
  if (!path.clock.reasons.includes(reason)) return;
  path.clock.reasons = path.clock.reasons.filter((r) => r !== reason);
  if (path.clock.reasons.length > 0) return;
  if (path.clock.stoppedAt !== null && at !== null) {
    for (const item of path.items) {
      if (item.presentedAtMs !== null && item.presentedAtMs !== undefined && !item.answered) {
        item.pausedMs += Math.max(0, at - Math.max(path.clock.stoppedAt, item.presentedAtMs));
      }
    }
  }
  path.clock.stoppedAt = null;
}
function activeMs(path, item, at) {
  if (at === null || item.presentedAtMs === null) return null;
  const stoppedNow = path.clock.stoppedAt !== null ? at - Math.max(path.clock.stoppedAt, item.presentedAtMs) : 0;
  return Math.max(0, at - item.presentedAtMs - item.pausedMs - stoppedNow);
}

/* ---------- 단계 진입과 추천 ---------- */

function enterStage(state, path, stage, ctx, reason) {
  const events = [{ type: 'stageEntered', pathId: path.id, from: path.stage, to: stage, reason }];
  path.stageHistory.push({ from: path.stage, to: stage, reason });
  path.pastItems.push(...path.items);
  path.items = [];
  path.recommendation = null;
  path.stage = stage;
  if (TERMINAL.includes(path.status)) path.status = 'active';

  const route = routeOf(ctx.catalog, path);
  const prefix = `${path.id}:${stage}`;
  const fromCatalog = (id, n) => instanceFromQuestion(questionOf(ctx.catalog, id), { id: `${prefix}:${n}`, stage });

  switch (stage) {
    case 'original_attempt':
      path.items = [fromCatalog(path.questionId, 1)];
      break;
    case 'original_retry':
      if (path.originalRetryUsed) reject('retryAlreadyUsed');
      path.originalRetryUsed = true;
      path.items = [fromCatalog(path.questionId, 1)];
      break;
    case 'concept_check': {
      // 원 기출에서 헷갈린 개념의 확인 문항을 먼저
      const rank = (id) => (questionOf(ctx.catalog, id).conceptIds.includes(path.focusConceptId) ? 0 : 1);
      const ids = [...route.conceptCheckQuestionIds].sort((a, b) => rank(a) - rank(b));
      path.items = ids.map((id, i) => fromCatalog(id, i + 1));
      break;
    }
    case 'foundation_practice':
    case 'similar_practice':
    case 'transfer_check': {
      if (stage === 'foundation_practice') path.foundationRound += 1;
      const round = stage === 'foundation_practice' ? `:r${path.foundationRound}` : '';
      const result = generatePractice({
        catalog: ctx.catalog, route, stage, learnerId: path.learnerId, state, rng: ctx.rng,
        focusConceptId: path.focusConceptId, idPrefix: `${prefix}${round}`,
      });
      if (result.status !== 'ok') {
        if (stage === 'transfer_check') {
          path.transferStatus = 'not_measured';
          path.transferUnavailableReason = result.reason;
          events.push({ type: 'transferUnavailable', pathId: path.id, reason: result.reason });
          events.push(...enterStage(state, path, 'needs_mentor', ctx, 'transferUnavailable'));
        } else {
          events.push(...enterStage(state, path, 'needs_mentor', ctx, 'practiceUnavailable'));
        }
        return events;
      }
      if (stage === 'transfer_check') path.transferStatus = 'pending';
      path.items = result.items;
      break;
    }
    case 'completed':
    case 'needs_mentor':
      path.status = stage;
      break;
    default:
      reject('unknownStage');
  }
  for (const item of path.items) Object.assign(item, { presentedAt: null, presentedAtMs: null, pausedMs: 0, answered: false });
  return events;
}

function recommend(path) {
  const results = path.items.map((i) => i.result);
  const correctCount = results.filter((r) => r === 'correct').length;
  let recommendation;
  switch (path.stage) {
    case 'original_attempt':
      recommendation = results[0] === 'correct'
        ? { nextStage: 'transfer_check', reason: 'originalCorrect' }
        : { nextStage: 'concept_check', reason: results[0] === 'abstained' ? 'originalAbstained' : 'originalIncorrect' };
      break;
    case 'concept_check':
      // 확인 문항을 모두 맞혔으면 선수 개념 대신 원 기출의 핵심 개념을 연습한다 (기초를 다 안다고 판정하지는 않음)
      recommendation = correctCount === results.length
        ? { nextStage: 'similar_practice', reason: 'conceptCheckAllCorrect' }
        : { nextStage: 'foundation_practice', reason: 'conceptCheckDone' };
      break;
    case 'foundation_practice':
      if (correctCount >= FOUNDATION_PASS_COUNT) recommendation = { nextStage: 'similar_practice', reason: 'foundationPassed' };
      else if (path.foundationRound < MAX_FOUNDATION_ROUNDS) recommendation = { nextStage: 'foundation_practice', reason: 'foundationRetry' };
      else recommendation = { nextStage: 'needs_mentor', reason: 'foundationMaxRounds' };
      break;
    case 'similar_practice':
      recommendation = { nextStage: 'original_retry', reason: 'similarDone' };
      if (correctCount === 0) recommendation.mentorCheckSuggested = true;
      break;
    case 'original_retry':
      path.retryResult = results[0];
      recommendation = { nextStage: 'transfer_check', reason: 'retryDone' };
      break;
    case 'transfer_check':
      path.transferStatus = 'measured';
      path.transferResult = results[0];
      recommendation = { nextStage: 'completed', reason: 'transferDone' };
      break;
  }
  path.recommendation = recommendation;
  return { type: 'stageCompleted', pathId: path.id, stage: path.stage, correctCount, total: results.length, recommendation };
}

/* ---------- 명령 ---------- */

const HANDLERS = {
  START_PATH(state, cmd, ctx) {
    let path = (state.paths ?? []).find((p) => p.id === cmd.pathId);
    if (!path) {
      if (!cmd.assignmentId) reject('pathNotFound');
      path = { id: cmd.pathId, assignmentId: cmd.assignmentId };
      state.paths = [...(state.paths ?? []), path];
    }
    if (path.routeId) reject('pathAlreadyStarted');
    const assignment = (state.assignments ?? []).find((a) => a.id === path.assignmentId) ?? reject('assignmentNotFound');
    if (cmd.learnerId && cmd.learnerId !== assignment.learnerId) reject('learnerMismatch');
    const question = listAssignableQuestions(ctx.catalog).find((q) => q.id === assignment.questionId) ?? reject('questionNotAssignable');
    const route = ctx.catalog.routes.find((r) => r.questionId === question.id);
    Object.assign(path, {
      learnerId: assignment.learnerId,
      mentorId: assignment.mentorId ?? state.mentorId,
      questionId: question.id,
      routeId: route.id,
      originalAttemptId: path.originalAttemptId ?? `${path.id}:original`,
      stage: null,
      status: 'active',
      items: [],
      pastItems: [],
      stageHistory: [],
      recommendation: null,
      focusConceptId: null,
      focusFromConceptCheck: false,
      foundationRound: 0,
      originalRetryUsed: false,
      retryResult: null,
      transferStatus: null,
      transferResult: null,
      skippedStageIds: [],
      needsReview: false,
      overrides: [],
      helpUsage: [],
      mentorRequests: [],
      visible: true,
      visibilityLog: [],
      clock: { stoppedAt: null, reasons: [] },
      startedAt: cmd.at ?? null,
    });
    return [{ type: 'pathStarted', pathId: path.id }, ...enterStage(state, path, 'original_attempt', ctx, 'start')];
  },

  PRESENT_QUESTION(state, cmd) {
    const path = getPath(state, cmd);
    requireActive(path);
    const item = currentItem(path, cmd.itemId);
    if (item.presentedAt !== null || item.noveltyAtPresentation) return [{ type: 'alreadyPresented', itemId: item.id }];
    // 신규 여부를 먼저 판정하고, 그다음 노출을 저장한다
    const fingerprint = fingerprintQuestion(item);
    const novelty = classifyNovelty(state, path.learnerId, fingerprint);
    state.exposures.push({
      id: `exposure-${state.exposures.length + 1}`,
      learnerId: path.learnerId,
      pathId: path.id,
      itemId: item.id,
      sourceQuestionId: item.sourceQuestionId,
      stage: path.stage,
      fingerprint,
      noveltyAtPresentation: novelty,
      presentedAt: cmd.at ?? null,
    });
    Object.assign(item, { noveltyAtPresentation: novelty, presentedAt: cmd.at ?? null, presentedAtMs: toMs(cmd.at) });
    return [{ type: 'questionPresented', pathId: path.id, itemId: item.id, novelty }];
  },

  SUBMIT_ANSWER(state, cmd) {
    if (!cmd.submissionId) reject('submissionIdRequired');
    if (state.attempts.some((a) => a.submissionId === cmd.submissionId)) return DUPLICATE;
    const path = getPath(state, cmd);
    requireActive(path);
    const item = currentItem(path, cmd.itemId);
    if (!item.noveltyAtPresentation) reject('notPresented');
    if (item.answered) reject('alreadyAnswered');

    let result;
    try {
      result = gradeAnswer(item, { choiceId: cmd.choiceId ?? null, abstained: Boolean(cmd.abstained) });
    } catch (err) {
      reject(err.code ?? 'invalidSubmission');
    }
    const at = toMs(cmd.at);
    state.attempts.push({
      id: path.stage === 'original_attempt' ? path.originalAttemptId : cmd.submissionId,
      submissionId: cmd.submissionId,
      learnerId: path.learnerId,
      pathId: path.id,
      itemId: item.id,
      sourceQuestionId: item.sourceQuestionId,
      stage: path.stage,
      round: path.stage === 'foundation_practice' ? path.foundationRound : null,
      choiceId: cmd.choiceId ?? null,
      abstained: Boolean(cmd.abstained),
      result,
      helpUsed: Boolean(item.helpUsed),
      noveltyAtPresentation: item.noveltyAtPresentation,
      submittedAt: cmd.at ?? null,
      activeMs: activeMs(path, item, at),
    });
    Object.assign(item, { answered: true, result });

    // 첫 오답·모름 개념을 우선 연습 후보로
    if (result !== 'correct') {
      if (path.stage === 'original_attempt') {
        path.focusConceptId = item.choices.find((c) => c.id === cmd.choiceId)?.misconceptionConceptId ?? null;
      } else if (path.stage === 'concept_check' && !path.focusFromConceptCheck) {
        path.focusConceptId = item.conceptIds[0];
        path.focusFromConceptCheck = true;
      }
    }

    const events = [{ type: 'answerGraded', pathId: path.id, itemId: item.id, result }];
    if (path.items.every((i) => i.answered)) events.push(recommend(path));
    return events;
  },

  USE_HELP(state, cmd) {
    const path = getPath(state, cmd);
    requireActive(path);
    const item = currentItem(path, cmd.itemId);
    if (!HELP_TYPES.includes(cmd.helpType)) reject('invalidHelpType');
    path.helpUsage.push({ itemId: item.id, helpType: cmd.helpType, at: cmd.at ?? null });
    if (!item.answered) item.helpUsed = true;
    return [{ type: 'helpUsed', pathId: path.id, itemId: item.id, helpType: cmd.helpType }];
  },

  SET_VISIBILITY(state, cmd) {
    const path = getPath(state, cmd);
    requireStarted(path);
    if (typeof cmd.visible !== 'boolean') reject('invalidVisibility');
    if (path.visible === cmd.visible) return [];
    const at = toMs(cmd.at);
    path.visible = cmd.visible;
    path.visibilityLog.push({ visible: cmd.visible, at: cmd.at ?? null });
    if (cmd.visible) startClock(path, 'hidden', at);
    else stopClock(path, 'hidden', at);
    return [{ type: 'visibilityChanged', pathId: path.id, visible: cmd.visible }];
  },

  ADVANCE(state, cmd, ctx) {
    const path = getPath(state, cmd);
    requireActive(path);
    if ((cmd.mode ?? 'recommended') === 'skip') {
      const next = SKIP_TO[path.stage] ?? reject('stageNotSkippable');
      path.skippedStageIds.push(path.stage);
      path.needsReview = true;
      return [{ type: 'stageSkipped', pathId: path.id, stage: path.stage }, ...enterStage(state, path, next, ctx, 'skip')];
    }
    if (!path.recommendation) reject('stageNotComplete');
    const { nextStage, reason } = path.recommendation;
    return enterStage(state, path, nextStage, ctx, reason);
  },

  PAUSE(state, cmd) {
    const path = getPath(state, cmd);
    requireActive(path);
    path.status = 'paused';
    stopClock(path, 'pause', toMs(cmd.at));
    return [{ type: 'pathPaused', pathId: path.id }];
  },

  RESUME(state, cmd) {
    const path = getPath(state, cmd);
    requireStarted(path);
    if (path.status !== 'paused') reject('pathNotPaused');
    path.status = 'active';
    startClock(path, 'pause', toMs(cmd.at));
    return [{ type: 'pathResumed', pathId: path.id }];
  },

  REQUEST_MENTOR(state, cmd) {
    const path = getPath(state, cmd);
    requireStarted(path);
    path.mentorRequests.push({ stage: path.stage, reason: cmd.reason ?? null, at: cmd.at ?? null });
    return [{ type: 'mentorRequested', pathId: path.id, stage: path.stage }];
  },

  MENTOR_OVERRIDE(state, cmd, ctx) {
    const path = getPath(state, cmd);
    requireStarted(path);
    if (!cmd.mentorId || cmd.mentorId !== path.mentorId) reject('notMentor');
    if (!cmd.reason || !String(cmd.reason).trim()) reject('reasonRequired');
    if (!STAGES.includes(cmd.targetStage) || cmd.targetStage === 'original_attempt') reject('invalidTargetStage');
    path.overrides.push({ mentorId: cmd.mentorId, from: path.stage, to: cmd.targetStage, reason: cmd.reason, at: cmd.at ?? null });
    return [
      { type: 'mentorOverridden', pathId: path.id, from: path.stage, to: cmd.targetStage },
      ...enterStage(state, path, cmd.targetStage, ctx, 'mentorOverride'),
    ];
  },
};

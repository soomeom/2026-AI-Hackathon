// 팀 모듈이 실제로 맞물리는지 확인하는 통합 테스트 (담당: 지훈)
// 시연 데이터(seed) → 학습 엔진(다은·수영) → 저장(persistence) → AI 입력·검증(다은·수영) + /api/ai → 회기·일지·대장(logs)

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildAIInput } from '../public/src/ai/contracts.js';
import { ATTENDANCE, DEMO_IDS } from '../public/src/domain/contracts.js';
import { createDemoAppState } from '../public/src/domain/seed.js';
import { applyLearningCommand } from '../public/src/learning/engine.js';
import { normalizeChoiceValue } from '../public/src/learning/exposure.js';
import { MENTORING_COMMANDS, applyMentoringCommand, buildMonthlyLedger } from '../public/src/mentoring/logs.js';
import { buildLearnerSummary } from '../public/src/mentoring/summary.js';
import { createPersistence } from '../public/src/state/persistence.js';
import { createAiHandler } from '../server/ai/handler.mjs';
import { makeCatalog } from './fixtures.js';
import { MemoryStorage } from './memory-storage.js';

const catalog = makeCatalog();
const pathOf = (state) => state.paths.find((path) => path.id === DEMO_IDS.path);

function learn(state, command) {
  const result = applyLearningCommand(state, { learnerId: DEMO_IDS.learner, pathId: DEMO_IDS.path, ...command }, { catalog });
  const rejected = result.events.find((event) => event.type === 'commandRejected');
  assert.equal(rejected, undefined, `엔진이 명령을 거부함: ${JSON.stringify(rejected)}`);
  return result.state;
}

let submission = 0;
// outcome: 'correct' | 'incorrect' | 선택지 값
function answerNext(state, outcome) {
  const item = pathOf(state).items.find((entry) => !entry.answered);
  const presented = learn(state, { type: 'PRESENT_QUESTION', itemId: item.id });
  const isAnswer = (choice) => normalizeChoiceValue(choice.value) === normalizeChoiceValue(item.answer);
  const choice =
    outcome === 'correct' ? item.choices.find(isAnswer)
      : outcome === 'incorrect' ? item.choices.find((entry) => !isAnswer(entry))
        : item.choices.find((entry) => entry.value === outcome);
  return learn(presented, { type: 'SUBMIT_ANSWER', itemId: item.id, submissionId: `sub-${++submission}`, choiceId: choice.id });
}

function mentoring(state, command) {
  const result = applyMentoringCommand(state, command, { now: () => new Date('2026-10-24T09:00:00.000Z') });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result.value;
}

// 원 기출 오답(분배법칙 부호 실수) → 개념 확인 1문항 오답, 1문항 정답
function learnedState() {
  let state = learn(createDemoAppState(), { type: 'START_PATH', assignmentId: DEMO_IDS.assignment });
  state = answerNext(state, '4');
  state = learn(state, { type: 'ADVANCE' });
  state = answerNext(state, 'incorrect');
  return answerNext(state, 'correct');
}

test('시연 데이터로 학습하고, 저장 후 새로고침해도 이어서 진행된다', async () => {
  let state = learn(createDemoAppState(), { type: 'START_PATH', assignmentId: DEMO_IDS.assignment });
  state = answerNext(state, '4');
  assert.equal(state.attempts[0].result, 'incorrect');
  assert.equal(pathOf(state).recommendation.nextStage, 'concept_check');
  // 자율 학습만으로 회기·일지가 생기지 않는다 (AC-11)
  assert.deepEqual(state.sessions, []);
  assert.deepEqual(state.logs, []);

  const storage = new MemoryStorage();
  const saved = await createPersistence({ storage }).save(state);
  assert.equal(saved.ok, true);

  const reloaded = await createPersistence({ storage }).load();
  assert.equal(reloaded.value.source, 'stored');
  const resumed = learn(reloaded.value.state, { type: 'ADVANCE' });
  assert.equal(pathOf(resumed).stage, 'concept_check');
  assert.equal(resumed.attempts[0].id, pathOf(resumed).originalAttemptId);
});

test('학습 기록으로 AI 수업 제안을 받고, 회기 일지를 확정해 대장에 올린다', async () => {
  let state = learnedState();

  // 1) 멘토가 실제 회기와 관찰 메모를 입력한다
  const created = mentoring(state, {
    type: MENTORING_COMMANDS.CREATE_SESSION,
    learnerId: DEMO_IDS.learner,
    mentorId: DEMO_IDS.mentor,
    localDate: '2026-10-24',
    linkedPathIds: [DEMO_IDS.path],
    note: '하늘이 괄호 앞 음수의 부호가 헷갈린다고 말함',
  });
  state = created.state;
  const sessionId = created.events[0].sessionId;

  // 2) AI 입력은 회기 메모를 읽되 학생 이름은 가린다
  const input = buildAIInput(state, { learnerId: DEMO_IDS.learner, sessionId, kind: 'lesson_plan', catalog });
  assert.match(input.note, /학습자 A/);
  assert.doesNotMatch(input.note, /하늘/);
  assert.ok(input.facts.evidence.length > 0);

  // 3) /api/ai는 허용된 ID로 만든 제안만 돌려준다
  const evidence = input.facts.evidence[0];
  const plan = {
    kind: 'lesson_plan',
    priorities: [{ conceptId: evidence.conceptId, evidenceIds: [evidence.id], reason: '원 기출과 개념 확인 문항에서 오답이 관찰됨' }],
    mentorQuestions: [{ text: '괄호를 풀 때 뒤의 항 부호를 어떻게 정했는지 설명해 볼래요?', conceptId: evidence.conceptId, evidenceIds: [evidence.id] }],
    plan: [{ minutes: 10, activity: '분배법칙 예제를 함께 전개하기', questionIds: [input.allowedQuestionIds[0]] }],
  };
  const handler = createAiHandler({
    provider: { name: 'fake', model: 'fake-model', generate: async () => ({ text: JSON.stringify(plan), model: 'fake-model' }) },
  });
  const { status, payload } = await handler({ requestId: 'ai-req-1', inputVersion: `rev-${state.revision}`, input });
  assert.equal(status, 200);
  assert.deepEqual(payload.output, plan);

  // 4) 수업 후 출석·시간을 넣고, 사실 요약과 함께 일지를 확정한다
  state = mentoring(state, {
    type: MENTORING_COMMANDS.UPDATE_SESSION,
    sessionId,
    changes: { attendance: ATTENDANCE.ATTENDED, activityMinutes: 50 },
  }).state;
  const draft = mentoring(state, {
    type: MENTORING_COMMANDS.SAVE_LOG_DRAFT,
    sessionId,
    factSummary: buildLearnerSummary(state, DEMO_IDS.learner, { catalog }),
    mentorText: '괄호가 있는 일차방정식에서 분배법칙 부호를 함께 점검함',
  });
  state = mentoring(draft.state, { type: MENTORING_COMMANDS.CONFIRM_LOG, logId: draft.events[0].logId, reviewed: true }).state;

  // 5) 저장 후 다시 읽어도 대장 결과가 같다
  const storage = new MemoryStorage();
  await createPersistence({ storage }).save(state);
  const reloaded = (await createPersistence({ storage }).load()).value.state;
  const ledger = buildMonthlyLedger(reloaded, { month: '2026-10' }).value;
  assert.equal(ledger.sessionCount, 1);
  assert.equal(ledger.totalMinutes, 50);
  assert.equal(ledger.rows[0].learnerName, '하늘');
  assert.ok(reloaded.logs[0].factSummary.originalStats);
});

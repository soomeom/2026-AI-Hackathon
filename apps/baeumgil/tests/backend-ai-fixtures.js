import { createInitialState } from '../public/src/domain/contracts.js';
import { buildAIInput } from '../public/src/ai/contracts.js';
import { makeCatalog, makeAttempt, stateWithAttempts } from './fixtures.js';

export function aiInput(kind = 'lesson_plan') {
  const state = createInitialState(stateWithAttempts([makeAttempt({ id: 'original-1', result: 'incorrect', choiceId: 'b' })]));
  return buildAIInput(state, { learnerId: 'learner-1', kind, catalog: makeCatalog(), requestId: 'request-1' });
}
export function aiOutput(kind = 'lesson_plan') {
  if (kind === 'log_narrative') return { kind, sentences: [{ text: '방정식 문항에서 오답이 관찰되어 풀이 과정을 확인하였다.', evidenceIds: ['ev-c-eq-solve'], questionIds: ['q-eq-1'] }] };
  return {
    kind,
    priorities: [{ conceptId: 'c-eq-solve', evidenceIds: ['ev-c-eq-solve'], reason: '방정식 문항에서 오답이 관찰됨', misconceptionCandidate: '풀이 단계를 추가로 확인할 필요가 있음', explanationMethod: '등식의 양변에 같은 연산을 적용하는 과정을 확인', uncertainty: '한 문항으로 오개념을 확정하지 않음' }],
    mentorQuestions: [{ text: '어떤 순서로 식을 정리했는지 설명해 볼까요?', conceptId: 'c-eq-solve', evidenceIds: ['ev-c-eq-solve'] }],
    plan: [{ minutes: 10, activity: '방정식 풀이 단계를 함께 확인', questionIds: ['q-eq-1'] }],
  };
}

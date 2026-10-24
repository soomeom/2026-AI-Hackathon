// 실제 AI 호출 가능 여부 확인 (팀 역할 문서 2.2 첫 산출물 3번)
// 실행: npm run ai:check   (.env에 GEMINI_API_KEY 필요)
// 공용 테스트 자료(tests/fixtures.js)의 시연 기록으로 수업 제안을 1회 요청한다.

import { buildAIInput } from '../../public/src/ai/contracts.js';
import { makeAttempt, makeCatalog, stateWithAttempts } from '../../tests/fixtures.js';
import { loadConfig } from '../config.mjs';
import { createAiHandler } from './handler.mjs';

const config = loadConfig();
if (!config.provider) {
  console.error('GEMINI_API_KEY가 없어요. apps/baeumgil/.env.example을 복사해 .env를 만들고 키를 넣어 주세요.');
  process.exit(1);
}

// 원 기출 오답 → 분배법칙 확인 문항 오답 → 이항 확인 문항 정답
const state = stateWithAttempts([
  makeAttempt({ id: 'original-1', choiceId: 'b', result: 'incorrect' }),
  makeAttempt({ stage: 'concept_check', sourceQuestionId: 'q-cc-distribute-1', choiceId: 'a', result: 'incorrect' }),
  makeAttempt({ stage: 'concept_check', sourceQuestionId: 'q-cc-transpose-1', choiceId: 'b', result: 'correct' }),
]);
const input = buildAIInput(state, { learnerId: 'learner-1', kind: 'lesson_plan', catalog: makeCatalog() });

const handler = createAiHandler({ provider: config.provider });
const startedAt = Date.now();
const { status, payload } = await handler({ requestId: 'ai-check', inputVersion: 'fixtures', input });

console.log(`모델: ${config.aiStatus.model}`);
console.log(`HTTP ${status}, ${Date.now() - startedAt}ms`);
console.log(JSON.stringify(payload, null, 2));
process.exit(payload.ok ? 0 : 1);

// 실제 AI 호출 확인과 프롬프트 점검 (팀 역할 문서 2.2 첫 산출물 3번)
// 공용 테스트 자료(tests/fixtures.js)의 시연 기록으로 다은·수영님 ai/contracts.js 프롬프트를 만들어 보낸다.
//
//   npm run ai:check                                   수업 제안 1회 호출
//   npm run ai:check -- --kind=log_narrative --note="메모"   일지 문장, 관찰 메모 포함
//   npm run ai:prompt                                  Gemini에 보낼 프롬프트만 출력 (호출 안 함, 키 불필요)
//   --show-prompt                                      호출 전에 프롬프트도 출력

import { parseArgs } from 'node:util';

import { AI_KINDS, buildAIInput, buildAIPrompt } from '../../public/src/ai/contracts.js';
import { makeAttempt, makeCatalog, stateWithAttempts } from '../../tests/fixtures.js';
import { loadConfig } from '../config.mjs';
import { createAiHandler } from './handler.mjs';

const { values: options } = parseArgs({
  options: {
    kind: { type: 'string', default: 'lesson_plan' },
    note: { type: 'string', default: '' },
    'show-prompt': { type: 'boolean', default: false },
    'prompt-only': { type: 'boolean', default: false },
  },
});
if (!AI_KINDS.includes(options.kind)) {
  console.error(`--kind는 ${AI_KINDS.join(' 또는 ')}만 가능해요.`);
  process.exit(1);
}

// 원 기출 오답 → 분배법칙 확인 문항 오답 → 이항 확인 문항 정답
const state = stateWithAttempts([
  makeAttempt({ id: 'original-1', choiceId: 'b', result: 'incorrect' }),
  makeAttempt({ stage: 'concept_check', sourceQuestionId: 'q-cc-distribute-1', choiceId: 'a', result: 'incorrect' }),
  makeAttempt({ stage: 'concept_check', sourceQuestionId: 'q-cc-transpose-1', choiceId: 'b', result: 'correct' }),
]);
const input = buildAIInput(state, { learnerId: 'learner-1', kind: options.kind, catalog: makeCatalog(), note: options.note });

if (options['show-prompt'] || options['prompt-only']) {
  const prompt = buildAIPrompt(input);
  console.log('===== 시스템 지시 (규칙) =====');
  console.log(prompt.systemInstruction);
  console.log('\n===== 사용자 입력 (학생 기록 데이터) =====');
  console.log(prompt.userText);
  console.log('\n===== 응답 형식 (JSON 스키마) =====');
  console.log(JSON.stringify(prompt.responseSchema, null, 2));
  if (options['prompt-only']) {
    process.exit(0);
  }
  console.log('\n===== Gemini 호출 =====');
}

const config = loadConfig();
if (!config.provider) {
  console.error('GEMINI_API_KEY가 없어요. apps/baeumgil/.env.example을 복사해 .env를 만들고 키를 넣어 주세요.');
  process.exit(1);
}

// 실패하면 [ai] 줄의 detail에 원인(HTTP 상태, Gemini 오류 이유)이 나온다
const handler = createAiHandler({ provider: config.provider, log: (entry) => console.log('[ai]', JSON.stringify(entry)) });
const startedAt = Date.now();
const { status, payload } = await handler({ requestId: 'ai-check', inputVersion: 'fixtures', input });

console.log(`종류: ${options.kind}, 메모: ${options.note ? '있음' : '없음'}, 모델: ${config.aiStatus.model}`);
console.log(`HTTP ${status}, ${Date.now() - startedAt}ms`);
console.log(JSON.stringify(payload, null, 2));
process.exit(payload.ok ? 0 : 1);

// 실제 AI 호출 확인과 프롬프트 점검 (팀 역할 문서 2.2 첫 산출물 3번)
// 공용 테스트 자료(tests/fixtures.js)의 시연 기록으로 다은·수영님 ai/contracts.js 프롬프트를 만들어 보낸다.
//
//   npm run ai:check                                   수업 제안 1회 호출
//   npm run ai:check -- --kind=log_narrative --note="메모"   일지 문장, 관찰 메모 포함
//   npm run ai:prompt                                  Gemini에 보낼 프롬프트만 출력 (호출 안 함, 키 불필요)
//   npm run ai:lab -- --kind=lesson_plan               prompt-lab/<kind>.txt의 규칙으로 바꿔 호출 (팀 파일은 안 바뀜)
//   npm run ai:check -- --kind=roadmap_route --goal="간호사"   실제 로드맵·30분 레벨테스트 예시 결과로 루트 1회 호출
//   --show-prompt                                      호출 전에 프롬프트도 출력

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { AI_KINDS, buildAIInput, buildAIPrompt, buildGeminiRequest } from '../../public/src/ai/contracts.js';
import {
  ROADMAP_AI_KIND,
  buildRoadmapAIInput,
  buildRoadmapAIPrompt,
  buildRoadmapGeminiRequest,
} from '../../public/src/roadmap/ai-route.js';
import { getLevelTestQuestion, startLevelTest, submitLevelTestAnswer, summarizeLevelTest } from '../../public/src/roadmap/level-test.js';
import { makeAttempt, makeCatalog, stateWithAttempts } from '../../tests/fixtures.js';
import { APP_ROOT, loadConfig } from '../config.mjs';
import { createAiHandler } from './handler.mjs';

const KINDS = [...AI_KINDS, ROADMAP_AI_KIND];
const { values: options } = parseArgs({
  options: {
    kind: { type: 'string', default: 'lesson_plan' },
    note: { type: 'string', default: '' },
    goal: { type: 'string', default: '' },
    'show-prompt': { type: 'boolean', default: false },
    'prompt-only': { type: 'boolean', default: false },
    lab: { type: 'boolean', default: false },
  },
});
if (!KINDS.includes(options.kind)) {
  console.error(`--kind는 ${KINDS.join(', ')} 중 하나만 가능해요.`);
  process.exit(1);
}

let input;
let buildPrompt;
let baseBuildRequest;
if (options.kind === ROADMAP_AI_KIND) {
  // 실제 로드맵(28개 개념)과 30분 레벨테스트에서 제곱근·근호 계산·근의 공식을 틀린 결과
  const readRoadmapData = (name) => JSON.parse(readFileSync(path.join(APP_ROOT, 'public/src/roadmap', name), 'utf8'));
  const graph = readRoadmapData('roadmap.json');
  const levelTests = readRoadmapData('level-tests.json');
  const wrong = new Set(['lt30-sqrt', 'lt30-radical', 'lt30-quad-formula']);
  let session = startLevelTest(levelTests, 'full-30');
  for (let n = 0; session.status === 'active'; n += 1) {
    const question = getLevelTestQuestion(levelTests, session.currentId);
    const choice = question.choices.find((entry) => (entry.value === question.answer) !== wrong.has(question.id));
    session = submitLevelTestAnswer(session, { id: `lt${n}`, questionId: question.id, choiceId: choice.id }, levelTests);
  }
  input = buildRoadmapAIInput({ graph, diagnostic: summarizeLevelTest(session, levelTests, graph), goal: options.goal });
  buildPrompt = buildRoadmapAIPrompt;
  baseBuildRequest = buildRoadmapGeminiRequest;
} else {
  // 원 기출 오답 → 분배법칙 확인 문항 오답 → 이항 확인 문항 정답
  const state = stateWithAttempts([
    makeAttempt({ id: 'original-1', choiceId: 'b', result: 'incorrect' }),
    makeAttempt({ stage: 'concept_check', sourceQuestionId: 'q-cc-distribute-1', choiceId: 'a', result: 'incorrect' }),
    makeAttempt({ stage: 'concept_check', sourceQuestionId: 'q-cc-transpose-1', choiceId: 'b', result: 'correct' }),
  ]);
  input = buildAIInput(state, { learnerId: 'learner-1', kind: options.kind, catalog: makeCatalog(), note: options.note });
  buildPrompt = buildAIPrompt;
  baseBuildRequest = buildGeminiRequest;
}

// 실험용 규칙: 학생 기록 데이터와 응답 형식·검증은 계약 것 그대로 두고 시스템 지시만 파일 내용으로 바꾼다
let buildRequest = baseBuildRequest;
if (options.lab) {
  const labFile = path.join(APP_ROOT, 'prompt-lab', `${options.kind}.txt`);
  if (!existsSync(labFile)) {
    mkdirSync(path.dirname(labFile), { recursive: true });
    writeFileSync(labFile, `${buildPrompt(input).systemInstruction}\n`, 'utf8');
    console.log(`실험용 프롬프트 파일을 만들었어요: ${labFile}`);
    console.log('지금 팀 프롬프트 규칙이 들어 있어요. 고쳐서 저장한 뒤 다시 실행하세요.');
    process.exit(0);
  }
  const labSystem = readFileSync(labFile, 'utf8').trim();
  if (labSystem === '') {
    console.error(`${labFile}이 비어 있어요.`);
    process.exit(1);
  }
  console.log(`실험용 프롬프트 사용 중: ${labFile}`);
  buildRequest = (aiInput) => ({ ...baseBuildRequest(aiInput), systemInstruction: { parts: [{ text: labSystem }] } });
}

if (options['show-prompt'] || options['prompt-only']) {
  const prompt = buildPrompt(input);
  console.log('===== 시스템 지시 (규칙) =====');
  console.log(buildRequest(input).systemInstruction.parts[0].text);
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
const handler = createAiHandler({
  provider: config.provider,
  buildRequest,
  log: (entry) => console.log('[ai]', JSON.stringify(entry)),
});
const startedAt = Date.now();
const { status, payload } = await handler({ requestId: 'ai-check', inputVersion: 'fixtures', input });

console.log(`종류: ${options.kind}, 메모: ${options.note ? '있음' : '없음'}, 프롬프트: ${options.lab ? '실험용' : '팀 기본'}, 모델: ${config.aiStatus.model}`);
console.log(`HTTP ${status}, ${Date.now() - startedAt}ms`);
console.log(JSON.stringify(payload, null, 2));
process.exit(payload.ok ? 0 : 1);

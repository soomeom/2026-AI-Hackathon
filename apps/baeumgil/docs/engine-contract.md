# 학습 엔진·요약·AI 연결 계약 (실제 코드 기준)

- **대상**: 예서님(FE), 지훈님(BE·서버·저장)
- **기준 코드**: `public/src/learning/engine.js`, `public/src/mentoring/summary.js`, `public/src/ai/contracts.js`
- **주의**: 개발 계획 문서 3절의 명령 형식(`payload` 객체, `instanceId`, `USE_HELP.kind`)은 실제 코드와 다르다. **이 문서와 코드가 기준이다.**

## 1. 카탈로그 불러오기

`public/src/content/`의 JSON 네 개를 합친 객체 하나가 카탈로그다. 브라우저에서는 `fetch`로 읽어 합친다.

```js
const files = ['questions', 'concepts', 'routes', 'review'];
const parts = await Promise.all(files.map((f) => fetch(`./src/content/${f}.json`).then((r) => r.json())));
const catalog = Object.assign({}, ...parts); // { questions, concepts, routes, templates, reviews }
```

- `listAssignableQuestions(catalog)` (`content/catalog.js`): 멘토가 지정할 수 있는 원 문항 목록. 지금은 `q-eq-1`, `q-rat-1`.
- `validateCatalog(catalog)` → `{ ok, errors }`

## 2. 상태(state)의 최소 형태

```js
{
  learnerId: 'learner-1', mentorId: 'mentor-1',
  assignments: [{ id: 'assignment-1', learnerId: 'learner-1', mentorId: 'mentor-1', questionId: 'q-eq-1' }],
  paths: [{ id: 'path-1', assignmentId: 'assignment-1' }],
  attempts: [], exposures: [],
  revision: 0, // 저장 버전 (지훈님 persistence). AI 늦은 응답 차단에도 쓰인다
}
```

엔진은 받은 state를 바꾸지 않고 새 state를 돌려준다. 저장·`revision` 증가는 엔진 밖(store·persistence)에서 한다.

## 3. 명령 보내기

```js
import { applyLearningCommand } from './src/learning/engine.js';
const { state: next, events } = applyLearningCommand(state, cmd, { catalog, rng: Math.random });
```

모든 명령에 공통으로 넣는 필드: `{ id, type, pathId, learnerId?, at }`

- `id`: 명령 고유 ID. 같은 `id`를 다시 보내면 무시된다(`duplicateIgnored`). 버튼 연타 방지에 쓴다.
- `at`: ISO 시각 문자열. 풀이 시간 계산에 쓴다.
- 필드는 **`payload`로 감싸지 않고 명령 객체에 바로** 넣는다.

| type | 추가 필드 | 하는 일 |
|---|---|---|
| `START_PATH` | `assignmentId` (경로가 state에 없을 때) | 경로 시작, `original_attempt` 단계 진입 |
| `PRESENT_QUESTION` | `itemId` | 문항이 화면에 처음 보일 때 1번. 새 문항 여부 판정 후 노출 기록. 다시 보내도 중복 기록 안 됨 |
| `SUBMIT_ANSWER` | `itemId`, `submissionId`, `choiceId` 또는 `abstained:true` | 채점·기록. **`PRESENT_QUESTION` 없이 보내면 거부** |
| `USE_HELP` | `itemId`, `helpType: 'hint' \| 'solution'` | 힌트·해설 사용 기록 |
| `REQUEST_MENTOR` | `reason?` | 멘토 도움 요청 기록 |
| `ADVANCE` | `mode?: 'skip'` | 추천 단계로 이동. `skip`은 현재 단계를 건너뜀 (`concept_check`, `foundation_practice`, `similar_practice`만 가능) |
| `PAUSE` / `RESUME` | — | 일시 중단·재개. 중단 중에는 풀이 시간이 멈춤 |
| `SET_VISIBILITY` | `visible: boolean` | `visibilitychange`에 연결. 숨김 동안 풀이 시간이 멈춤 |
| `MENTOR_OVERRIDE` | `mentorId`, `targetStage`, `reason` (필수) | 멘토가 단계를 바꿈. `needs_mentor` 상태에서도 가능 |

거부되면 state는 그대로이고 `events`가 `[{ type: 'commandRejected', commandType, reason }]`이다. 자주 보는 `reason`:

- `notPresented`: 문항을 표시하지 않고 제출함
- `stageNotComplete`: 현재 단계 문항을 다 풀지 않고 `ADVANCE`를 보냄
- `pathPaused`: 일시 중단 상태
- `pathClosed`: 완료 또는 멘토 확인 상태

## 4. 화면이 읽을 값 (`state.paths[i]`)

| 필드 | 의미 |
|---|---|
| `stage` | `original_attempt` → `concept_check` → `foundation_practice` → `similar_practice` → `original_retry` → `transfer_check` → `completed` / `needs_mentor` |
| `status` | `active`, `paused`, `completed`, `needs_mentor` |
| `items` | 현재 단계 문항들 `{ id, prompt, choices:[{id,value}], answered, result, solutionSteps, origin }`. `origin`: `catalog` / `generated` / `spare` |
| `recommendation` | 단계 문항을 다 풀면 생김 `{ nextStage, reason, mentorCheckSuggested? }`. 있으면 ‘다음’ 버튼을 활성화 |
| `foundationRound` | 기초 연습 회차 (최대 2) |
| `skippedStageIds`, `needsReview` | 건너뛴 단계 |
| `transferStatus` | `pending` / `measured` / `not_measured` |

`recommendation.reason` 값과 안내 문구 예시:

| reason | 다음 단계 | 안내 예시 |
|---|---|---|
| `originalCorrect` | `transfer_check` | 맞혔어요! 새 문제로 확인해 볼까요? |
| `originalIncorrect`, `originalAbstained` | `concept_check` | 어디서 막혔는지 짧게 확인해 봐요 |
| `conceptCheckDone` | `foundation_practice` | 필요한 기초부터 연습해요 |
| `conceptCheckAllCorrect` | `similar_practice` | 기초는 확인했어요. 비슷한 문제로 넘어가요 |
| `foundationPassed` | `similar_practice` | 좋아요, 비슷한 문제에 적용해 봐요 |
| `foundationRetry` | `foundation_practice` | 한 번 더 연습해 봐요 |
| `foundationMaxRounds` | `needs_mentor` | 멘토와 함께 확인해요 |
| `similarDone` (+`mentorCheckSuggested`) | `original_retry` | 처음 문제에 다시 도전해요 (+ 멘토와 확인을 권해요) |
| `retryDone` | `transfer_check` | 처음 보는 문제로 확인해요 |
| `transferDone` | `completed` | 오늘 학습 정리 |

학생 화면에는 `reason` 코드를 보여 주지 말고 위처럼 문장으로 바꾼다.

## 5. 멘토 대시보드: 학습 근거 요약

```js
import { buildLearnerSummary } from './src/mentoring/summary.js';
const summary = buildLearnerSummary(state, 'learner-1', { catalog }); // catalog 꼭 넘길 것
```

반환값 `{ timeline, evidence, originalStats, retryStats, transferStats, unmeasuredCount, reviewFlags }`

- `*Stats`: `{ correct, incorrect, abstained, attempted, rate }`. `rate`는 모름을 뺀 정답률이고 기록이 없으면 `null`
- `evidence[]`: `{ id, conceptName, status, observation, mentorQuestion, attemptIds }`
  - `status`는 `observed`(직접 확인), `inferred`(추정), `needs_review`(확인 필요). 색만으로 구분하지 말고 글자로도 표시한다.
- `reviewFlags[]`: `{ code, pathId, ... }` 객체 배열이다. 문자열 배열이 아니다.

## 6. AI 호출 (지훈님 서버 + 예서님 화면)

```js
import { buildAIInput, buildGeminiRequest, validateAIOutput } from './src/ai/contracts.js';
```

1. **브라우저**
   - `const input = buildAIInput(state, { learnerId, sessionId, kind, catalog, note, requestId })`
   - `kind`: `'lesson_plan'` 또는 `'log_narrative'`
   - `requestId`는 요청마다 새로 만든다. `input.inputRevision`에는 `state.revision`이 자동으로 들어간다.
2. **브라우저 → 서버**: `POST /api/ai`로 `input`을 보낸다.
3. **서버(지훈님)**
   - `buildGeminiRequest(input)`를 Gemini `generateContent` 요청 본문으로 쓴다.
   - 키는 서버 환경 변수에만 둔다. 15초가 지나거나 429(한도 초과)가 오면 실패로 응답한다.
   - 서버에서도 `validateAIOutput(input, 응답)`을 실행해 `{ ok, value | errors }`를 돌려준다.
4. **브라우저**
   - 응답이 왔을 때 `requestId`가 마지막 요청과 다르면 **버린다**.
   - `inputRevision`이 지금 `state.revision`과 다르면 ‘이전 기록 기준’으로 표시한다.

`lesson_plan` 출력의 `priorities[]` 필드:

- `conceptId`, `evidenceIds`, `reason`
- `misconceptionCandidate`: 확인할 오개념 후보
- `explanationMethod`: 설명 방법
- `uncertainty`: 불확실한 부분

`evidenceIds`를 누르면 `summary.evidence`의 해당 항목과 `attemptIds`의 실제 응답을 연다.

### 아직 연결되지 않은 것

- **활동일지 AI 입력에 회기 정보가 없다.** 날짜, 출석, 활동 시간이 빠져 있다. 지훈님의 `buildLogFacts` 결과를 `buildAIInput`의 `facts`에 어떻게 넣을지 지훈님과 다은·수영님이 합의해야 한다.
- AI 요청 상태(로딩, 취소, 15초 초과, 재시도)를 다루는 클라이언트(`public/src/ai/client.js`)는 예서님 담당이며 아직 없다.

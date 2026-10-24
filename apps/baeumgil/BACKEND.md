# 배움길 백엔드 (담당: 지훈)

팀 역할 문서 4절의 지훈님 담당 파일과 사용법, 예서님·다은·수영님에게 전달할 계약을 정리한다.
데이터 모양은 다은·수영님 엔진·요약·AI 계약(`main`)에 맞췄다. 이름을 바꿀 필요가 있으면 지훈에게 먼저 알려 준다.

## 실행

```bash
cd apps/baeumgil
cp .env.example .env      # GEMINI_API_KEY 입력
npm start                 # http://localhost:3000
npm test                  # 팀 전체 테스트 (node --test, 설치할 패키지 없음)
npm run ai:check          # 실제 Gemini 1회 호출 확인
npm run ai:prompt         # Gemini에 보낼 프롬프트만 출력 (키 불필요, 호출 안 함)
npm run ai:check -- --kind=log_narrative --note="관찰 메모"   # 일지 문장, 메모 포함
npm run ai:lab -- --kind=lesson_plan    # prompt-lab/<종류>.txt의 규칙으로 실험 (처음엔 파일만 만듦, Git 제외)
```

`ai:lab`은 시스템 지시(규칙)만 바꾸고, 학생 기록 데이터·응답 형식·출력 검증은 팀 것을 그대로 쓴다. 서버(`/api/ai`)는 항상 팀 프롬프트(`ai/contracts.js`)를 쓴다.

- Node.js 22.12 이상. 외부 패키지를 쓰지 않는다. `package.json`에 `"type"`을 두지 않는다(진단 테스트가 KaTeX를 CommonJS로 불러옴).
- 서버는 기본으로 `127.0.0.1`에만 열린다. 본선에서 다른 기기가 접속하려면 `HOST=0.0.0.0`으로 실행한다.
- `public/`을 정적 파일로 내보낸다. `public/index.html`은 예서님 파일이다.

## 파일

| 파일 | 내용 |
|---|---|
| `public/src/domain/contracts.js` | 단계·상태·결과 이름, 오류 코드와 기본 문구, 결과 형식, 앱 기록 모양, 한국 날짜 변환 |
| `public/src/domain/seed.js` | 시연용 가명 데이터: 학생 `learner-1`(하늘), 멘토 `mentor-1`(김멘토), 과제 `assignment-1`(`q-eq-1`) |
| `public/src/state/persistence.js` | 브라우저 저장 어댑터 (load·save·reset·backupRaw, 모두 비동기) |
| `public/src/mentoring/logs.js` | 회기·활동일지 명령, 월별 대장, 대장 복사 텍스트 |
| `public/src/roadmap/roadmap.json` | 로드맵 28개 개념(5개 묶음)과 선수 연결. 학년 순서 기준 팀 초안, 성취기준·교육자 검토 전 |
| `public/src/roadmap/level-tests.json` | 10분(고1 핵심 8문항)·30분(개념별 28문항) 레벨테스트 문항 |
| `public/src/roadmap/level-test.js` | 레벨테스트 진행·채점·시간 종료·결과 요약 |
| `public/src/roadmap/graph.js` | 그래프 검사(없는 선수·중복·순환), 노드별 선수/후위, 루트 순서 검사·정렬 |
| `public/src/roadmap/diagnostic-log.js` | 레벨테스트 기록 저장, 문항별 [영역·문항·개념·단계·정답] 요약 |
| `public/src/roadmap/ai-route.js` | AI 로드맵 루트 계약: 입력·프롬프트·응답 형식·출력 검증 |
| `public/src/roadmap/plans.js` | 검사를 통과한 AI 루트 바로 적용, AI 실패 시 규칙 기반 루트, 현재 적용 중인 루트 |
| `public/src/roadmap/practice-questions.json` | 노드마다 연습 6문항(3문항 묶음 2개), 레벨테스트와 같은 원문의 숫자만 바꾼 변형 |
| `public/src/roadmap/practice.js` | 적용된 루트 순서대로 문제 내기, 묶음 통과 판정, 연습 기록 저장 |
| `server.mjs`, `server/` | 로컬 서버, `/api/health`, `/api/ai`, Gemini 어댑터 |
| `tests/` 중 `persistence`·`logs`·`ai-handler`·`gemini`·`server`·`integration`·`roadmap`·`level-test`·`roadmap-practice` 테스트, `memory-storage.js`, `roadmap-fixtures.js` | 위 모듈 테스트와 팀 모듈 통합 테스트 |

## 공통 결과 형식

지훈 담당 모듈은 같은 형식으로 성공·실패를 돌려준다. (학습 엔진은 엔진 형식 `{ state, events }`를 그대로 쓴다.)

```js
{ ok: true, value: ... }
{ ok: false, error: { code: 'revision_conflict', message: '다른 곳에서 먼저 바뀐 기록이 있어요. ...', ...추가 정보 } }
```

`error.message`는 화면에 그대로 써도 되는 기본 문구다. 코드 목록은 `contracts.js`의 `ERROR_CODES`에 있다.

## 앱 기록 모양

엔진·요약·AI 입력이 읽는 모양 그대로 하나의 문서로 저장한다. 컬렉션은 모두 배열이다.

```js
{
  schemaVersion: 1, revision: 0, savedAt: null,
  learnerId: 'learner-1', mentorId: 'mentor-1',
  learners: [{ id, name, schoolLevel, goal, isDemo }],
  mentors: [{ id, name, isDemo }],
  assignments: [{ id, learnerId, mentorId, questionId, status, assignedAt }],
  paths: [], attempts: [], exposures: [],   // 학습 엔진이 채운다
  sessions: [], logs: [],                    // logs.js가 채운다
  aiArtifacts: [],                           // AI 결과와 채택 여부
  diagnostics: [],                           // 레벨테스트 진행 기록 (diagnostic-log.js)
  roadmapPlans: [],                          // 적용 중·교체된 로드맵 루트 (plans.js)
  roadmapPractices: []                       // 루트 순서대로 푼 연습 기록 (practice.js)
}
```

- 시작할 때는 `createDemoAppState()`를 쓰고, 엔진에 `START_PATH { pathId: 'path-1', assignmentId: 'assignment-1' }`를 보내면 학습 경로가 생긴다.
- 중복 제출 방지는 엔진이 `submissionId`로 처리한다.

## 저장 (`persistence.js`)

```js
import { createPersistence } from './src/state/persistence.js';
import { createDemoAppState } from './src/domain/seed.js';

const persistence = createPersistence();

const loaded = await persistence.load();
// 성공: { ok: true, value: { state, source: 'stored' | 'empty' } }
// 실패: corrupted_data | unsupported_schema | storage_unavailable  (기존 기록은 지우지 않음)

const saved = await persistence.save(state);
// 성공: { ok: true, value: { state } }  ← revision이 1 오른 state. 이후에는 이것을 쓴다
// 실패: revision_conflict | storage_quota_exceeded | storage_unavailable | invalid_state
//       storage_* 실패 문구는 '이 브라우저에 저장하지 못했어요'로 시작한다 (FR-09)

await persistence.reset({ confirmed: true, initialState: createDemoAppState() });
// 사용자가 초기화를 직접 확인한 뒤에만 호출 (AC-16). confirmed 없이는 reset_not_confirmed

await persistence.backupRaw(); // 읽을 수 없는 기록의 원문 (내려받기용)
```

- `save`는 넘긴 `state.revision`이 저장된 값과 같을 때만 쓴다. 다르면 `revision_conflict`로 거부한다.
- 저장은 한 번에 하나씩 차례로 `await`하고, 매번 반환된 state를 다음 저장에 쓴다 (예서님 `store.js`).
- 모든 함수가 비동기인 이유: 본선에 서버 저장으로 바꿔도 호출 코드를 고치지 않기 위해서다.
- 다중 탭 감지와 손상 기록 복구 화면은 PRD 4.2에 따라 대회 이후 작업이다.

## 회기·활동일지·월별 대장 (`logs.js`)

엔진처럼 명령을 받아 새 state를 돌려준다. 원래 state는 바꾸지 않는다.

```js
import { MENTORING_COMMANDS, applyMentoringCommand, buildMonthlyLedger, formatLedgerAsTsv, getSessionLogView } from './src/mentoring/logs.js';

const result = applyMentoringCommand(state, {
  type: MENTORING_COMMANDS.CREATE_SESSION,
  learnerId: 'learner-1', mentorId: 'mentor-1',
  localDate: '2026-10-24',          // toSeoulLocalDate()로 오늘 날짜를 만들 수 있다
  linkedPathIds: ['path-1'],
  note: '관찰 메모',
});
// { ok: true, value: { state, events: [{ type: 'SESSION_CREATED', sessionId }] } }
```

| 명령 | 입력 | 하는 일 |
|---|---|---|
| `CREATE_SESSION` | `learnerId`, `mentorId`, `localDate`, 선택: `attendance`·`activityMinutes`·`linkedPathIds`·`note` | 회기 생성. 출석은 `not_recorded`, 활동 시간은 `null`로 시작 (AC-11) |
| `UPDATE_SESSION` | `sessionId`, `changes: { 위 다섯 필드 중 일부 }` | 바뀐 필드를 `changeHistory`에 남김 |
| `SAVE_LOG_DRAFT` | `sessionId`, 선택: `factSummary`·`aiDraft`·`mentorText` | 열린 초안을 고치거나, 없으면 새 개정본 초안을 만듦. 확정본이 있으면 그 내용을 복사하고 `replacesLogId`를 남김 |
| `CONFIRM_LOG` | `logId`, `reviewed: true` | `attended` 출석, 1분 이상 정수 활동 시간, 검토 확인, 비어 있지 않은 내용일 때만 확정 (FR-07) |

- 회기 메모 필드는 `note`다. AI 입력(`buildAIInput`)이 `sessionId`로 이 메모를 읽고, 학생 이름은 '학습자 A'로 가린다.
- `factSummary`에는 `buildLearnerSummary(state, learnerId, { catalog })` 결과를 그대로 넣는다.
- `aiDraft`는 `/api/ai` 결과에서 고른 문장을 객체로 넣는다. 확정되는 내용은 항상 멘토가 고친 `mentorText`다.
- 확정본을 고치려면 `SAVE_LOG_DRAFT`로 새 개정본을 만든 뒤 다시 `CONFIRM_LOG`를 한다. 이전 확정본은 지우지 않는다.
- 확정 철회는 PRD 4.2에 따라 대회 이후 작업이다.

```js
buildMonthlyLedger(state, { month: '2026-10' });
// { ok: true, value: { month, rows: [{ localDate, learnerName, activityMinutes, content, logId, revision, ... }], sessionCount, totalMinutes } }
// 회기마다 최신 확정 개정본 하나만 센다. 초안·미확정 회기는 빠진다. 달은 회기의 한국 날짜 기준

formatLedgerAsTsv(ledger);   // 표 붙여넣기용 텍스트 (클립보드가 안 되면 이 텍스트를 선택 가능하게 보여 준다)
getSessionLogView(state, sessionId); // { draft, latestConfirmed, revisions }
```

## AI 서버 (`POST /api/ai`)

화면은 다은·수영님 `ai/contracts.js`의 `buildAIInput` 결과를 그대로 보낸다. 서버는 같은 모듈의 `buildGeminiRequest`로 Gemini 본문을 만들고, `validateAIOutput`을 통과한 결과만 돌려준다. 키는 서버에만 있고, 시스템 지시는 서버가 만들기 때문에 화면이 프롬프트를 바꿀 수 없다.

### 요청

```js
import { buildAIInput } from './src/ai/contracts.js';

const input = buildAIInput(state, { learnerId: 'learner-1', sessionId, kind: 'lesson_plan', catalog });
const response = await fetch('/api/ai', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ requestId: 'ai-req-3f2c', inputVersion: `rev-${state.revision}`, input }),
  signal: controller.signal, // 취소 버튼
});
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `requestId` | 예 | 화면이 만든 요청 ID. 응답에 그대로 돌아온다 |
| `inputVersion` | 아니오 | 입력을 만든 기록의 버전. 응답에 그대로 돌아온다 |
| `input` | 예 | `buildAIInput` 결과. `kind`는 `lesson_plan`(수업 제안) 또는 `log_narrative`(일지 문장) |

### 성공 (200)

```json
{
  "ok": true, "requestId": "ai-req-3f2c", "inputVersion": "rev-12", "kind": "lesson_plan",
  "source": "live_ai", "provider": "gemini", "model": "gemini-3.5-flash-lite",
  "output": { "kind": "lesson_plan", "priorities": [...], "mentorQuestions": [...], "plan": [...] },
  "completedAt": "2026-10-24T07:00:00.000Z"
}
```

`output`은 `validateAIOutput` 검사를 통과한 값이다. 형식은 `ai/contracts.js`의 `OUTPUT_SCHEMAS`를 따른다.

### 실패

```json
{
  "ok": false, "requestId": "ai-req-3f2c", "inputVersion": "rev-12", "kind": "lesson_plan",
  "error": { "code": "ai_timeout", "message": "AI 응답이 15초 안에 오지 않았어요. ...", "retryable": true }
}
```

| HTTP | `error.code` | 언제 | `retryable` |
|---|---|---|---|
| 400 | `invalid_request` | 요청 형식 오류 (`field`에 문제 필드) | false |
| 413 | `invalid_request` | 본문 100KB 초과 | false |
| 429 | `ai_rate_limited` | Gemini 무료 등급 한도 초과 | true |
| 502 | `ai_provider_error` | Gemini 오류·통신 실패·빈 응답 | true |
| 502 | `ai_invalid_output` | 검증 실패. `errors`에 `validateAIOutput`의 오류 목록 (`unknownEvidenceId` 등) | true |
| 503 | `ai_not_configured` | 서버에 `GEMINI_API_KEY`가 없음 | false |
| 504 | `ai_timeout` | 15초 초과 | true |

- 늦은 응답 처리 (AC-10): 화면은 마지막으로 보낸 `requestId`와 응답의 `requestId`가 다르면 그 응답을 버린다.
- 취소: 화면이 `AbortController`로 fetch를 끊으면 서버도 Gemini 호출을 멈춘다.
- 실패해도 대체 문장을 만들어 넣지 않는다 (PRD 10.2). 화면은 수동 작성으로 이어 간다.
- 서버 로그에는 요청 ID·종류·결과·시간만 남기고 입력 내용은 남기지 않는다.

### 준비 상태 (`GET /api/health`)

```json
{ "ok": true, "ai": { "configured": true, "provider": "gemini", "model": "gemini-3.5-flash-lite" } }
```

## 로드맵 (레벨테스트 + 꿈 → AI 루트)

흐름: 레벨테스트(10분·30분 `level-test.js` 또는 수영님 `diagnostic.js`) → 기록 저장·요약 → AI가 시작점·순서를 정함 → 코드가 규칙 검사 → 통과하면 바로 적용(AI 실패 시 규칙 기반 루트) → 루트 순서대로 연습 → 화면이 그래프에 표시.

### 로드맵 데이터 (`roadmap.json`)

```json
{
  "version": 1,
  "source": "근거 메모 (예: 2015 개정 고1 수학 성취기준)",
  "nodes": [
    { "id": "rm-vieta", "name": "근과 계수의 관계", "prerequisiteIds": ["rm-quad-factor", "rm-sqrt"], "conceptIds": ["astra-equations-l3-근과 계수의 관계"] }
  ]
}
```

- `prerequisiteIds`가 선수 노드, 그 반대 방향이 후위 노드다. 화면용 필드(분류·설명·좌표 등)는 자유롭게 더해도 된다.
- `conceptIds`는 레벨테스트 문항의 `conceptIds`와 같은 값을 쓴다. 이걸로 노드가 맞았는지·틀렸는지를 정한다.
- 받으면 `validateRoadmapGraph(graph)`로 없는 선수·중복 ID·순환을 먼저 검사한다.

### 화면이 쓰는 함수

```js
getNodeLinks(graph, nodeId);   // { node, prerequisites: [노드], successors: [노드] } → 노드를 눌렀을 때 연결 강조
summarizeDiagnostic(session, bank, config); // { attempts: [{ id, domain, questionId, conceptIds, core, level, depth, stage, result, independent }], report }
saveDiagnosticSession(state, { id, learnerId, session });  // state.diagnostics에 저장
buildRoadmapAIInput({ graph, diagnostic, goal, learnerNames }); // /api/ai로 보낼 input
applyAIRoadmapPlan(state, { learnerId, input, output: payload.value, aiRequestId }); // /api/ai 성공 결과를 다시 검사하고 바로 적용
applyRoadmapPlan(state, { learnerId, ...buildRuleRoadmapRoute(input), source: 'rule' }); // AI 실패(시간 초과·429 등) 때
currentRoadmapPlan(state, learnerId); // 지금 적용 중인 루트
```

- `stage`는 같은 영역에서 몇 번 내려왔는지로 정한다: `고졸 본문항` → `1차 하위` → `2차 하위`. 고졸에서 중1~2로 바로 내려가도 처음 내려간 곳이면 `1차 하위`다.
- 진단(`diagnostic.js`)에서 틀린 문항에 하위 문항(`fallback_question_id`)이 없으면, 같은 영역의 더 낮은 레벨 문항 중 아직 안 푼 것을 낸다. 더 낮은 레벨에도 남은 문항이 없을 때만 다음 영역으로 넘어간다.

### 10분·30분 레벨테스트 (`level-test.js`)

```js
let session = startLevelTest(levelTests, 'quick-10');           // 또는 'full-30'
session = submitLevelTestAnswer(session, { id, questionId: session.currentId, choiceId }, levelTests);
session = finishLevelTest(session, { reason: 'time_up' });       // 시간이 끝나면 (답 안 한 문항은 미응답)
remainingSeconds(session);                                        // 남은 시간(초)
const result = summarizeLevelTest(session, levelTests, roadmap);  // buildRoadmapAIInput의 diagnostic 자리에 그대로 넣는다
```

| 시험 | 문항 | 로드맵과 연결 |
|---|---|---|
| `quick-10` (10분) | 다항식의 연산, 인수분해, 이차방정식(판별식·근과 계수), 이차함수, 고차방정식, 이차부등식, 두 점 사이의 거리 | 판별식·근과 계수는 해당 노드에 직접, 나머지는 `relatedNodeIds`로 관련 기초에 간접 연결 |
| `full-30` (30분) | 로드맵 28개 개념마다 1문항 | 문항 `conceptIds` = 노드 ID (직접) |

- 노드 근거: 직접 문항 오답 → `failed`, 직접 문항 독립 정답 → `passed`, 간접 문항만 오답 → `needs_check`(어느 기초에서 막혔는지 아직 모름), 그 밖 → `unmeasured`.
- 시작점 후보 우선순위: `failed` → `needs_check` → `unmeasured`, 각 상태에서 가장 아래 노드.
- 36문항 중 25문항은 검정고시 기출(2022~2026, 한국교육과정평가원)의 숫자만 바꾼 변형이다. 문항 `reference.derivedFrom`이 원문 ID(`data/exam-sources/question-drafts.json`)다. 나머지 11문항은 같은 개념의 기출이 없거나(`no_official`), 그림이 있어야 하거나(`figure_required`), 기출 개념이 로드맵 개념과 달라(`concept_mismatch`) 자체 제작이며 `reference.note`에 이유를 적었다.
- 문항 정답은 `tests/level-test.test.js`가 다시 계산해 검사한다. 기출 이용 조건 확인(`usageReviewStatus: unverified`)과 교육자 검토(`educatorValidated`) 전이다.
- 수영님 진단(`diagnostic.js`) 개념 13개도 노드 `conceptIds`에 연결해 두어, 기존 레벨테스트 결과로도 같은 로드맵을 쓸 수 있다.

### AI 루트 규칙 (코드가 검사)

| 규칙 | 어기면 |
|---|---|
| 시작점은 `startCandidateIds`(막힌 노드 중 자기 선수에 막힌 노드가 없는 것) 중 하나 | `startNotCandidate` |
| `route[0]`이 시작점 | `startMismatch` |
| 로드맵에 있는 노드만, 한 번씩 | `unknownNodeId`, `duplicateNode` |
| 어떤 노드보다 그 선수 노드가 뒤에 오면 안 됨 | `prerequisiteAfter` |
| 근거는 레벨테스트 기록 ID만 | `unknownAttemptId` |
| 단정적 평가 표현 금지 | `judgementalLanguage` |

- AI는 꿈(목표)을 같은 단계에서 무엇을 먼저 할지와 동기 설명(`goalConnection`)에만 쓰고, 선수 관계를 건너뛰는 데 쓰지 않는다.
- 로드맵 데이터를 비우면 `/api/ai`는 `400 invalid_request`(`field: input.allowedNodeIds`, `reason: roadmap_empty`)로 거부한다.
- 위 규칙을 통과한 AI 루트는 멘토 채택 없이 바로 적용한다 (2026-10-24 지훈 결정, PRD FR-06·2.3과 다름 → 아래 PM 확인 항목). 새 루트가 오면 이전 루트는 지우지 않고 `replaced`로 남긴다.
- AI가 실패하면 `buildRuleRoadmapRoute(input)`: 시작점 후보와, 그 뒤에 이어지는 아직 확인되지 않은 노드를 선수 순서대로 놓는다.
- 실측(2026-10-24, 28개 로드맵 + 30분 테스트에서 제곱근·근호·근의 공식 오답): `npm run ai:check -- --kind=roadmap_route --goal="간호사"` 2.7초, 검증 통과. 시작점 제곱근. 레벨테스트를 기출 변형으로 바꾼 뒤 다시 실측: 2.3초, 검증 통과, 루트 제곱근 → 근호 계산 → 근의 공식.

### 루트 순서대로 연습 (`practice.js`)

```js
let session = startRoadmapPractice(currentRoadmapPlan(state, learnerId), practiceData); // practiceData = practice-questions.json
session = submitRoadmapPracticeAnswer(session, { id, questionId: session.currentId, choiceId, helpUsed }, practiceData);
summarizeRoadmapPractice(session); // { status, currentNodeId, nodes: [{ nodeId, status }], needsMentorNodeIds }
state = saveRoadmapPractice(state, { id, session });               // state.roadmapPractices
latestRoadmapPractice(state, learnerId);                            // 이어서 풀기
```

- 루트의 노드를 앞에서부터 하나씩. 한 노드는 3문항 묶음이고, 혼자 푼 정답(도움 사용 제외)이 2개 이상이면 다음 노드로 간다 (PRD 기초 연습 2/3 기준).
- 못 넘으면 두 번째 묶음 3문항. 그래도 못 넘으면 `needs_mentor`로 남기고 다음 노드로 간다 (최대 두 묶음, 진행을 막지 않음).
- 노드 상태: `passed` · `needs_mentor` · `no_questions`(문항 파일에 없는 노드는 건너뜀) · `in_progress` · `pending`. 모든 응답은 `attempts`에 남는다.
- 같은 제출 `id`는 다시 저장하지 않고, 지난 문항 답은 `staleQuestion`, 빈 제출은 `emptySubmission`, 끝난 연습은 `practiceClosed`.
- 연습 문항 168개: 노드마다 30분 레벨테스트 문항과 같은 원문(기출, 없으면 그 자체 제작 문항)의 숫자만 바꿨다. `tests/roadmap-practice.test.js`가 문제 문장의 숫자로 정답을 다시 풀고, 조사(을/를)도 검사한다.

## 팀원에게 확인받을 것

| 대상 | 확인할 것 |
|---|---|
| 다은·수영 | 앱 기록 모양(위 절)을 `tests/fixtures.js`의 `makeState`와 같은 것으로 확정해도 되는지 |
| 다은·수영 | Gemini 3 문서는 `temperature`를 기본값 1.0으로 두라고 권장한다(낮추면 반복·품질 저하 가능). `buildGeminiRequest`의 `temperature: 0.2`를 뺄지 |
| 다은·수영 | 관찰 메모가 있는 `log_narrative`는 실측 2회 중 1회 `sentences[n].evidenceIds` 빈 배열로 검증 실패했다(메모 내용 문장에 붙일 근거 ID가 없음). 메모용 참조 ID를 허용 목록에 넣거나, `toGeminiSchema`의 `refs`에 `minItems`를 넣는 방안 검토 |
| 다은·수영·PM | 기본 모델은 `gemini-3.5-flash-lite`. 2026-10-24 실측으로 수업 제안 1회가 약 4초에 검증까지 통과했다. `gemini-3.8-flash`는 60초 이상 걸려 15초 제한을 넘는다 |
| 예서 | 저장 호출 순서(직렬 `await`, 반환 state 사용)와 오류 문구를 그대로 쓸지 |
| PM | 무료 등급 Gemini 키 발급 담당, 시연 PC에서 `npm run ai:check` 확인 |
| PM·예서 | 본선 다른 기기 지원 시 `/api/state`·DB 도입 (역할 문서 5절 7가지 기록 필요) |
| PM·다은·수영 | 로드맵·AI 루트는 PRD FR-10(P1) 범위다. 이번에 넣을지와, 로드맵 데이터의 근거(교육과정 성취기준) 확인 |
| PM | AI 로드맵 루트를 멘토 채택 없이 바로 적용하게 바꿨다. PRD 2.3("AI가 교사·멘토의 최종 판단을 대신하는 운영"은 목표 아님)·FR-06("제안은 자동 적용되지 않음")과 다르므로 PRD를 고칠지 확인 |
| 수영 | 진단 하위 문항 연결을 바꿨다(`questions.json`·`concepts.json`): 고졸 1번 → 정수의 덧셈, 고졸 19·20번 → 경우 나열, 중졸 19번 → 이등변삼각형, 중졸 15번 하위 문항·선수 개념 비움(코드 규칙상 여전히 일차방정식이 나옴). 남은 것: 고졸 16번 합성함수, 11번 점과 직선 사이의 거리는 맞는 하위 문항이 없음 |
| 로드맵 담당 | `roadmap.json` 형식(위 절)과 노드 `conceptIds` 연결 |

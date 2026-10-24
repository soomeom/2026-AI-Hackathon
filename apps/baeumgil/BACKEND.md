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

- Node.js 20.12 이상. 외부 패키지를 쓰지 않는다.
- 서버는 기본으로 `127.0.0.1`에만 열린다. 본선에서 다른 기기가 접속하려면 `HOST=0.0.0.0`으로 실행한다.
- `public/`을 정적 파일로 내보낸다. `public/index.html`은 예서님 파일이다.

## 파일

| 파일 | 내용 |
|---|---|
| `public/src/domain/contracts.js` | 단계·상태·결과 이름, 오류 코드와 기본 문구, 결과 형식, 앱 기록 모양, 한국 날짜 변환 |
| `public/src/domain/seed.js` | 시연용 가명 데이터: 학생 `learner-1`(하늘), 멘토 `mentor-1`(김멘토), 과제 `assignment-1`(`q-eq-1`) |
| `public/src/state/persistence.js` | 브라우저 저장 어댑터 (load·save·reset·backupRaw, 모두 비동기) |
| `public/src/mentoring/logs.js` | 회기·활동일지 명령, 월별 대장, 대장 복사 텍스트 |
| `server.mjs`, `server/` | 로컬 서버, `/api/health`, `/api/ai`, Gemini 어댑터 |
| `tests/` 중 `persistence`·`logs`·`ai-handler`·`gemini`·`server`·`integration` 테스트, `memory-storage.js` | 위 모듈 테스트와 팀 모듈 통합 테스트 |

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
  aiArtifacts: []                            // AI 결과와 채택 여부
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

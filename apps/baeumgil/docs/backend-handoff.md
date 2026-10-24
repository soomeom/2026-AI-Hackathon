# 지훈 담당 백엔드 인수인계

## 제공 범위

| 영역 | 파일 | 제공 기능 |
| --- | --- | --- |
| 공통 상태 | `public/src/domain/contracts.js` | 초기 가명 상태, 상태·AI 입력 경계 검사 |
| 저장 | `public/src/state/persistence.js` | 로드·저장·명시적 초기화, 손상 원문 보존, revision 확인 |
| 회기·일지 | `public/src/mentoring/logs.js` | 회기 사실, 선택 회기 학습 스냅샷, 일지 확정·개정·철회, 월별 합산 |
| 서버 | `server.mjs` | public 정적 파일, 상태·초기 데이터·AI API |
| AI 공급자 | `server/ai-provider.mjs` | 서버 환경의 Gemini 키, 시간 제한, 출력 검증, 오류 정리 |

학습 단계·문항 생성·채점·요약·프롬프트는 다은·수영 담당 모듈을 그대로 사용한다. FE 화면과 연결 코드는 예서 담당 영역이다. 본 문서의 코드는 연결 예시다.

## 예서님: 초기 로드와 저장

`schemaVersion: 1` 상태는 `revision`, `activeRole`, `historyIntegrity`와 배열 `learners`, `mentors`, `assignments`, `paths`, `attempts`, `exposures`, `evidence`, `sessions`, `logs`, `aiArtifacts`, `events`, `processedCommandIds`를 가진다. 엔진이 추가한 경로·문항 필드는 보존한다. 공통 검증은 최상위 형태와 ID 중복을 검사하며 각 기능의 전체 의미를 대신 검증하지 않는다.

```js
import { loadState, saveState } from './src/state/persistence.js';
const bootstrap = await fetch('/api/bootstrap').then(r => r.json());
const loaded = loadState(localStorage);
// ready이면 loaded.state, empty일 때만 bootstrap.state로 시작한다.
// recovery_required이면 loaded.raw를 보존하고 복구/명시적 초기화 화면을 보인다.
```

저장 예시:

```js
const expectedRevision = state.revision;
const result = applyLearningCommand(state, command, { catalog });
if (result.events.some(e => e.type === 'commandRejected')) {
  // 거절 이유를 표시한다. 성공 화면으로 이동하지 않는다.
} else {
  const next = {
    ...result.state,
    revision: expectedRevision + 1,
    events: [...(result.state.events ?? []), ...result.events],
  };
  const saved = saveState(localStorage, next, expectedRevision);
  if (saved.ok) state = next;
  // 실패하면 성공 상태로 표시하지 않고 저장 오류/충돌 안내를 제공한다.
}
```

- 엔진 명령은 실제 구현의 최상위 필드를 사용한다. 예: `{ type: 'START_PATH', learnerId: 'learner-1', pathId: 'path-1' }`. 별도 `payload`로 감싸지 않는다.
- `saveState`는 revision을 올리지 않는다. 엔진·역할 변경은 호출자가 올리고, `saveSession`·`confirmLog`·`retractLog`는 반환 상태에서 이미 올린다. 같은 회기·같은 확정을 반복한 경우는 원래 상태를 반환하므로 재저장을 건너뛴다.
- 첫 상태를 즉시 저장하려면 revision 1로 만들어 expectedRevision 0으로 저장한다.
- 저장 실패 시 이전 저장값을 지우지 않는다. 손상·지원하지 않는 버전도 자동 초기화하지 않는다.
- `resetState(localStorage, { confirmed: true })`는 사용자가 확인한 초기화에만 사용한다. 확인 전 원문 보존·복사 기회를 제공한다.
- revision 비교는 오래된 상태 덮어쓰기를 줄이는 검사다. `localStorage`의 여러 탭 동시 쓰기를 원자적으로 보장하지 않는다. MVP는 한 탭에서 시연한다.

## API

모든 경로는 같은 로컬 서버에서 호출한다. 키와 서버 파일은 정적 공개 폴더 밖에 있다. 외부 Origin 요청은 거부한다.

| 요청 | 응답 |
| --- | --- |
| `GET /api/health` | `status`, `storage: 'browser-local'`, `authentication: 'demo-role-switch'`, `ai: {configured, provider, model}` |
| `GET /api/bootstrap` | `state`, `catalog`, `assignableQuestions`, `source: 'demo'`, `storage` |
| `POST /api/ai` | 직접 `AIInput`을 전송. 성공 시 아래 envelope, 실패 시 오류 envelope |

`bootstrap.state`는 매번 가명 초기 데이터다. 저장된 학습 기록이 있을 때 이것으로 덮어쓰지 않는다. `assignableQuestions`는 기존 카탈로그 검증을 통과한 원 문항 목록이다. 현재 자체 제작 문제이며 공식 기출이라는 뜻이 아니다.

AI 요청·채택 예시:

```js
import { buildAIInput, validateAIOutput } from './src/ai/contracts.js';
const requestId = crypto.randomUUID();
const input = buildAIInput(state, {
  learnerId: state.learnerId, kind: 'lesson_plan', catalog, requestId,
});
const response = await fetch('/api/ai', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(input), signal: abortController.signal,
});
const body = await response.json();
if (!response.ok || body.status !== 'ok') {
  // body.error.message 표시. 수동 작성은 계속 제공한다.
} else if (body.requestId === activeRequestId && body.inputRevision === state.revision) {
  const checked = validateAIOutput(input, body.output);
  // checked.ok일 때만 초안으로 표시하고 멘토가 검토한다.
}
```

호출 직전에 `activeRequestId = requestId`로 갱신한다. 역할·학생·입력 전환 때 이전 요청을 취소하고 활성 요청 ID를 지운다. 서버 응답 전체가 아니라 **`body.output`**이 기존 AI 출력 계약이다. 서버는 아래 envelope로 감싼다.

```json
{
  "status": "ok",
  "output": { "kind": "lesson_plan", "priorities": [], "mentorQuestions": [], "plan": [] },
  "requestId": "요청 ID",
  "inputRevision": 3,
  "source": "live"
}
```

위 배열은 envelope 설명용 자리이며 실제 빈 배열은 출력 계약을 통과하지 않는다. 수업 계획은 `priorities/mentorQuestions/plan`, 일지 문장은 `sentences` 구조다. 공동 `buildAIInput`·`validateAIOutput`을 사용하고 별도의 `recommendations` 형식을 만들지 않는다.

실패 형식: `{ status: 'failed', requestId, error: { code, message } }`. 미설정 503, 입력 오류 400, 과대 본문 413, 호출 한도 429, 시간 초과 504, 잘못된 AI 출력·연결 오류 502다. 제한 시간은 기본 15초이며 자동 재시도하지 않는다. 실패·검증 거절을 미리 만든 응답으로 바꿔 실제 AI 성공처럼 표시하지 않는다.

## 회기·일지·대장

```js
import {
  saveSession, createSessionSnapshot, buildLogFacts,
  confirmLog, retractLog, buildMonthlyLedger,
} from './src/mentoring/logs.js';

const next = saveSession(state, {
  id: 'session-1', learnerId: 'learner-1', mentorId: 'mentor-1',
  localDate: '2026-10-24', attendance: 'attended', actualMinutes: 30,
  pathIds: ['path-1'], note: '음수 계산 순서를 함께 확인함',
});
// saveState(localStorage, next, state.revision)가 성공한 뒤 state를 교체한다.
```

- 실제 회기 출석·분량·날짜는 멘토가 입력한다. 자율 학습이나 경로 완료가 자동으로 봉사 시간으로 기록되지 않는다.
- 출석 값은 `attended/absent/canceled/not_recorded`, 시간은 정수 분이다.
- `pathIds`에는 해당 회기에서 다룬 학생의 경로만 연결한다. 한 경로는 한 실제 회기에 연결하는 운영을 권장한다. 경로를 여러 회기에 재사용하면 경로 전체 이력이 반복 포함될 수 있다.
- 일지 AI는 `createSessionSnapshot(state, sessionId)`로 제한한 상태를 `buildAIInput`에 전달하고 `kind: 'log_narrative'`, `sessionId`를 지정한다. 전체 학생 이력을 일지 입력으로 보내지 않는다.
- `buildLogFacts(state, sessionId, { catalog })`는 회기 사실과 연결 학습 요약을 돌려준다. 양식 상태는 `unverified`다. 현재 센터 원본 양식 대조가 완료되었다고 표시하지 않는다.
- `confirmLog(state, { sessionId, content, reviewed: true })`: 출석·양수 분량·검토·본문이 필요하다. AI 없이 직접 쓴 내용도 확정할 수 있다.
- 개정본은 새 revision으로 이전 본문·회기·연결 학습 스냅샷을 보존한다. 확정 후 회기 원자료나 연결된 학습 기록이 바뀌면 재확정 전 월별 합산에서 빠진다. 학습 스냅샷이 없는 이전 확정본도 재검토가 필요하다.
- 같은 정규화된 회기 내용을 다시 저장하면 변경으로 처리하지 않는다. 실제 회기 변경 이벤트에는 수정 전후 사실을 보존한다.
- `retractLog(state, { sessionId, reason })`: 이유·이력을 남기고 최신본을 철회한다. 과거 확정본이 다시 집계되지 않는다.
- `buildMonthlyLedger(state, '2026-10')`: 한국 회기 날짜 기준 최신 유효 확정본만 합산한다. 결과는 `rows`, `totalMinutes`, `sessionCount`, `timezone`이다.
- 이 함수들은 로컬 상태를 반환한다. 실제 기관 제출·공식 봉사시간 승인·PDF/HWPX 출력은 수행하지 않는다.

## 현재 검증 한계와 후속 작업

- 실제 계정 Gemini 호출, FE 연결 후 전체 화면 시연, 센터 양식 대조는 별도 확인이 필요하다.
- 인증·서버 DB·여러 기기 공유·운영용 접근 제어는 후속 범위다. 실제 청소년 개인정보를 넣기 전에 별도 설계가 필요하다.
- 현재 schemaVersion 외 데이터의 자동 마이그레이션은 없다. 원문을 보존하고 명시적으로 복구/초기화한다.

공급자 요청 형식은 Google 공식 [generateContent 문서](https://ai.google.dev/api/generate-content), [API 키 문서](https://ai.google.dev/gemini-api/docs/api-key)를 기준으로 했다.

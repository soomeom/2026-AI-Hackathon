# 배움길 해커톤 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기출 한 문항의 오답을 개념 확인·기초 연습·유사 문제·원래 기출 재도전·새 적용 확인으로 연결하고, 같은 기록으로 멘토의 수업 준비와 활동일지를 완성한다.

**Architecture:** 브라우저의 학습 규칙·문항 생성·집계를 AI와 분리한다. 학습 상태는 하나의 로컬 저장 모델에서 관리하고, 멘토 대시보드와 일지가 같은 기록을 조회한다. AI는 입력 스냅샷과 근거 ID를 받는 교체 가능한 어댑터로 연결하며, 실패해도 학습과 수동 기록은 계속된다.

**Tech Stack:** 신규 구현 기본안은 HTML·CSS·JavaScript ES modules, localStorage, Node.js 기본 HTTP 서버와 `node:test`다. 현재 확인한 Node.js는 v24.15.0이다. 외부 UI 프레임워크·DB·문항 수집기를 필수 의존성으로 추가하지 않는다.

**AI:** 무료 등급 LLM API를 로컬 서버의 `/api/ai`에서 호출한다. 기본안은 Google Gemini 무료 등급이며, 다른 무료 API로 바꿔도 `server/ai-provider.mjs` 안에서만 달라진다. 키는 환경 변수 `AI_API_KEY`에서만 읽는다. 플렉스튜디오는 사용하지 않는다.

**Spec:** [배움길 PRD v1.1](../../baeumgil/PRD.md), [기획서](../../baeumgil/기획서.md)

**팀 분업:** [팀 역할·바이브 코딩 가이드](../../baeumgil/팀역할_및_바이브코딩_가이드.md). PM, 지훈님(DB·백엔드), 예서님(FE), 다은님·수영님(공동 개발)의 구성에 따라 파일 소유권과 전달 관계를 정리한다. 다은님·수영님의 학습 엔진·AI 기능 배정은 해당 문서의 제안 기본안이며, DB 담당 확정만으로 기존 로컬 저장 범위를 서버 DB로 변경하지 않는다.

## Global Constraints

- 핵심 학습 흐름: **기출 풀이 → 오답 개념 확인 → 필요한 기초 연습 → 유사 문제 → 원래 기출 재도전**. 이후 별도의 새 적용 문제와 요약을 연결한다.
- P0는 한 브라우저에서 가상 멘토 1명·멘티 1명을 전환해 시연한다. 실제 인증·다기기 동기화로 설명하지 않는다.
- 문항은 객관식이며 채점·수치 생성·학습 단계·집계는 코드와 검수된 데이터로 처리한다.
- 콘텐츠는 **대표 문항 1개의 완전한 경로가 필수**이고, 유형 **2개**(각 1문항 이상)가 목표다. 기본은 자체 제작 ‘기출 유형’ 문항이며 공식 기출 10문제는 후속이다. 우선 유형은 부호가 있는 유리수 계산과 일차방정식이다.
- 대회 일정과 PRD 4.2절의 ‘P0 후속’ 항목(다중 탭 충돌, 손상 복구, 일지 철회, 오채점 정정, 도움 보정 이력)은 본선 전에 구현하지 않는다.
- 개념 확인 최대 **2문항**, 기초 연습은 **3문항 중 2문항 정답**이면 진행 추천, 최대 **2묶음**, 유사 문제 **2문항**, 원래 기출 재도전은 경로당 **1회**, 새 적용 문제 **1문항**이다.
- 점수로 화면 접근을 막지 않는다. 추천 건너뛰기·멘토 조정·도움 사용을 기록한다.
- 새 적용 문제는 앱에 보존된 해당 학생의 **전체 노출 이력**에서 새 문항이어야 한다. ID·선택지 순서만 바꾼 같은 문제를 새 문제로 취급하지 않는다.
- 유효 문항 생성은 최대 **20회** 시도 후 예비 문항을 사용한다. 새 문항 확보 실패는 `not_measured`와 `needs_mentor`로 처리한다.
- AI 요청은 **15초**에 실패로 전환하며 자동 재시도하지 않는다. 실제 AI·사전 예시·규칙 기반 대체를 구분한다.
- 메모 저장 목표는 변경 후 **1초 이내**, 로컬 채점·다음 단계 표시 목표는 **1초 이내**다.
- 날짜·월별 집계 기준은 **Asia/Seoul**이다. 출석은 `attended`, 활동 시간은 양의 정수 분, 멘토 검토 확인이 있어야 일지를 확정한다.
- 확정 일지의 최신 유효 개정본만 합산한다. 자율 학습만으로 회기 출석·시간을 만들지 않는다.
- 실제 학생 개인정보를 시연에 쓰지 않고, 비밀 API 키를 브라우저 소스에 넣지 않는다.
- 원 기출 재도전 성공·독립 적용·장기 숙달을 구분하며 단일 오답을 개념 전체의 확정 판정으로 전파하지 않는다.
- 미검토 기출·센터 양식·실제 멘토 활동 범위를 확인된 자료처럼 표현하지 않는다.

## Review Focus

다음 다섯 위험은 해당 작업의 테스트와 최종 수동 시연에서 함께 확인한다.

1. **단계 경계에서 중복 제출·새로고침·탭 전환이 겹치는 경우**: 같은 응답·노출을 두 번 저장하거나 연습 묶음을 추가 소비하지 않아야 한다. Task 2·3·4에서 검증한다.
2. **다른 경로에서 본 문항, 미제출 노출, 손상된 이력**: 독립 적용으로 잘못 집계하지 않아야 한다. Task 2·4·5에서 검증한다.
3. **회기 날짜·확정·수정·철회가 월 경계에서 겹치는 경우**: 이전 확정본과 최신본을 중복 합산하지 않아야 한다. Task 6에서 검증한다.
4. **AI 요청 후 학생 기록 변경·새 요청·시간 초과가 발생하는 경우**: 늦은 응답과 잘못된 근거가 최신 제안을 덮어쓰지 않아야 한다. Task 7에서 검증한다.
5. **콘텐츠 오류·선수 관계 순환·문항 생성 소진**: 무한 생성이나 잘못된 출제 대신 예비 문항 또는 멘토 확인으로 종료해야 한다. Task 1·2·8에서 검증한다.

---

## 0. 대회 일정과 병렬 진행

Task 번호는 기술적 의존 순서이고, 사람별 작업은 아래처럼 **처음부터 병렬로** 진행한다. 담당 구분은 팀 역할 문서를 따른다.

| 시각 (10/24) | PM | 지훈님 (BE) | 예서님 (FE) | 다은님·수영님 (엔진·AI) |
|---|---|---|---|---|
| ~12:30 | 대표 문항·시연 순서 확정 | 공통 데이터 계약 초안, 무료 API 키 발급·1회 호출 | 임시 데이터 형식 합의 | 대표 문항·문항 틀·개념 연결 작성 |
| ~16:30 (M1) | 진행 점검, 예선 자료 초안 | 서버·`/api/ai`·저장 (Task 1·4 일부) | 멘티 학습 화면 (Task 3) | 채점·경로 엔진 (Task 2), AI 프롬프트 초안 (Task 7 계약) |
| 16:30~18:45 | 화면 캡처·AI 결과 반영해 예선 PDF 작성 후 제출 | 통합 오류 수정 | 통합 오류 수정 | 통합 오류 수정 |
| 20:00~22:00 | 예선 3분 발표 | — | — | — |
| 예선 후~본선 | 시연 시나리오·본선 PPT | 회기·일지·대장 (Task 6), 실제 AI 연결 (Task 7) | 멘토 대시보드·일지 화면 (Task 5·6) | 근거 요약 (Task 5), AI 출력 검증 (Task 7), 두 번째 유형 (Task 8) |

- 예선 기준은 M1이다. 실제 AI 1회 호출 결과를 함께 보여 줄 수 있으면 더 좋다.
- 본선 기준은 M3이다. M4는 대회 이후 목표로 둔다.
- 16:30에 M1이 안 되면 범위를 더 줄여 예선 PDF를 먼저 낸다. 마감 시간은 바꿀 수 없다.

## 1. 개발 순서와 중간 완료 지점

**먼저 한 문항의 전체 학습 경로를 화면에서 완성한다.** 문제은행 수량 확대나 전체 28개 지도보다 이 경로의 연결을 우선한다. 실제 AI 연결의 준비 여부는 Task 1에서 조기에 확인하고, 본 연결은 안정된 학습·회기 기록 위에 Task 7에서 구현한다.

| 순서 | 작업 | 우선순위 | 완료 후 보여 줄 수 있는 것 | 선행 작업 |
|---|---|---|---|---|
| 1 | 실행 기반·데이터 계약·대표 문항 | P0 기반 | 한 문항과 출처·지원 상태가 보이는 시작 화면 | 없음 |
| 2 | 채점·문항 생성·학습 규칙 | P0 핵심 | 코드로 재현되는 전체 학습 경로와 예외 분기 | 1 |
| 3 | 멘티 학습 화면 연결 | P0 핵심 | 오답부터 새 적용 확인까지 직접 조작하는 시연 | 2 |
| 4 | 저장·재개·복구 | P0 안정성 | 새로고침 후 이어 하기와 저장 실패 처리 | 3 |
| 5 | 멘토 대시보드·근거 요약 | P0 차별점 | 학생이 어디서 막혔고 어떤 도움을 받았는지 확인 | 4 |
| 6 | 회기·수동 일지·월별 대장 | P0 운영 | 실제 회기 정보로 일지를 확정하고 대장에 합산 | 5 |
| 7 | 실제 AI 수업 제안·일지 문장 | P0 AI | 같은 기록으로 근거 기반 제안·초안 생성 | 5·6, AI 실행 조건 |
| 8 | 기출 10문제·2유형과 양식 검수 | P0 콘텐츠 | 대표 경로 외 문항에서도 같은 동작 | 2·3·6; 자료 검토는 1부터 시작 |
| 9 | 통합 수용 검증·시연 고정 | P0 출시 점검 | PRD AC-01~20 결과와 발표용 완성 경로 | 7·8 |

### 중간 완료 지점

- **M1 · 학습 경로**: Task 1~3. AI 없이 한 문항의 오답→보충→재도전→새 적용 확인을 조작한다.
- **M2 · 멘토 운영**: Task 4~6. 기록을 다시 열고 근거를 확인하며 수동 일지를 확정한다.
- **M3 · 핵심 시연 (본선 목표)**: Task 7과 대표 문항의 검수 완료. 실제 AI와 일지까지 연결하고 PRD 13.1절의 ‘본선 전 필수 확인’ 항목을 통과한다.
- **M4 · MVP 완료 (대회 이후)**: Task 8~9 및 AC-01~20 전체 통과. 공식 기출 10문제·2유형과 후속 예외 처리를 포함한다.

자체 제작 문항만 있거나 실제 AI가 없으면 해당 한계를 표시한다. M1·M2를 전체 MVP 완료로 보고하지 않는다.

## 2. 작업 위치와 기술 선택

### 2.1 현재 확인한 환경

- 작업 위치: `C:/dev/gangwon`
- 배움길 문서: `docs/baeumgil/기획서.md`, `docs/baeumgil/PRD.md`
- 배움길 소스는 없으므로 `apps/baeumgil/`에 새로 구현한다.
- 현재 작업 폴더는 Git 저장소가 아니다. 5명이 동시에 작업하므로 착수 시 공용 Git 저장소를 만드는 것을 권장한다. 생성은 팀이 결정한다.

### 2.2 구현 시작 시 선택 규칙

- 새로 구현하면 `apps/baeumgil/`에 독립 앱을 만든다. 아래 경로는 이 기본안이다.
- 기존 배움길 소스를 전달받으면 Task 1에서 실행·재사용 가능성을 확인하고, 아래 파일 경로를 실제 구조에 대응시킨 뒤 계획을 갱신한다. 정상 동작하는 구조를 일괄 재작성하지 않는다.
- 데이터 계약과 FR/AC는 소스 재사용 여부와 관계없이 유지한다.
- AI는 무료 등급 API(기본안 Google Gemini)를 쓴다. 모델 이름·한도·키 발급 결과를 Task 1에서 `runtime-contract.md`에 기록한다. 공급자별 차이는 서버 어댑터 내부에 한정한다.
- 무료 등급은 분당·일일 호출 한도가 있다. 개발 중 반복 호출은 가짜 공급자로 테스트하고, 실제 호출은 확인용으로만 쓴다. 한도 초과(429)는 실패로 처리한다.
- 키 발급이 늦어져도 Task 1~6은 진행할 수 있다. 실제 AI 성공을 요구하는 AC-19와 M3 완료 판정은 미룬다.
- 이후 Git 관리 환경에서 실행할 때만 작업별 검증 뒤 커밋한다. 기존 저장소의 변경과 격리 방식은 실행 시 관련 지침을 따른다. 이 계획만으로 다른 프로젝트를 초기화·이동하지 않는다.

### 2.3 계획한 파일 구조

아래는 구현 시 만들 파일이다. 현재 만들어졌다는 의미가 아니다.

```text
apps/baeumgil/
  package.json                    # ESM, dev/test/content 검증 명령
  README.md                       # 실행·시연·AI 설정과 제한
  server.mjs                      # 정적 파일과 /api/ai 요청 처리
  server/ai-provider.mjs           # 공급자 호출을 표준 ModelProvider로 변환
  public/index.html               # 한국어 앱 진입점
  public/styles.css               # 반응형·초점·상태 표시
  public/app.js                   # 화면 전환·명령 실행·저장 연결
  public/src/domain/contracts.js  # 상태·명령·AI 결과의 JSDoc 계약과 검증
  public/src/content/catalog.js   # 검수 상태·경로·그래프 검증 및 조회
  public/src/content/questions.json
  public/src/content/concepts.json
  public/src/content/routes.json
  public/src/content/review.json  # 검수자·근거·버전·양식 매핑 상태
  public/src/content/templates.js # 기초·유사·새 적용 문항 틀
  public/src/learning/grading.js  # 객관식 채점과 수학 값 정규화
  public/src/learning/exposure.js # 전체 노출 이력·동일 문항 식별
  public/src/learning/generator.js
  public/src/learning/engine.js   # 순수 상태 전이·단계·기록 이벤트
  public/src/state/store.js       # 명령 적용과 상태 구독
  public/src/state/persistence.js # 로컬 저장·충돌·복구
  public/src/mentoring/summary.js # 근거·집계·추천용 사실 요약
  public/src/mentoring/logs.js    # 실제 회기·일지 개정·월별 조회
  public/src/ai/contracts.js      # 입력 스냅샷·출력 참조 검증
  public/src/ai/client.js         # 요청·실패·취소·이전 응답 차단
  public/src/ui/learner.js
  public/src/ui/mentor.js
  public/src/ui/sessions.js
  tests/fixtures.js
  tests/content.test.js
  tests/learning.test.js
  tests/generator.test.js
  tests/exposure.test.js
  tests/flow.test.js
  tests/persistence.test.js
  tests/summary.test.js
  tests/logs.test.js
  tests/ai.test.js
  tests/http.test.js
  scripts/check-content.mjs
  docs/runtime-contract.md        # 실행 환경·실제 AI 입출력 연결 방식
  docs/content-review.md          # 기출·문항 틀·부분 그래프 검토
  docs/acceptance-results.md      # AC별 실제 결과·미충족 항목
  docs/demo-script.md             # 초기화·시연 데이터·조작 순서
```

### 2.4 공통 명령

이후 명령의 작업 위치는 `C:/dev/gangwon/apps/baeumgil`이다.

- `npm run dev`: Node 기본 서버로 앱 실행. 기본 주소는 `http://127.0.0.1:4173`이며 환경에 맞게 변경 가능하다.
- `npm test`: `node --test tests/*.test.js` 실행.
- `npm run check:content`: `node scripts/check-content.mjs` 실행.
- 특정 작업 검증: 각 Task의 `node --test ...` 명령 실행.
- 단위 테스트에는 가짜 AI 공급자와 가짜 저장소를 사용한다. 실제 AI·브라우저·양식 검증은 별도 기록한다.

## 3. 공통 데이터·인터페이스 계약

전체 엔티티의 목적은 PRD 9절을 따른다. 아래 계약은 작업 사이에 달라지면 안 되는 이름과 입출력이다. 구현은 JavaScript와 JSDoc으로 시작하고 형식 검사는 명시적 검증 함수로 수행한다.

### 3.1 상태와 명령

- `AppState`: `{schemaVersion, revision, activeRole, learners, mentors, assignments, paths, attempts, exposures, evidence, sessions, logs, aiArtifacts, events, historyIntegrity}`.
- `historyIntegrity`: `complete | unknown`. 기록 손상이 있으면 신규 노출을 확신하지 않는다. 초기화한 시연은 초기화 후 범위임을 표시한다.
- `Question`: `{id, version, kind, contentStatus, stem, choices, answerChoiceId, conceptIds, routeId, source}`. `kind`는 `official | authored`, `choices`는 `{id,text,value}` 배열이다.
- `QuestionInstance`: `{id, templateId, templateVersion, params, questionSnapshot, fingerprint}`. 원 기출도 스냅샷과 내용 기반 식별값을 가진다.
- `LearningPath`: PRD 필드에 `activeInstance`, `stageIndex`, `foundationRound`, `resumeStage`, `skippedStageIds`, `needsReview`, `transferStatus`를 포함한다.
- `Attempt`: PRD 필드에 `submissionId`, `noveltyAtPresentation`, `instanceSnapshot`을 포함한다. 제출 후 수정 대신 정정 이력을 추가한다.
- `LearningCommand`: `{id, pathId, type, payload, at}`. 동일 `id`는 멱등 처리한다.
- 명령 `type`: `START_PATH`, `PRESENT_QUESTION`, `SUBMIT_ANSWER`, `USE_HELP`, `SET_VISIBILITY`, `ADVANCE`, `PAUSE`, `RESUME`, `REQUEST_MENTOR`, `MENTOR_OVERRIDE`, `CORRECT_ATTEMPT`.
- `SUBMIT_ANSWER.payload`: `{instanceId, choiceId, abstained}`. `choiceId=null`이고 `abstained=false`이면 제출 거부다.
- `ADVANCE.payload`: `{mode:'recommended'|'repeat'|'skip'}`. `MENTOR_OVERRIDE.payload`는 `{targetStage, conceptId, reason}`이다.
- `USE_HELP.payload`: `{kind:'hint'|'solution'|'mentor', used:true}`. 멘토의 도움 보정은 기존 값을 지우지 않고 정정 이벤트를 남긴다.

`START_PATH.payload`의 `assignmentId`, 제시·도움·응답의 `instanceId`, 오류 정정의 대상 `attemptId`는 존재하는 객체를 참조해야 한다. `SET_VISIBILITY.payload`는 `{visible:boolean}`이며 활성 시간 누적은 이벤트의 `at`으로 계산한다.

### 3.2 공유 함수와 테스트 자료

| 제공 모듈 | 함수 계약 | 사용 작업 |
|---|---|---|
| contracts | `validateState(value) -> {ok,errors}` | 1·4 |
| catalog | `validateCatalog(catalog) -> {ok,errors}`; `listAssignableQuestions(catalog) -> Question[]` | 1·3·8 |
| grading | `gradeAnswer(question, {choiceId,abstained}) -> 'correct'|'incorrect'|'abstained'`; 무응답은 예외 | 2·3 |
| exposure | `fingerprintQuestion(instance) -> string`; `classifyNovelty(state, learnerId, fingerprint) -> 'first_seen'|'already_seen'|'unknown'` | 2·5 |
| generator | `generatePractice({catalog,route,stage,learnerId,state,rng}) -> {status:'ready',instance}|{status:'unavailable',reason}` | 2·3 |
| engine | `applyLearningCommand(state, command, {catalog,rng}) -> {state,events}` | 2·3·4 |
| store | `createStore({initialState,catalog,rng,onChange}) -> {getState,dispatch,subscribe}` | 3·4·5 |
| persistence | `loadState(storage) -> {status:'ready'|'empty'|'recovery_required',state,raw,reason}`; `saveState(storage,state,expectedRevision) -> {ok,reason}` | 4 |
| summary | `buildLearnerSummary(state, learnerId) -> LearnerSummary` | 5·6·7 |
| logs | `saveSession(state,sessionInput) -> AppState`; `buildLogFacts(state,sessionId) -> LogFacts`; `confirmLog(state,input) -> AppState`; `retractLog(state,{sessionId,reason,at}) -> AppState`; `buildMonthlyLedger(state,month) -> {rows,totalMinutes}` | 6·7 |
| AI contracts | `buildAIInput(state,{learnerId,sessionId,kind}) -> AIInput`; `validateAIOutput(input,output) -> {ok,errors}` | 7 |
| AI client | `requestAI(input,{transport,signal,timeoutMs:15000}) -> Promise<AIResult>` | 7 |
| server provider | `createModelProvider(config) -> {generate(input,{signal}) -> Promise<AIOutput>}` | 7 |

테스트 자료는 Task 1의 `tests/fixtures.js`가 제공한다.

- `makeCatalog() -> Catalog`: 두 개념 확인 후보·기초 3문항 묶음 2개·유사 2문항·새 적용·예비 문항을 가진 자체 제작 검증 자료.
- `makeState(overrides={}) -> AppState`: 가명 학생 `learner-1`, 멘토 `mentor-1`, `assignment-1`, `path-1`과 빈 기록을 제공한다. 기본 단계는 `original_attempt`, 현재 문항 인스턴스 ID는 `original-1`이다. 초기 단계와 문항을 덮어쓸 수 있다.
- `makeQuestion(overrides={}) -> Question`: 정답 선택지 `a`, 기본 `approved/authored` 문항.
- `command(type,payload={},overrides={}) -> LearningCommand`: 시각과 ID를 고정하거나 덮어쓸 수 있다.
- `runCommands(state,commands,options) -> AppState`: `applyLearningCommand`를 순서대로 호출하는 테스트 보조 함수. Task 2에서 구현한다.
- `makeStorage({initialRaw,failWrites=false}={})`: `getItem/setItem/removeItem`을 가진 메모리 저장소. Task 4에서 확장한다.

검증 자료의 `approved`는 자체 제작 테스트 자료 검토 상태다. 공식 기출 10문제 수량에는 포함하지 않는다.

## 4. 작업별 구현 계획

### Task 1: 대표 문항을 제공하는 실행 기반과 콘텐츠 계약

**우선순위 / 선행:** P0 기반 / 없음. **연결 요구사항:** FR-01, FR-04·05의 콘텐츠 전제, AC-17, AC-18 준비.

**Files:** Create `apps/baeumgil/package.json`, `server.mjs`, `README.md`, `public/index.html`, `public/styles.css`, `public/app.js`, `public/src/domain/contracts.js`, `public/src/content/catalog.js`, `questions.json`, `concepts.json`, `routes.json`, `review.json`, `templates.js`(메타데이터만; 앞선 content 폴더), `tests/fixtures.js`, `tests/content.test.js`, `tests/http.test.js`, `docs/runtime-contract.md`, `docs/content-review.md`.

**Interfaces:** 공통 계약의 `AppState`, `Question`, `LearningCommand`, `validateCatalog`, `listAssignableQuestions`, 테스트 자료를 제공한다. `Catalog={questions,concepts,routes,templates,review}`이며 templates의 ID·용도·개념 연결·검수 메타데이터는 이 단계에서 선언하고 실제 생성 함수는 Task 2에서 연결한다. 이 단계 목록 조회는 경로 메타데이터의 연결 유효성을 검사하고, 실제 출제 가능 판정은 Task 2의 문항 생성 검사까지 통과해야 한다.

- [ ] **Step 1 · 소스·자료·AI 실행 조건 확인:** 기존 배움길 소스와 실제 AI 호출 방식의 확보 여부를 `docs/runtime-contract.md`에 기록한다. 실제 제공자를 쓸 수 있으면 비밀값을 노출하지 않고 텍스트 1회 호출과 구조 변환 가능 여부를 확인한다. 없으면 미연결로 기록하고 다음 단계는 자체 제작 자료로 진행한다. 기출·양식 검토 요청은 이때 시작한다.
- [ ] **Step 2 · 콘텐츠 실패 테스트 작성:** 다음 주장과 `unknownConceptRejected`, `cyclicGraphRejected`, `brokenRouteRejected`를 추가한다. 순환·없는 참조는 해당 문항을 출제 목록에서 제외하고 오류를 반환해야 한다.

```js
const catalog = makeCatalog();
catalog.questions.push(makeQuestion({id:'pending-1', contentStatus:'pending'}));
assert.equal(validateCatalog(catalog).ok, true);
assert.equal(listAssignableQuestions(catalog).some(q => q.id === 'pending-1'), false);
```

- [ ] **Step 3 · 실패 확인:** `node --test tests/content.test.js`를 실행한다. 모듈·기능 미구현으로 실패하는지 확인한다.
- [ ] **Step 4 · 최소 구현:** ESM 실행 명령, 콘텐츠 계약·검수 상태·부분 그래프 검증을 구현한다. 원 기출 메타데이터를 꾸미지 않은 자체 제작 대표 문항으로 시작한다. 정적 서버는 `public/`만 제공하고 서버 설정·키 파일은 제공하지 않는다. 시작 화면에서 문항 종류·출처·시연 여부를 표시한다.
- [ ] **Step 5 · 검증:** `node --test tests/content.test.js tests/http.test.js`를 실행한다. 정적 파일 제공, `public/` 밖 경로 접근 거부, `pending/link_only/retired` 출제 제외를 확인한다. `npm run dev`로 대표 문항 목록을 연다.
- [ ] **Step 6 · 기록·저장:** 실행·자료 확보 상태를 문서에 남긴다. Git 관리 중이면 검증한 Task 1 파일만 커밋한다.

**완료 기준:** 실행 가능한 시작 화면과 검증 가능한 대표 콘텐츠가 있다. 실제 기출·AI·양식 확보 여부가 분리되어 있다.

### Task 2: 채점·문항 생성·학습 경로를 순수 규칙으로 완성

**우선순위 / 선행:** P0 핵심 / Task 1. **연결 요구사항:** FR-02~05, AC-01~08, AC-11.

**Files:** Create `public/src/learning/grading.js`, `exposure.js`, `generator.js`, `engine.js`(앞선 learning 폴더), `tests/learning.test.js`, `tests/generator.test.js`, `tests/exposure.test.js`; Modify `public/src/content/templates.js`(생성 함수 연결), `tests/fixtures.js`, `public/src/domain/contracts.js`, `routes.json`.

**Interfaces:** 공통 계약의 `gradeAnswer`, `fingerprintQuestion`, `classifyNovelty`, `generatePractice`, `applyLearningCommand`, `runCommands`를 제공한다. `PRESENT_QUESTION`은 신규 여부를 먼저 계산한 뒤 노출 기록을 추가한다. 상태 전이에는 AI가 참여하지 않는다.

- [ ] **Step 1 · 규칙 실패 테스트 작성:** 아래 기본 채점과 표의 시나리오를 작성한다. 각 행을 이름 있는 테스트로 만들고 정확한 기대값을 단언한다.

```js
const q = makeQuestion();
assert.equal(gradeAnswer(q, {choiceId:'a',abstained:false}), 'correct');
assert.equal(gradeAnswer(q, {choiceId:'b',abstained:false}), 'incorrect');
assert.equal(gradeAnswer(q, {choiceId:null,abstained:true}), 'abstained');
assert.throws(() => gradeAnswer(q, {choiceId:null,abstained:false}));
```

| 테스트 | 기대값 |
|---|---|
| `wrongOriginalRunsRemedialStages` | 최초 오답→확인 최대 2→기초 3→유사 2→원 기출 1회→새 적용 1→완료; 최초 응답 유지 |
| `correctOriginalSkipsRemediation` | 최초 정답 다음 단계가 `transfer_check` |
| `foundationStopsAfterTwoRounds` | 2/3 미달 시 한 묶음만 추가; 총 두 묶음 뒤 `needs_mentor` 제안, 세 번째 자동 묶음 없음 |
| `skipAndMentorOverrideAreRecorded` | 단계 이동 가능, `skippedStageIds`·`needsReview`와 멘토 이유 보존 |
| `duplicateSubmissionIsIdempotent` | 같은 command/submission ID 재적용 후 응답 수·단계·노출 수 불변 |
| `newExposureBeforeSubmissionIsPreserved` | 표시만 하고 중단한 문제도 다음 경로에서 `already_seen` |
| `sameQuestionAcrossIdsIsNotNew` | ID·선택지 순서만 바꾼 같은 내용의 식별값 동일 |
| `unknownHistoryIsNotFirstSeen` | 손상 이력에서 `unknown`; 독립 적용 자격 없음 |
| `generatorUsesAtMostTwentyAttempts` | 생성 실패 20회 후 예비 문항; 예비도 노출되었으면 `not_measured/needs_mentor` |
| `equivalentFractionChoicesAreRejected` | `1/2`와 `2/4` 선택지를 같은 값으로 판단하여 중복 정답 문항 거부 |
| `practiceDoesNotCreateSession` | 학습 완료 후 `sessions`·확정 `logs` 개수 0 |

- [ ] **Step 2 · 실패 확인:** `node --test tests/learning.test.js tests/generator.test.js tests/exposure.test.js`로 미구현 실패를 확인한다.
- [ ] **Step 3 · 최소 구현:** 타입별 정답과 문항 조건을 코드로 검증한다. Task 1의 검토된 경로 순서와 PRD의 문항 수·분기를 구현한다. 확인 오답은 우선 연습 후보로만 사용한다. 일반 문항의 값은 약분한 유리수·정수로 정규화한다. fingerprint는 Unicode·공백을 정규화한 문항 본문·조건과 정규화 선택지 값의 정렬된 집합으로 만든다. 문항 ID·문항 틀 ID·선택지 ID·선택지 순서·해설은 식별값에서 제외해 같은 내용의 문항이 ID 변경만으로 새 문항이 되지 않게 한다.
- [ ] **Step 4 · 도움·시간·정정 연결:** 도움 사용, 활성 시간, 일시 중단·재개, 원 응답 스냅샷을 저장한다. 도움 보정 이력과 `CORRECT_ATTEMPT`는 PRD 4.2절의 후속 항목이므로 본선 이후 구현한다. 구현 시 `CORRECT_ATTEMPT`는 정정 전 값을 남기고 관련 근거·일지에 재검토 표시를 남긴다. 서로 모순된 응답은 `needs_review`로 남긴다.
- [ ] **Step 5 · 검증:** 위 3개 테스트와 `tests/content.test.js`를 실행해 모두 통과시킨다. 생성 난수는 테스트에서 고정해 실패를 재현한다.
- [ ] **Step 6 · 기록·저장:** 상태 전이·문항 생성 규칙 버전을 기록하고, Git 관리 중이면 Task 2 범위만 커밋한다.

**완료 기준:** 화면 없이도 정상 경로와 핵심 예외를 명령 순서로 재현할 수 있다. 독립 적용의 새 문항 판정이 전체 노출 이력을 사용한다.

### Task 3: 멘티 화면에서 한 문항의 전체 흐름 조작

**우선순위 / 선행:** P0 핵심 / Task 2. **연결 요구사항:** S01·03·04·05, FR-01~05, AC-01~08, AC-20 일부.

**Files:** Create `public/src/state/store.js`, `public/src/ui/learner.js`, `tests/flow.test.js`; Modify `public/app.js`, `public/index.html`, `public/styles.css`.

**Interfaces:** `createStore({initialState,catalog,rng,onChange})`는 engine만 통해 학습 상태를 바꾼다. UI는 `renderLearner({root,state,catalog,dispatch}) -> void`로 렌더링한다. 제시·답 제출·도움·다음 단계는 공통 명령을 발행한다. 렌더링만 다시 해도 노출·시간·연습 묶음이 증가해서는 안 된다.

- [ ] **Step 1 · 흐름 실패 테스트 작성:** `createStore`를 통해 정상 명령을 발행하고 다음을 검사한다. 추가로 `rerenderDoesNotPresentTwice`, `hiddenTabStopsActiveTime`, `resumeRestoresActiveInstance`를 작성한다.

```js
const store = createStore({initialState:makeState(),catalog:makeCatalog(),rng:() => 0.25});
store.dispatch(command('PRESENT_QUESTION', {instanceId:'original-1'}));
const before = store.getState().exposures.length;
store.dispatch(command('PRESENT_QUESTION', {instanceId:'original-1'}));
assert.equal(store.getState().exposures.length, before);
```

- [ ] **Step 2 · 실패 확인:** `node --test tests/flow.test.js`를 실행한다.
- [ ] **Step 3 · 최소 화면 구현:** 역할 선택→지정 문항→답 제출→개념 확인→기초→유사→원 기출→새 적용→요약을 연결한다. 현재 단계·남은 문항·모름·도움·중단을 표시한다. 정답일 때는 보충 단계를 강제하지 않는다. 멘티 화면에서 멘토 메모·미확정 일지를 제외한다.
- [ ] **Step 4 · 이벤트 경계 연결:** `visibilitychange`와 명시적 중단으로 활성 시간을 관리한다. 중복 버튼 처리, 제출 잠금, 다음 단계 이동은 store 결과를 기준으로 한다. 시연용 역할 전환임을 안내한다.
- [ ] **Step 5 · 검증:** `node --test tests/flow.test.js tests/learning.test.js` 후 브라우저에서 최초 정답·오답·모름·반복 미달·단계 건너뛰기를 직접 조작한다. 모바일 폭과 키보드 초점 이동을 확인한다.
- [ ] **Step 6 · 기록·저장:** M1 시연 범위와 아직 없는 저장·AI·공식 콘텐츠를 README에 표시하고, Git 관리 중이면 Task 3 범위를 커밋한다.

**완료 기준:** 한 문항을 기준으로 사용자가 핵심 흐름을 끝까지 조작할 수 있다. 저장 안정성·AI·기출 수량은 다음 작업의 완료 조건이다.

### Task 4: 새로고침 후 재개와 저장 실패·다중 탭 보호

**우선순위 / 선행:** P0 안정성 / Task 3. **연결 요구사항:** FR-09, AC-15·16, Review Focus 1·2.

**Files:** Create `public/src/state/persistence.js`, `tests/persistence.test.js`; Modify `public/src/state/store.js`, `public/app.js`, `tests/fixtures.js`, `public/src/domain/contracts.js`.

**Interfaces:** 공통 계약의 `loadState`, `saveState`를 제공한다. 저장 키는 `baeumgil:mvp:v1`, 스키마 버전은 1이다. `expectedRevision` 불일치는 `conflict`로 거부한다. 손상 원문은 별도 보관·다운로드 가능하게 반환하고 임의로 초기화하지 않는다.

- [ ] **Step 1 · 저장 실패 테스트 작성:** 다음과 함께 `writeQuotaFailurePreservesMemory`, `resetRequiresExplicitConfirmation`, `reloadPreservesPreSubmitExposure`를 작성한다. `unknownSchemaRequiresRecovery`, `otherTabRevisionStopsWrites`와 Step 4의 다른 탭 감지·손상 복구는 본선 이후 후속이다.

```js
const storage = makeStorage();
const state = makeState({revision:1});
assert.equal(saveState(storage, state, 0).ok, true);
assert.equal(loadState(storage).state.revision, 1);
assert.equal(saveState(storage, {...state,revision:2}, 0).reason, 'conflict');
```

- [ ] **Step 2 · 실패 확인:** `node --test tests/persistence.test.js`를 실행한다.
- [ ] **Step 3 · 최소 구현:** 제출·노출·단계 전환·일지 확정 시 저장한다. 메모는 1초 이내 디바운스 저장하고 저장 중·성공·실패를 표시한다. 원자적 JSON 스냅샷으로 저장하며 실패하면 현재 메모리 상태를 유지한다. 일지 확정의 저장 실패는 화면에서 ‘저장되지 않음’으로 보여 준다.
- [ ] **Step 4 · 복구·동시 탭 구현:** 새로고침은 경로·현재 문항·시도·시간·노출·메모를 복원한다. `storage` 이벤트와 쓰기 전 revision 검사로 다른 탭 변경을 감지하고 읽기 전환을 권한다. 알 수 없는 스키마·손상은 원문 복구 선택을 제공한다. 저장 상태가 불명확하면 새 적용 신규성은 `unknown`이다. 초기화는 명시적 확인 전 실행하지 않는다.
- [ ] **Step 5 · 검증:** `node --test tests/persistence.test.js tests/flow.test.js tests/exposure.test.js` 후 실제 두 탭·중간 새로고침·저장 실패를 시연해 복구와 안내를 확인한다.
- [ ] **Step 6 · 기록·저장:** 로컬 저장 범위와 초기화 후 이력 범위를 README에 기록하고, Git 관리 중이면 Task 4 범위를 커밋한다.

**완료 기준:** 핵심 학습 흐름을 중단했다 다시 열 수 있다. 미제출 노출이나 기존 일지가 조용히 사라지지 않는다.

### Task 5: 멘토 대시보드와 근거 기반 사실 요약

**우선순위 / 선행:** P0 차별점 / Task 4. **연결 요구사항:** S02·05·06, FR-05, AC-07·08·11.

**Files:** Create `public/src/mentoring/summary.js`, `public/src/ui/mentor.js`, `tests/summary.test.js`; Modify `public/app.js`, `public/styles.css`.

**Interfaces:** `buildLearnerSummary(state,learnerId)`는 `{timeline,evidence,originalStats,retryStats,transferStats,unmeasuredCount,reviewFlags}`를 반환한다. 모든 통계는 상태의 응답·노출에서 계산하고 원 문항·응답 ID를 근거로 유지한다. `renderMentor({root,state,catalog,dispatch}) -> void`는 지정·근거 열기·멘토 조정·도움 정정을 제공한다.

- [ ] **Step 1 · 집계 실패 테스트 작성:** `makeState`에 서로 다른 단계·도움·노출 이력의 응답을 넣어 다음을 단언한다. `abstainedIsSeparate`, `inferredIsNotObserved`, `conflictingEvidenceNeedsReview`, `correctionFlagsLinkedLogs`도 추가한다.

```js
const summary = buildLearnerSummary(stateWithSeenTransfer, 'learner-1');
assert.equal(summary.transferStats.eligibleCount, 0);
assert.equal(summary.retryStats.correctCount, 1);
assert.equal(summary.reviewFlags.includes('transfer_previously_seen'), true);
```

`stateWithSeenTransfer`는 `tests/fixtures.js`에 명시적으로 추가한다. 원 기출 재도전 정답 1개, 이전 경로에서 노출된 새 적용 후보 정답 1개를 가진 상태다.

- [ ] **Step 2 · 실패 확인:** `node --test tests/summary.test.js`를 실행한다.
- [ ] **Step 3 · 최소 구현:** 단계별 시도 타임라인과 직접 확인·추정·재검토 필요를 보여 준다. 새 적용은 `first_seen` 중 도움·힌트·해설이 없는 독립 수행을 구분하고 `already_seen/unknown/not_measured`를 성과 분모에서 제외한다. 최초 정답률·재도전·새 적용을 분리한다.
- [ ] **Step 4 · 화면 연결:** 문항 지정, 원 응답 열기, 멘토의 단계 조정과 이유 기록, 도움 사용 보정을 연결한다. ‘찍음·의지 부족·숙달 확정’ 대신 사실과 확인 질문을 표시한다. AI 영역은 아직 미연결 상태로 표시한다.
- [ ] **Step 5 · 검증:** `node --test tests/summary.test.js tests/learning.test.js tests/exposure.test.js` 후 학생의 새 경로·중단·도움·재도전 결과가 대시보드에 일치하는지 확인한다.
- [ ] **Step 6 · 기록·저장:** 근거 타임라인의 예시 화면과 집계 정의를 기록하고, Git 관리 중이면 Task 5 범위를 커밋한다.

**완료 기준:** 멘토가 어떤 근거로 다음 수업을 결정할지 파악할 수 있다. AI 없이도 사실 요약이 유용하게 보인다.

### Task 6: 실제 회기와 수동 일지·월별 대장 완성

**우선순위 / 선행:** P0 운영 / Task 5. **연결 요구사항:** S07·08, FR-07·08, AC-11~14·20 일부.

**Files:** Create `public/src/mentoring/logs.js`, `public/src/ui/sessions.js`, `tests/logs.test.js`; Modify `public/app.js`, `public/src/domain/contracts.js`, `public/styles.css`, `public/src/state/persistence.js`.

**Interfaces:** `sessionInput`는 `{id,learnerId,mentorId,localDate,attendance,actualMinutes,pathIds,note}`다. `confirmLog` 입력은 `{sessionId,content,reviewed,at}`이며 새 개정본을 만든다. `buildLogFacts`는 코드 집계와 근거 ID를 반환한다. `buildMonthlyLedger(state,'YYYY-MM')`는 최신 유효 확정본만 반환한다. 월은 `localDate`로 계산하고 timestamp를 임의 UTC 월로 바꾸지 않는다.

- [ ] **Step 1 · 일지 실패 테스트 작성:** 다음과 함께 `practiceAloneCannotConfirmLog`, `absentAndZeroMinutesCannotConfirm`, `draftIsExcluded`, `retractionRemovesLatestRevision`(철회 기능과 함께 후속), `koreaMonthBoundaryUsesSessionDate`, `repeatConfirmationDoesNotDuplicateRows`를 작성한다.

```js
let state = saveSession(makeState(), {id:'session-1',learnerId:'learner-1',mentorId:'mentor-1',
  localDate:'2026-11-01',attendance:'attended',actualMinutes:30,pathIds:['path-1'],note:'부호 계산 풀이를 함께 확인함'});
state = confirmLog(state, {sessionId:'session-1',content:'수학 학습 기록',reviewed:true,at:'2026-10-31T15:30:00Z'});
assert.equal(buildMonthlyLedger(state, '2026-10').rows.length, 0);
assert.equal(buildMonthlyLedger(state, '2026-11').totalMinutes, 30);
```

- [ ] **Step 2 · 실패 확인:** `node --test tests/logs.test.js`를 실행한다.
- [ ] **Step 3 · 최소 구현:** 학습 경로와 실제 회기를 분리하고 출석·활동 분·관찰 메모 입력을 받는다. 코드로 만든 사실 요약을 편집 가능한 수동 초안에 제공한다. `attended`·양의 정수 분·검토 확인이 있어야 확정한다. 수정은 새 개정본, 철회는 이유가 있는 이벤트로 남긴다.
- [ ] **Step 4 · 양식·대장·복사 연결:** 실제 양식이 없으면 검수 전 표시를 유지한다. 최신 유효 확정본만 날짜별로 대장에 넣고 시간·회기 수를 계산한다. 클립보드 실패 시 선택 가능한 텍스트를 제공한다. 확정·개정·철회는 Task 4의 저장 상태를 따른다.
- [ ] **Step 5 · 검증:** `node --test tests/logs.test.js tests/persistence.test.js tests/summary.test.js` 후 초안→확정→수정→철회→재확정과 월 경계 시연을 확인한다. 자동 정서·태도 문장이 없는지 읽어 본다.
- [ ] **Step 6 · 기록·저장:** M2 시연을 기록하고, Git 관리 중이면 Task 6 범위를 커밋한다.

**완료 기준:** AI가 없어도 실제 회기 정보로 일지를 작성·확정하고 중복 없는 대장을 볼 수 있다.

### Task 7: 실제 AI 수업 제안과 일지 서술 연결

**우선순위 / 선행:** P0 AI / Task 5·6, Task 1의 실제 AI 실행 계약. **연결 요구사항:** FR-06·07, PRD 10절, AC-09·10·19.

**Files:** Create `public/src/ai/contracts.js`, `public/src/ai/client.js`, `server/ai-provider.mjs`, `tests/ai.test.js`; Modify `server.mjs`, `tests/http.test.js`, `public/src/ui/mentor.js`, `public/src/ui/sessions.js`, `public/src/domain/contracts.js`, `docs/runtime-contract.md`.

**Interfaces:** `AIInput={requestId,inputRevision,kind,learnerAlias,facts,allowedConceptIds,allowedQuestionIds,allowedEvidenceIds,note,versions}`. `kind`는 `lesson_plan | log_narrative`다. 수업 출력은 `{kind,recommendations:[{conceptId,evidenceIds,explanationMethod,questionIds,uncertainty,checkQuestions}]}`이며 일지 출력은 `{kind,sentences:[{text,evidenceIds}]}`다. `AIResult={status:'ok',output,inputRevision,requestId}|{status:'failed'|'canceled',reason,requestId}`다.

브라우저 `transport(input,{signal}) -> Promise<AIOutput>`는 로컬 서버의 `POST /api/ai`와 통신한다. 서버는 `ModelProvider.generate`만 호출한다. Task 1에서 확인한 공급자의 요청·응답 변환을 `server/ai-provider.mjs`에 구현하고 키는 서버 환경 설정에서만 읽는다. 실행 환경이 승인된 자체 bridge를 제공하면 같은 transport 계약으로 대체하고 runtime 문서에 기록한다.

- [ ] **Step 1 · AI 실패 테스트 작성:** 다음 구조 검사와 `timeoutAfter15000ms`, `staleResponseCannotReplaceNewer`, `dataRevisionMarksPlanStale`, `noteInstructionsCannotChangeContract`, `aiFailureKeepsManualLog`, `abortedRequestDoesNotPublish`를 가짜 공급자·가짜 시계로 검증한다.

```js
const input = {allowedConceptIds:['sign'],allowedQuestionIds:['q1'],allowedEvidenceIds:['e1'],kind:'lesson_plan'};
const output = {kind:'lesson_plan',recommendations:[{conceptId:'sign',evidenceIds:['missing'],
  explanationMethod:'수직선으로 설명',questionIds:['q1'],uncertainty:'추가 확인 필요',checkQuestions:['풀이를 설명해 볼까요?']}]};
assert.equal(validateAIOutput(input, output).ok, false);
```

- [ ] **Step 2 · 실패 확인:** `node --test tests/ai.test.js tests/http.test.js`를 실행한다.
- [ ] **Step 3 · 최소 연결:** summary·log facts에서 입력 스냅샷을 만들고 서버 어댑터를 연결한다. 참조 ID·필수 구조를 검사한다. 미검토 문항·임의 개념을 AI가 추가해 과제 배정하지 못하게 한다. 일지는 관찰 메모가 없을 때 정서·태도 내용을 요청하지 않는다. 메모·문항은 인용 자료로 구분하고 지침으로 실행하지 않는다.
- [ ] **Step 4 · 요청 상태 연결:** 로딩·취소·15초 시간 초과·수동 재시도·오류를 표시한다. 마지막 활성 requestId·inputRevision이 맞을 때만 응답을 게시한다. 사실 요약과 수동 작성은 그대로 사용할 수 있게 한다. 제안의 채택·수정·미채택과 이유, 모델·프롬프트 버전을 저장한다.
- [ ] **Step 5 · 단위·HTTP 검증:** `node --test tests/ai.test.js tests/http.test.js tests/logs.test.js`를 실행한다. 서버의 입력 검증, 키 비노출, 실패 HTTP 응답과 브라우저의 수동 대체를 확인한다.
- [ ] **Step 6 · 실제 AI 검증:** 가명 학생의 방금 생성한 학습 기록으로 수업 제안 1회·일지 문장 1회를 실제 요청하고 근거와 문장을 읽어 본다. 요청 성공 여부·공급자·입력 버전·수정 내용을 기록하되 키·인증 헤더를 저장하지 않는다. 사전 작성 예시는 성공 증거로 사용하지 않는다.
- [ ] **Step 7 · 기록·저장:** 실제 AI가 미연결이면 AC-19를 미통과로 남긴다. 연결 검증 후 Git 관리 중이면 Task 7 범위를 커밋한다.

**완료 기준:** 동일 학습 기록으로 실제 AI 제안과 일지 문장이 생성되고, 실패·오래된 응답·잘못된 참조가 안전하게 처리된다.

### Task 8: 기출 10문제·2유형과 기관 양식 검수

> **해커톤 범위:** 본선 전에는 두 번째 유형의 경로 1개 추가(자체 제작 문항)까지만 진행한다. 아래의 공식 기출 10문제 검사·수록과 양식 매핑은 이용 조건 확인과 양식 파일 확보 뒤 후속으로 진행한다.

**우선순위 / 선행:** P0 콘텐츠 / Task 2·3·6. 자료 검토는 Task 1부터 진행한다. **연결 요구사항:** FR-01·04·07, AC-06·17·18·20 일부.

**Files:** Modify `public/src/content/questions.json`, `concepts.json`, `routes.json`, `review.json`, `templates.js`, `docs/content-review.md`, `tests/content.test.js`, `tests/generator.test.js`; Create `scripts/check-content.mjs`.

**Interfaces:** `validateCatalog`와 `generatePractice` 계약을 유지한다. 검토 기록은 문항 ID·원문 URL·정답 출처·이용 범위 확인·개념 검토·검토자·날짜·버전을 포함한다. 센터 양식은 실제 필드→`session/log facts` 대응과 미지원 필드를 기록한다.

- [ ] **Step 1 · 콘텐츠 완료 실패 테스트 작성:** 승인된 `official` 기출만 세어 최소 10문제·2유형을 확인한다. 각 문항의 개념 확인·기초·유사·새 적용·예비 문항 연결을 검사한다. 미검토 fixture 10개를 공식 기출로 세지 않아야 한다.

```js
const ready = listAssignableQuestions(catalog).filter(q => q.kind === 'official');
assert.ok(ready.length >= 10);
assert.ok(new Set(ready.map(q => q.source.typeId)).size >= 2);
assert.equal(validateCatalog(catalog).ok, true);
```

`source.typeId`는 두 검토 유형의 분류 ID다. 공식 원문 출처와 구분해 제품 내부 분류로 기록한다.

- [ ] **Step 2 · 실패 확인:** `node --test tests/content.test.js`에서 최소 수량·유형·누락 연결 검사가 실패함을 확인한다. 이 콘텐츠 준비 실패는 기존 엔진 오류와 구분한다.
- [ ] **Step 3 · 실제 콘텐츠 확대:** 검토된 기출·공식 정답을 수록하고 개념·부분 그래프를 연결한다. 수록 조건이 미확인된 자료는 `pending/link_only`로 유지한다. 유형별 매개변수 경계·동치 선택지·음수·분수·예비 문항 소진을 검증한다.
- [ ] **Step 4 · 양식 매핑 검수:** 제공받은 실제 양식과 화면 필드를 비교한다. 필수 입력·자동 사실·멘토 관찰·AI 문장을 구분하고 지원 범위를 기록한다. 자료를 받지 못하면 양식 지원 완료로 표시하지 않는다.
- [ ] **Step 5 · 검증:** `npm run check:content`와 `node --test tests/content.test.js tests/generator.test.js tests/learning.test.js tests/logs.test.js`를 실행한다. 10문항을 각각 시작해 유효한 보충 경로가 나오는지 확인한다.
- [ ] **Step 6 · 기록·저장:** 콘텐츠 검수와 실제 양식 검토 결과를 남긴다. 미달이면 정확한 수량·유형·차단 이유를 기록하고, Git 관리 중이면 Task 8 범위를 커밋한다.

**완료 기준:** 최소 10개 기출·2유형과 각 보충 경로의 검토가 끝나고 실제 센터 양식 매핑 여부가 명확하다.

### Task 9: 통합 수용 검증과 시연 고정

**우선순위 / 선행:** P0 출시 점검 / Task 7·8. **연결 요구사항:** AC-01~20, PRD 11~14절.

**Files:** Create `docs/acceptance-results.md`, `docs/demo-script.md`; Modify `README.md`, 관련 실패가 있는 테스트·UI 파일만 수정한다.

**Interfaces:** 새 도메인 계약을 만들지 않는다. 앞선 작업의 상태·엔진·집계·AI·저장 인터페이스를 그대로 검증한다.

- [ ] **Step 1 · 통합 시나리오 고정:** 시연용 가명 학생·회기·기출·초기화 절차와 최초 오답→보충→재도전→새 적용→멘토 제안→일지 확정→월별 대장 순서를 `docs/demo-script.md`에 기록한다. 생략 단계와 사전 데이터는 표시한다.
- [ ] **Step 2 · 전체 자동 검증:** `npm test`와 `npm run check:content`를 실행해 실제 출력·통과/실패 수를 기록한다. 실패가 있으면 해당 동작을 먼저 재현하고 최소 범위로 수정한 뒤 영향받는 검증을 다시 실행한다.
- [ ] **Step 3 · 브라우저 수용 검증:** 5절의 AC 대응표에 따라 최초 정답·모름·반복 미달·건너뛰기·도움 사용·전체 노출·저장 실패·다른 탭·AI 실패·일지 개정·한국 월 경계를 직접 확인한다. 각 항목에 날짜·환경·결과·증거·미통과 이유를 기록한다.
- [ ] **Step 4 · 성능·접근성 확인:** 기준 콘텐츠에서 로컬 채점·다음 단계 목표 1초, 메모 저장 목표 1초, AI 실패 전환 15초를 확인한다. 모바일 주요 흐름·키보드·색상 외 상태 표시·클립보드 실패 대체를 점검한다.
- [ ] **Step 5 · 실제 AI·양식·콘텐츠 증거 확인:** AC-18·19·20에 테스트 fixture나 미검토 자료가 실제 자료의 증거로 들어가지 않았는지 확인한다. 통신을 끊어도 이미 로드된 앱에서 학습과 수동 일지 작성이 가능한지 확인한다.
- [ ] **Step 6 · 발표 범위 고정:** M1~M4 중 어디까지 완료했는지 README와 결과표에 표시한다. 미통과가 있으면 전체 MVP 완료라고 발표하지 않는다. 실제 현장 경험으로 확인된 업무와 기대 효과를 구분한다.
- [ ] **Step 7 · 저장:** 최종 검증 후 Git 관리 중이면 검증한 결과와 변경만 커밋한다. 외부 배포·기관 제출은 별도 실행 범위로 둔다.

**완료 기준:** AC-01~20의 실제 결과가 있고, 한 문항의 시연을 처음부터 끝까지 재현할 수 있다. 문서 작성 완료와 제품 완료를 구분한다.

## 5. 요구사항·수용 기준 대응표

| PRD 기준 | 주 담당 작업 | 증거 |
|---|---|---|
| FR-01, AC-17·18 | 1·3·8 | 승인 목록·출처·콘텐츠 검수·실제 수량 |
| FR-02·03, AC-01~05 | 2·3 | 규칙·흐름 테스트와 브라우저 조작 |
| FR-04, AC-06 | 2·8 | 생성 상한·예비 문항·동치 선택지·전체 노출 검사 |
| FR-05, AC-07·08 | 2·5 | 도움·신규성·단계별 집계·근거 표시 |
| FR-06, AC-09·10 | 7 | 입력 스냅샷·참조 검사·지연 응답·실패 대체 |
| FR-07, AC-11·12 | 2·6·7 | 회기 분리·실제 출석/시간·수동 검토·AI 문장 |
| FR-07·08, AC-13·14 | 6 | 개정·철회·최신본·한국 날짜 집계 |
| FR-09, AC-15·16 | 4 | 새로고침·손상·저장 실패·충돌·초기화 |
| AC-19 | 1·7·9 | 실제 AI 수업안·일지 생성 기록 |
| AC-20 | 3·6·8·9 | 모바일·키보드·실물 양식 매핑 |
| PRD 9절 데이터·정정 이력 | 1·2·4·5·6 | 스냅샷·버전·정정 전후·재검토 표시 |
| PRD 10절 AI 입력 자료 취급·키 보호 | 1·7 | 공급자 경계·서버 공개 범위·입력 검사 |
| PRD 11절 성능·접근성·복구 | 3·4·7·9 | 측정·수동 점검 결과 |
| PRD 12절 제품 이벤트·현장 검증 | 2~7·9 | 로컬 이벤트·비교 과제와 기록 양식 |
| FR-10·P1·P2 | 이번 실행 제외 | P0 수용 검증 후 별도 계획 |

이벤트는 각 작업의 실제 상태 변경 지점에서 기록한다. 이벤트 수를 만들기 위해 사용자 동작을 중복 실행하지 않는다. 현장 시간 절감·학습 효과 비교는 시연과 별도의 사용 검증이다.

## 6. 시간이 부족할 때의 우선순위

### 끝까지 지킬 기준

- 한 문항의 핵심 경로가 끊기지 않는 것
- 정답·문항 조건·원 응답·도움·노출 이력의 일관성
- AI 실패 때 사실 요약·수동 일지로 진행하는 것
- 멘토 검토 전 일지를 확정하지 않는 것
- 시연·실제 AI·공식 기출·양식 검수 상태를 정확히 표시하는 것

### 먼저 줄일 범위

1. 초기 28개 지도·10문항 진단·꿈 해석 등 P1 기능
2. 일정·화상 링크·서버 동기화·문서 파일 출력 등 P2 기능
3. 문제은행의 부가 검색·꾸밈과 다수 학생 화면
4. 두 유형을 넘는 추가 유형·10문제를 넘는 추가 기출

시간 부족으로 실제 AI·기출 10문제·2유형·양식 검수·AC 검증을 끝내지 못하면, 범위를 줄인 시연 결과와 남은 P0를 명시한다. 필수 완료 기준을 충족한 것으로 바꾸지 않는다.

## 7. 착수·완료 기록

- [ ] 기존 소스 재사용 또는 신규 `apps/baeumgil` 경로를 기록했다.
- [ ] 실제 AI 호출 환경과 자료 확보 상태를 Task 1에서 확인했다.
- [ ] Task 1~3으로 M1 학습 흐름을 완성했다.
- [ ] Task 4~6으로 M2 멘토 운영을 완성했다.
- [ ] Task 7의 실제 AI와 검수 기출로 M3 핵심 시연을 확인했다.
- [ ] Task 8~9와 AC-01~20으로 M4 해커톤 MVP 완료 여부를 판정했다.

현재 체크박스는 개발 실행 기록이며 모두 미완료다. 이번 문서 작성만으로 앱 코드·데이터·테스트·AI 연결을 구현한 것은 아니다. 구현 실행 방식과 실제 착수 시점은 다음 실행 요청에서 정한다.

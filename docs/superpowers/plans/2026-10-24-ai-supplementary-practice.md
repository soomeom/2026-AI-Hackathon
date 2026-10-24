# AI 보충 문제 생성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 사용자 요청은 계획까지이며 구현은 후속 지시 이후 진행한다.

**Goal:** 일차식 계산·동류항 정리의 로드맵 추가 연습을 AI가 제안하고, 코드 검증 후 출제하거나 기존 문제로 대체한다.

**Architecture:** 기존 진단과 기출 학습 엔진을 보존하고 별도 AI 연습 기록을 추가한다. 서버 Gemini 전송을 재사용하되 새로운 생성 계약을 분리하고, 서버·브라우저가 같은 순수 수학 검증기를 사용한다.

**Tech Stack:** 기존 Node.js >=24, ES modules, node:http, Gemini API, node:test, localStorage, KaTeX. 새 외부 수학 라이브러리는 사용하지 않는다.

**Spec:** `docs/superpowers/specs/2026-10-24-ai-supplementary-practice-design.md`

## Global Constraints

- 대상 개념: `roadmap-linear-sum`, `roadmap-like-terms` 두 개뿐이다.
- 첫 수준 확인·정식 기출 경로·별도 diagnostic.html은 기존 방식 유지.
- 생성은 한 요청 한 문항, 모델 호출 한 번, 자동 재시도 없음. 서버 전체 5초, 클라이언트 6초.
- 정답·발문·해설은 검증된 AST에서 코드로 확정. eval/Function 사용 금지.
- 수학 범위: AST 깊이≤4, 노드≤32, 정수 -12~12, scale -9~9, 최종 계수·상수 절댓값≤50, 최종 a≠0.
- 생성 기록은 별도 선택적 generatedPractice 배열. 기존 저장 키·schemaVersion 1과 원래 진단 기록 유지.
- 실행 중 미커밋 LAN 설정/HTTP ID 수정과 다른 세션의 작업을 보존한다. 겹치는 활동이 있으면 편집 전에 대기한다.
- 커밋·원격 푸시는 사용자의 별도 요청이 있을 때 한다.

## Review Focus

- `x+7`/`7+x`처럼 문자열이 달라도 같은 선택지인 경우 거부 — Task 1.
- 사용자가 기존 문제를 풀기 시작한 뒤 늦게 온 AI 응답이 화면·기록을 바꾸지 않음 — Task 4.
- 과거 저장본, 잘못된 AI 레코드 하나, 다른 탭 revision 충돌이 정상 기록을 지우지 않음 — Task 3.
- HTTP LAN 접속에서 secure-context API 없이 생성·채점·복원 가능 — Task 5.
- API 성공처럼 보여도 수학적으로 틀리거나 부족한 응답이면 기존 문제로 이동 — Task 2/4.

## 파일 구성

새 파일은 모두 `apps/baeumgil/` 아래에 둔다.

| 파일 | 책임 |
|---|---|
| `public/src/learning/linear-practice.js` | AST→ax+b 정규화, 개념 범위 검사, 선택지 검증, 문제·해설 렌더용 데이터 |
| `server/gemini-transport.mjs` | 기존 요청 전송·비밀값 보관·출력 텍스트 추출을 계약과 분리 |
| `server/practice-provider.mjs` | 두 개념의 입력/모델 출력 계약, 프롬프트, 수학 검증 |
| `public/src/ai/practice-client.js` | 생성 요청·6초 제한·취소·응답 계약 검사 |
| `public/src/learning/ai-practice.js` | 생성 문항 보관·제시·제출·복원·별도 집계 |
| `public/src/ui/ai-practice.js` | loading/검증된 문항/결과/기존 문제 대체 표시와 이벤트 |
| 기존 `server.mjs`, `server/ai-provider.mjs` | 새 경로/동시 제한, 기존 AI 전송 재사용 |
| 기존 `domain/contracts.js`, `state/persistence.js`, `state/store.js` | 선택 필드 검증·부분 복원·상태 갱신 |
| 기존 `app.js`, `ui/roadmap.js`, `ui/initial-assessment.js`, `ui/roadmap-page.js` | 공통 생성 제어·보충 진입 연결·이동 시 취소 |
| `tests/linear-practice.test.js`, `tests/practice-provider.test.js`, `tests/ai-practice.test.js`, `tests/ai-practice-app.test.js` | 아래 동작 검증 |

## Task 1: 제한된 일차식 생성 계약과 독립 정답 검증

**Interfaces:**
- `normalizeLinear(expression) -> {a,b}`: 허용 AST만 계산. 잘못된 구조는 예외.
- `validateLinearPractice(spec, {conceptId}) -> {ok:true, question, fingerprint}|{ok:false, code}`.
- question은 기존 gradeAnswer가 읽는 prompt/choices/answer/conceptIds/solutionSteps와 kind:'ai_generated'를 갖는다. 임의 AI 발문·해설은 사용하지 않는다.

- [ ] `tests/linear-practice.test.js`에 실패 테스트: 2(x+3)−(x−1)=(1,7), 3x+2x−4=(5,-4), 네 선택지 중 정답 1개, x+7/7+x 중복 거부, 잘못된 claimedAnswer 거부.
- [ ] 범위 초과·소수·비선형·빈 선택지·깊이/노드 초과·금지 연산·상수만 남는 식·개념별 구조 위반 테스트 추가.
- [ ] `node --test tests/linear-practice.test.js`로 의도한 실패를 확인.
- [ ] 순수 검증기와 canonical 문제/해설 생성 구현. 정수 계수쌍 연산으로 동치 판단, 무작위 대입이나 모델 판정에 의존하지 않음.
- [ ] 같은 테스트 통과 및 원래 generator/diagnostic 테스트 회귀 확인.

## Task 2: 서버 생성 API와 공급자 연결

**Interfaces:**
- transport: `generateGeminiContent({body, signal}) -> {text, model}`. 키/모델은 생성 시점 서버 설정, 오류는 기존 AIProviderError 코드.
- `createPracticeProvider({transport}).generate(input,{signal}) -> {spec,question,fingerprint,validatorVersion,model}`.
- `POST /api/practice`: requestId/inputRevision/assessmentId/cardId를 응답에 되돌림. 실패는 기존 `{status:'failed',error:{code,message}}` 스타일.

- [ ] mock HTTP 공급자에서 유효 사양 성공, 다른 concept/base 매핑·임의 입력 거부, wrong answer·동치 중복 응답 실패 테스트 작성 후 실패 확인.
- [ ] 기존 provider 전송을 최소 추출하고 lesson_plan/log_narrative의 입력/출력 계약을 바꾸지 않음.
- [ ] 새 프롬프트/JSON 계약, 서버 카탈로그 기반 입력 검증, 5초 deadline, 최대 4 in-flight 제한 구현.
- [ ] 키 없음/429/차단/불완전 JSON/연결 실패/취소를 검사. 느린 공급자가 취소를 무시해도 5초 안에 반환, 슬롯 해제, 허용 Host/출처 외 요청 거부.
- [ ] `node --test tests/practice-provider.test.js tests/provider.test.js tests/http.test.js` 통과. 필요 시 로컬 소켓 접근 가능한 실행 권한으로 재검증.

## Task 3: AI 연습 스냅샷과 기존 기록 복원

**Interfaces:**
- `acceptAIPractice(state, {record}, {catalog}) -> newState`.
- `presentAIPractice(state,{id,at}) -> newState`.
- `submitAIPractice(state,{id,submissionId,choiceId,abstained,helpUsed,at}) -> newState`.
- `restoreAIPractice(records,{catalog}) -> {records,recovery}`.
- `aiPracticeSummary(state,{assessmentId,cardId}) -> {readyRecord,attempted,correct}`.

- [ ] 성공·모름·중복 제출·이전 문항의 제출·다른 학생 기록 접근·제시 전 제출 거부 테스트를 작성하고 실패 확인.
- [ ] schemaVersion 1/선택 배열·기존 저장 키 유지. 생성 ID는 LAN HTTP 호환 방식 사용.
- [ ] generatedPractice 전용 검증·새 배열 기본값·손상 레코드 부분 recovery 구현. loadState의 전체 validateState 이전에 AI 필드만 격리해 generatedPracticeRecovery에 원문 보관. 기존 필수 필드 오류는 기존 정책 유지.
- [ ] 서버 스냅샷 수학 재검증 후 저장, 실제 제시에만 exposure 기록, 결과는 ai_review_practice로 분리.
- [ ] activeGeneratedPracticeId와 draftChoiceId 저장·복원으로 미제출 문항·선택지까지 유지. 닫기/기존 문항 선택 시 활성 참조만 해제.
- [ ] JSON 저장/복원, 동치 중복 제출, 역할·과목 변경, 손상 AI 한 레코드/배열 전체/활성 ID, 타 탭 revision 충돌 검증. 최초 diagnostic.attempts와 기존 paths/attempts/logs는 동일하게 유지.
- [ ] `node --test tests/ai-practice.test.js tests/persistence.test.js tests/initial-assessment.test.js` 통과.

## Task 4: 두 개념 로드맵의 생성·취소·대체 UI

**Interfaces:**
- `requestPractice(input,{signal,timeoutMs:6000}) -> Promise<{status:'ok',...}|{status:'failed'|'canceled',code}>`.
- `createPracticeController({getState,update,catalog,request,rerender}) -> {open,submit,more,useExisting,cancel}`.
- controller.open: `{assessmentId,cardId,baseQuestionId}` 입력. 해당 진단·개념의 활성 ready/answered → 미제출 → 최근 제출 문항 순으로 복원한다. 아무 AI 기록도 없는 최초 진입만 자동 생성하고 이후는 more에서만 요청한다. 원래 openInitialRoadmap은 fallback 콜백으로 사용.

- [ ] 실제 앱 진입 테스트에 지원 두 개념/미지원 개념·loading 버튼·오류 자동 대체·연속 클릭 1회 요청·기존 문항 선택 후 지연 응답 무시 테스트 작성 후 실패 확인.
- [ ] 제출 완료 AI 문항을 다시 열거나 새로고침해도 자동 재생성하지 않고, ‘더 연습’에서만 새 요청하는지 검사. 프롬프트 근거는 등록 문항 최근 3응답으로 제한하며 AI 추가 연습 답변을 포함하지 않는지 검사.
- [ ] 생성 제어기를 app.js에서 한 개 만들고 모든 로드맵 진입점에 공유. 화면 렌더 함수는 호출 부수효과를 만들지 않음.
- [ ] requestId+revision+assessment/card+view 토큰 확인, 브라우저 수학 재검증, 이동/초기화 취소 구현.
- [ ] `AI 맞춤 연습 · 정답 검증 완료`, 준비중 안내, `기존 문제로 바로 연습`, `같은 개념 더 연습`, 별도 AI 연습 집계 표시.
- [ ] fallback은 current concept의 기존 등록 문항으로 이동. AI 성공 뒤 기존 문제를 이미 선택/제시했다면 교체 금지.
- [ ] 앱·초기 진단 결과 안의 로드맵·독립 로드맵 메뉴에서 같은 컨트롤러 사용. 별도 diagnostic.html에서는 기존 동작 유지.
- [ ] `node --test tests/ai-practice-app.test.js tests/demo-entry-app.test.js tests/initial-assessment-ui.test.js tests/roadmap.test.js` 통과.

## Task 5: 최종 통합 검증과 발표 시나리오

- [ ] 다른 활성 세션/미커밋 변경을 다시 확인하고 구현 diff에 의도치 않은 변경이 없는지 검사.
- [ ] `npm test`, `npm run check:content`, `git diff --check` 실행. 현재 기준 208개 기존 테스트에 새 회귀 테스트가 모두 통과해야 함.
- [ ] 실제 브라우저에서 두 개념 각각 AI 문제 생성→제출→풀이→새로고침 복원 확인. 최초 진단·기존 기출 풀이·멘토 화면 접근도 검사.
- [ ] AI 미설정·5초 시간 초과·검증 실패에서 기존 문제를 풀 수 있고 저장되는지 확인.
- [ ] LAN HTTP 주소에서 ID 생성, 카드 이동 취소, 역할 전환, 새로고침 복원 확인. 기존 서버 설정·데이터를 임의 초기화하지 않음.
- [ ] 실제 Gemini 설정 시 성공 호출을 두 개념 각 1회 이상 검사. 설정이 없으면 실제 호출 검증 미완료를 명확히 보고.
- [ ] 발표 문서에 적용 개념·검증 범위·AI/기출/자체 제작 표시·실패 시 대체와 검증 결과를 기록. 스크린샷 저장.

## 착수 전 확인할 제안

첫 구현은 로드맵의 두 개념 **추가 연습**에만 자동 생성하고, 전체 진단/일반 기출 경로로 확장하지 않는다. 생성은 5초까지 기다리되 기존 문제로 즉시 이동할 수 있다. AI 자유 서술 해설 대신 코드로 계산한 해설을 쓴다. 이 범위를 사용자와 확인한 뒤 구현한다.

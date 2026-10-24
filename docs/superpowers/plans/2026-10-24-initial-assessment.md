# 초기 수준 확인 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 멘티가 짧은 기초 확인을 마치면 멘토가 결과를 근거로 첫 수업 개념과 문제를 선택하고 기존 배움길을 시작한다.

**Architecture:** 기존 순수 함수·store·localStorage·역할별 UI를 확장한다. 고정 7문항은 현재 지원하는 7개 개념을 하나씩 확인하며 AI 없이 채점한다. 진단 기록은 학습 attempts·회기와 분리하고, 실제 노출은 기존 exposures에 기록한다. 멘토의 개념 선택은 수업 시작 계획이며 기존 오답 보충 엔진의 단계 규칙을 대체하지 않는다.

**Tech Stack:** 기존 JavaScript ES modules, Node.js test runner, HTML/CSS. 추가 패키지 없음.

**Spec:** `docs/baeumgil/PRD.md`의 초기 진단 P1을 사용자의 이번 요청에 따라 MVP로 승격. 전체 28개 적응형 진단은 후속이며 이번은 현재 부분 그래프 7개 개념의 짧은 확인이다.

## Global Constraints

- 모든 변경은 `C:\dev\gangwon\ver2`에서 한다. 기존 미커밋 FE·서버 변경을 보존한다.
- 7문제·시간 제한 없음·모름 선택 가능. 중간 저장과 새로고침 재개를 지원한다.
- 단일 문항으로 개념 숙달·전체 실력을 확정하지 않는다. 정답·추가 확인·모름을 구분한다.
- 완료 전 멘토의 초기 결과 기반 지정은 거부한다. 기존 일반 문항 지정과 학습 기록은 유지한다.
- 과거 schemaVersion 1 저장본에 새 배열이 없어도 읽을 수 있게 한다. 새 배열이 있으면 손상 형식은 거부한다.
- 제출 전 문항 노출을 기록하며 렌더 반복·중복 제출·멘토 지정 연타는 중복을 만들지 않는다.
- 초기 응답은 최초 풀이·재도전·새 적용 통계 및 봉사 시간에 합산하지 않는다.
- 키·.env·기존 다른 변경을 커밋하지 않는다. 기능 구현은 이번 요청으로 승인되어 추가 승인 질문 없이 진행한다.

## Review Focus

- 응답 중 새로고침: 답변·현재 문항·노출이 보존되고 미응답 문항부터 재개된다.
- 기존 저장본·기존 학습 경로: 새 필드 부재를 허용하고 이어서 학습할 수 있다.
- 완료 전/다른 학생/없는 개념·문항: 추천·지정이 유효 상태를 요구하고 실패 시 과제 일부만 남기지 않는다.
- 중복 제출/지정: 원래 기록을 유지하고 과제·경로를 중복 생성하지 않는다.
- 노출 오염: 초기 문제를 이후 다시 보더라도 새 문제로 세지 않으며 진단 점수는 학습 지표와 분리된다.

## Task 1: 초기 확인 도메인과 저장 계약

**Files:** Create `apps/baeumgil/public/src/learning/initial-assessment.js`, `apps/baeumgil/tests/initial-assessment.test.js`; Modify `public/src/domain/contracts.js`, `public/src/state/store.js` (앱 기준).

**Interfaces:** `initialQuestions()`; `startInitialAssessment(state,{learnerId,id,at})`; `presentInitialQuestion(state,{assessmentId,questionId,at})`; `submitInitialAnswer(state,{assessmentId,questionId,choiceId,abstained,at})`; `initialAssessmentSummary(state,learnerId,{catalog})`; `planInitialLesson(state,input,{catalog,rng})`. store는 `startInitialAssessment`, `presentInitialQuestion`, `submitInitialAnswer`, `planInitialLesson`을 노출한다. 상태는 optional `initialAssessments`·`startingPoints` 배열을 추가한다.

- [x] RED: 7개 문항/정답 유일성/개념 참조, 빈 제출·순서 건너뛰기·중복, 저장 재개·이전 형식·손상, 결과 분리·노출, 멘토 지정의 원자성·개념/문항 연결·다른 학생을 검사한다.
- [x] GREEN: 도메인과 store 인터페이스를 구현한다. 실패 시 입력 상태를 변경하지 않는다.
- [x] `node --test tests/initial-assessment.test.js tests/flow.test.js tests/persistence.test.js` 23/23 통과.

## Task 2: 멘티·멘토 화면과 통합

**Files:** Create `public/src/ui/initial-assessment.js`, `tests/initial-assessment-ui.test.js`; Modify `public/app.js`, `public/src/ui/learner.js`, `public/src/ui/mentor.js`, `public/styles.css` (앱 기준).

**Interfaces:** `renderInitialAssessment(props) -> boolean`; `initialAssessmentPanel(state,catalog,ui) -> HTML`; `handleInitialAssessmentAction(button,props) -> boolean`; 기존 render props에 store의 새 메서드를 전달한다.

- [x] RED: 첫 안내·진행·모름·완료·멘토 대기·기존 경로 복귀, 멘토 미완료/완료 보고서·추천 수정·지정 후 경로 연결, 사용자 입력 이스케이프를 검사한다.
- [x] GREEN: 기존 카드·진행 표시·선택지와 디자인 토큰을 재사용한다. 멘토가 개념을 바꿀 때 해당 개념과 연결된 출제 가능 문항만 표시한다. 추가로 이전 문항 이벤트가 늦게 도착하는 문제를 RED→GREEN으로 보완했다. UI 8/8 통과.
- [x] 전체 `npm test`, 콘텐츠 검사 및 브라우저의 7문항→재시작→멘토 선택→기존 학습 연결 시연.
- [x] README·PRD·기획서에 이번 고정 7문항 MVP와 전체 적응형 진단 후속 범위를 반영한다.
- [x] 독립 코드 검토 1회 후 중요 지적을 실패 재현 테스트로 수정하고 전체 검증한다.

## 실행 기록

- 기준: 현재 ver2 전체 107/107 테스트 통과. FE·서버 등 기존 미커밋 변경은 별도 작업으로 보존한다.
- Ruling: 지정 경로와 기존 공유 작업을 존중해 현재 checkout에서 구현하며 자동 커밋/checkout은 하지 않는다. 비용: 통합 시 이번 변경과 이전 미커밋 변경을 구분해야 한다.
- Ruling: 현재 카탈로그의 7개 개념을 고정 7문제로 확인한다. 비용: 전체 수학 범위를 평가할 수 없으므로 화면·문서에서 제한을 명시한다.
- Task 1 complete: 도메인·저장·store 연결과 기존 기능 회귀 검증 23/23 통과.
- Task 2 complete: 초기 UI·멘토 선택·학습 연결 구현. 이전 문항 이벤트의 늦은 제출을 재현해 문항 ID 확인으로 차단했다.
- Final review: 독립 검토 1회. 중요 지적은 초기 화면 열기/닫기에서 기존 학습의 풀이 시간 동기화 누락 1건이었다.
- Final fixed: 이미 제시된 문제의 결과 화면 열기/학습 복귀가 시계를 멈추고 다시 시작하도록 수정. 두 회귀 테스트를 RED→GREEN으로 검증했고 최종 전체 테스트 126/126·콘텐츠 오류 0을 확인했다.
- Final review scope: 기존 동시 FE/서버 변경, 실제 AI 호출, 전체 적응형 진단, 기존 엔진의 단계 변경은 이번 검토에서 제외했다. 기존 기능은 전체 회귀 테스트로 확인하고 초기 화면의 실제 조작은 아래 브라우저 검증으로 보완했다. 적응형 확장과 초기 진단으로 엔진 단계를 자동 건너뛰는 기능은 이번 요청 범위에 추가하지 않았다. 검토자의 시작 시점 임시 스냅샷 접근이 제한되어 기존 변경과의 정확한 파일 비교는 검토 범위에 포함되지 않았다.
- Browser verified: 새 임시 포트에서 시연용 가명 상태로 첫 안내 → 7문항(정답5·오답1·모름1) → 3번·6번 문항에서 새로고침 재개 → 멘토가 추천을 ‘분수의 나눗셈과 역수’로 수정 → 관련 유리수 문제만 표시 → 이유 입력·확정 → 멘티 첫 문제 → 초기 결과 다시 열기·기존 학습 복귀를 확인했다.
- Evidence: `apps/baeumgil/preview/initial-assessment-learner.png`, `initial-assessment-mentor.png`. 현재 작업 폴더에 기능 변경을 남겼으며 기존 미커밋 변경을 함께 커밋/푸시하지 않았다. 별도 보류한 경미 지적은 없다.

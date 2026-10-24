# Mentor Home and Learner Results Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans, with tests first and one final read-only review.

**Goal:** 처음 보는 사람이 현재 상태와 다음 행동을 빠르게 찾도록 멘토 홈·멘티 결과 화면을 재구성한다.

**Architecture:** 기존 summary/roadmap을 읽는 UI projection만 추가한다. 홈과 결과는 한 개의 핵심 행동·간결한 수치·상세 진입점으로 구성한다. 첫 수업 지정/문제 지정/AI 제안은 수업 준비, 진단과 학습 근거는 학습 기록, 지도는 로드맵 메뉴로 분리한다.

**Tech Stack:** vanilla JS, scoped CSS, node:test, existing browser persistence.

**Spec:** 대화에서 승인된 구조. 문제 풀이 화면(진단·일반·보충) 및 기록/채점/판정 엔진 유지. 프로그래머스 공개 코딩테스트 목록(https://school.programmers.co.kr/learn/challenges)의 탐색/목록/상세 분리를 참고한다. 로그인 후 개인 화면을 확인한 것으로 주장하지 않는다.

## Global Constraints
- 앞선 개념 지도 미커밋 변경을 보존한다. 다른 프로젝트 세션 idle 확인 완료.
- 최초 진단과 보충 연습 완료를 구분하며 미측정·도움 정답을 숙달로 표현하지 않는다.
- 화면 이동만으로 기록을 바꾸지 않는다. 연습 시작은 기존 adapter로 처리한다.
- 문제 본문/선택지/즉시 피드백은 수정하지 않는다. 학습 경로 완료·멘토 확인 필요 화면만 요약형으로 변경한다.

## Review Focus
- 진단 전/중간 종료/전부 정답/보충 연습 완료/일반 경로 종료에서 적절한 다음 행동.
- 주요 행동이 빈 화면으로 가지 않으며 상세/수업 지정/AI/회기 접근이 남아 있는지.
- 기존 진행 중 보충 문제의 복원과 역할·과목·새로고침 시 기록 보존.
- 멘토 홈에 남은 오래된 도움 요청을 현재 미해결로 과장하지 않기.
- 키보드 초점과 모바일 가로 넘침, 문제 풀이 화면 스타일 격리.

### Task 1: 요약 화면과 정보 이동
**Files:** new `public/src/ui/learning-overview.js`, `public/overview.css`; edit `public/src/ui/mentor.js`, `initial-assessment.js`, `learner.js`, `text.js`, `public/index.html` (apps/baeumgil).
- [x] 기존 진단·학습 결과를 읽는 요약, 단일 우선 행동, 상세 진입점 테스트 작성 및 실패 확인.
- [x] 멘토 홈은 상태·다음 수업·최대 3개 작업 행, 멘티 결과는 이번 결과·추천 이유·다음 학습으로 구성.
- [x] 멘토 수업 준비와 진단 상세를 별도 뷰로 이동. 기존 API·UI 액션을 유지.
- [x] 일반 완료/멘토 확인 결과에 다음 학습·로드맵·접힌 상세 기록 연결.

### Task 2: 통합·보존 검증
**Files:** `tests/overview.test.js`, `tests/demo-entry-app.test.js`, `tests/initial-assessment-ui.test.js`.
- [x] 결과 → 추천 연습 → 복원, 홈 → 수업 준비 → 기존 문제 지정 → 멘티 학습 흐름 검증.
- [x] 기존 저장본·확정 일지·진단·보충 기록 보존과 활성 풀이 UI 회귀 검사.
- [x] 전체 테스트·콘텐츠 검사·브라우저 desktop/mobile 검증 및 독립 리뷰.
- [x] 문서와 화면 캡처, 다른 세션 상태 및 최종 diff 확인. 커밋·푸시는 하지 않음.

검증 결과: `docs/overview-screens-verification.md` 참고. 전체 193개 테스트 및 콘텐츠 검사 통과.

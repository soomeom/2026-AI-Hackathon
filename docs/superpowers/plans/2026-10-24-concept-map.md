# Concept Map Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 멘토·멘티의 별도 로드맵 메뉴에서 선수 관계와 다음 학습을 보고 기존 보충 학습으로 연결한다.

**Architecture:** 기존 진단 카탈로그의 직접 선수 연결로 읽기 전용 그래프를 만든다. 진단 카드의 상태·연습 진행률을 재사용하고, 기존 practice adapter로만 답안을 저장한다. 지도 선택·필터는 UI 상태이며 저장 스키마를 바꾸지 않는다.

**Tech Stack:** 기존 vanilla JavaScript ES modules, HTML buttons + decorative SVG edges, CSS, node:test.

**Spec:** 대화에서 승인된 방향: 별도 메뉴, 추천 경로/영역/전체 지도, 상태 구분, 상세 근거와 보충 학습 연결, 기존 카드 전환. 주간 일정은 제외.

## Global Constraints
- 기존 기록과 최초 진단 판정은 변경하지 않는다. 미측정 개념은 통과나 약점으로 추정하지 않는다.
- 현재 카탈로그의 직접 선수 관계만 연결하고, 과거 기록은 현재 지도에 보완 표시한다.
- 외부 그래프 라이브러리 없이 구현한다. 멘티의 일반 풀이 시간은 지도에서 멈춘다.
- 다른 세션 idle 및 clean working tree 확인 완료. 이번 요청은 구현·검증까지이며 커밋·푸시는 후속 요청 때 진행.

## Review Focus
- 진단 없음/진행 중/전부 정답일 때에도 지도 진입이 가능하고 상태를 과장하지 않는지.
- 공유 선수 개념 및 두 갈래 선수 관계가 누락·중복·잘못된 지름길 없이 표시되는지.
- 지도 탐색이 답안·노출 기록을 쓰지 않고, 실제 연습을 열 때만 기존 저장 경로를 사용하는지.
- 역할·과목 전환·새로고침·기존 연습 재개 시 기록 보존 및 풀이 타이머 정지.
- 작은 화면과 키보드에서 노드를 선택하고 상세·연습·뒤로 가기에 접근 가능한지.

### Task 1: 읽기 전용 지도 모델
**Files:** Create `apps/baeumgil/public/src/learning/concept-map.js`, `apps/baeumgil/tests/concept-map.test.js`.
**Interfaces:** `buildConceptMap(roadmap, bank, config)` → nodes, edges, nextNodeId; `selectMapNodes(map, {scope, domainId, nodeId})` → 표시 노드. Nodes use existing domain:concept keys. Edges prerequisite → dependent.
- [x] 직접 연결, 공유 선수 개념, 미확인 상태, 진단/연습 상태 분리, 입력 불변성 테스트를 작성하고 실패 확인.
- [x] 모델 구현 후 해당 테스트 통과 확인.

### Task 2: 별도 메뉴·지도·기존 연습 연결
**Files:** Create `public/src/ui/concept-map.js`, `public/src/ui/roadmap-page.js`; modify `public/app.js`, `public/index.html`, `public/roadmap.css`, `public/src/ui/text.js`, `public/src/ui/mentor.js`, `public/src/ui/sessions.js`, `public/src/state/demo-session.js`, `tests/demo-entry-app.test.js` (all under apps/baeumgil).
**Interfaces:** `renderRoadmapPage(props)` shares `handleInitialAssessmentAction`, `renderRoadmap`. Map controls only change `ui`; practice buttons use existing `data-roadmap-action` API.
- [x] 앱 통합 테스트: 메뉴 접근, 지도에서 연습 제출·복원, 빈 기록, 일반 풀이 타이머, 회기 미저장 입력 이탈 보호. 미구현 실패 확인.
- [x] 멘티 외부 메뉴와 멘토 기존 탭에 로드맵 추가. 완료/중간 종료 때만 보충 연습 허용. 진행 중에는 진단 계속 안내.
- [x] 기본 추천 경로·영역/전체 필터, 3단계 노드, 직접 연결선, 상세 근거, 카드 보기 구현. 진단 통과와 연습 완료를 별도 표시.
- [x] 전체 npm test 및 npm run check:content 통과 확인.

### Task 3: 통합 검증
- [x] 브라우저에서 멘티·멘토 메뉴 → 지도 → 상세 → 연습 → 뒤로 → 새로고침 검증.
- [x] 데스크톱/390px 모바일, 미확인/분기 선수 관계/전체 보기/콘솔 오류 점검.
- [x] 독립 최종 리뷰와 중요 지적 수정, 다른 세션 상태·git diff 재확인.
- [x] 검증 결과와 사용 경로 문서화. 커밋·푸시는 하지 않음.

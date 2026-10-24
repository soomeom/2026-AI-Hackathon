# 과목 선택 구현 계획

> 실행: superpowers:executing-plans로 이 세션에서 순서대로 구현하고 마지막에 독립 코드 리뷰를 수행한다.

**Goal:** 역할 입장 뒤 수학만 활성화된 과목 화면을 제공하고 기존 기록을 보존한다.
**Architecture:** 기존 sessionStorage 객체에 nullable subjectId를 추가한다. 역할 없음/과목 없음/수학 선택 상태로 화면을 분기하고, 과목·역할 이동은 동일한 작업 종료 보호 절차를 사용한다.
**Tech Stack:** 기존 ES modules, HTML/CSS, Node test runner. 새 의존성 없음.
**Spec:** ../specs/2026-10-24-subject-selection-design.md (사용자 구현 승인 완료).

## 공통 조건
- 수학만 활성화. 국어·영어·사회·과학·한국사는 준비 중이며 클릭 동작 없음.
- 학습 localStorage 스키마·키·ID를 변경하지 않는다. 기존 역할만 있는 세션은 과목 화면으로 복원한다.
- 문항·진단 알고리즘은 수정하지 않는다. 대상 파일의 다른 세션 변경이 나타나면 중단한다.
- 사용자가 지정한 ver2에서 수행한다. 현재 HEAD 3aadeaa, 다른 관련 세션 idle, 제품 파일 깨끗함. 이번 요청은 구현·검증이며 커밋은 별도 요청 시 수행한다.

## 작업 1: 과목 상태와 화면
Files: 새 public/src/content/subjects.js, public/src/ui/subject-selection.js, tests/subject-selection.test.js; 수정 public/src/state/demo-session.js.
Interfaces: SUBJECTS(immutable id/name/enabled 목록), isSubjectEnabled(id): boolean. demoSession.subjectId getter, selectSubject(id), clearSubject(); enter(role)는 과목 선택을 비운다. renderSubjectSelection({root,state,role,onSelect})는 활성 과목만 onSelect로 전달한다.
- [x] 역할 없는 수학 선택·준비 중 ID 거부, 역할만 있는 구 저장본 복원, 수학 선택 복원/해제, 저장 불가, 기존 학습 저장값 불변 테스트를 작성하고 실패 확인.
- [x] 과목 목록·상태 관리·과목 카드 구현 후 테스트 통과 확인.

## 작업 2: 앱 통합
Files: public/app.js, public/index.html, public/styles.css, tests/demo-entry-app.test.js.
Interfaces: selectSubject(subjectId)는 선택 저장 후 prepareDemoRole을 호출한다. leaveWorkspace({changeRole})는 회기 경고 취소 시 아무 상태도 바꾸지 않고, 이동 시 AI 무효화→세션 변경→시간 중단→렌더/초점 이동을 수행한다.
- [x] 기존 입장 테스트를 역할→수학 선택으로 갱신하고, 과목 화면에서 진단·노출이 생성되지 않음/준비 중 진입 차단을 확인하는 실패 테스트 작성.
- [x] header 과목 선택 버튼, 3단계 렌더, 수학 작업 화면에서만 시간 누적·초기화 표시, 기존 저장본 호환 구현.
- [x] 과목 이동 전후 응답·진단·회기·일지·초안 보존, 경고 취소, 타이머 제외, 늦은 AI 응답, 초기화 확인 해제 테스트 통과 확인.

## 작업 3: 최종 검증
Files: README.md, 계획/설계 문서의 실행 결과.
- [x] 전체 테스트와 콘텐츠 검사, git diff --check 통과.
- [x] 별도 포트 브라우저에서 두 역할→과목→수학, 진단 응답 보존, 멘토 지정→멘티 풀이, 새로고침/새 탭, 모바일·키보드 검증.
- [x] 별도 읽기 전용 리뷰와 다른 세션 변경 재확인. 결과와 제한을 기록.

## 주요 검증 관점
구버전/손상된 입장 상태, 유효하지 않은 과목, 수학 선택 전 자동 문제 노출, 이동 취소 시 폼·AI 유지, 과목 화면 체류 시간과 늦은 응답으로 인한 오염.

## 실행 기록
- 시작: 설계 승인 확인, 충돌 없음. 구현 전 대상 제품 파일은 모두 깨끗함.
- 완료: SUBJECTS 목록과 세션 과목 선택/해제, 구버전 역할 저장본 호환, 과목 화면 및 헤더 이동을 구현했다. 학습 데이터 스키마는 그대로 유지했다.
- 테스트 우선 검증: 신규 상태/화면 테스트는 모듈 미구현으로 실패한 뒤 통과했다. 앱 통합 테스트 8개는 두 단계 진입 미구현으로 실패한 뒤 모두 통과했다.
- 최종 검증: 전체 168개 통과, 과목·입장 관련 23개 통과, 콘텐츠 검사 오류 0, git diff --check 통과.
- 브라우저(별도 포트 13920): 멘티→과목→수학 진단 1문항 응답→과목 화면→재입장/새로고침 시 2번째 문항 복원. 부분 결과를 멘토에게 넘긴 뒤 멘토→과목→수학에서 첫 문제 지정, 멘티 정답 제출→과목 왕복 후 결과 유지, 멘토 화면 1/1 정답 확인. 새 탭은 역할 입장부터 시작.
- 과목 버튼 Enter 진입 확인. 모바일에서 카드 세로 배치 및 scrollWidth=clientWidth=375 확인. 브라우저 콘솔 오류 없음. 화면 전환 시 주 콘텐츠에 초점을 두고 스크롤을 맨 위로 이동해 제목이 가려지지 않도록 보완했다.
- 미저장 회기 취소/승인과 일지 초안·확정 일지 보존, 과목 화면 체류 시간 제외는 실제 app.js를 실행하는 통합 테스트로 확인했다. 늦은 AI 응답은 기존 무효화 단위 테스트와 종료 처리 코드 리뷰로 확인했으며 실제 공급자 요청을 보내지는 않았다.
- 독립 읽기 전용 리뷰: 차단 이슈 없음. 관련 23개 테스트와 diff check를 재실행해 통과. AI 진행 중 과목 이동의 전체 앱 테스트 추가는 선택적 보강 의견으로 남겼다(기존 테스트+연결 코드 검토로 현재 동작 확인).
- 충돌 재확인: HEAD 3aadeaa 유지, 다른 관련 세션 idle, 변경 파일은 이 기능 범위뿐. 커밋/푸시는 하지 않았다.
- 증거 이미지: 작업 시각화 폴더의 subject-selection-final.png. 사용 안내는 apps/baeumgil/README.md에 갱신했다.

# 보호자 학습 소식·큰글씨 구현 계획

승인 근거: 이 채팅의 보호자 요약 화면·125% 큰글씨 계획과 사용자의 구현 요청(2026-10-24).
기준: ver2 c2445ed. 기존 화면·학습 기록 유지. 커밋·푸시는 이번 구현 범위 밖.

## 설계와 제약

- 보호자 시연 역할을 추가한다. 같은 브라우저의 가명 학습 기록만 읽는다. 실제 인증·기기 간 공유가 아니다.
- 최근 7일(Asia/Seoul)의 날짜별 응답 막대그래프, 개념별 확인 상태, 다음 학습 순서, 보호자 대화 질문을 제공한다.
- 학습 참여와 이해를 분리한다. 모름도 응답 수에 포함하고 명시한다. 정답률·노력 점수·순위·합격 예측을 만들지 않는다.
- 진단·지정 학습·로드맵 연습·AI 연습을 출처별로 집계하고 중복을 제거한다. 날짜 없는 과거 응답은 날짜를 추정하지 않고 별도 안내한다. 타 학생 기록을 포함하지 않는다.
- 독립 수행은 최초 노출·도움 없음의 명시적 근거가 있을 때만 표시한다. 보충 연습 정답은 별도로 표시하며 숙달을 확정하지 않는다.
- 내부 일지·메모·AI 제안은 노출하지 않는다. 멘토가 보호자 공유 버튼으로 저장한 문구만 별도 안내로 노출한다.
- 보호자 화면은 학습·과제·초기화 명령을 실행하지 않는다. 기존 보충 학습은 멘티 화면에서 그대로 이어간다.
- 큰글씨는 공통 상단 버튼으로 전환하며 기록과 별도 키에 저장한다. 저장 불가 시 메모리에서 동작한다. 화면을 재생성하지 않아 미저장 입력과 선택을 보존한다.
- 기존 고정 px 글씨를 rem으로 정리한다. 일반 16px, 큰글씨 20px. SVG 좌표용 글씨는 별도 유지하고 지도 밖의 읽기 가능한 설명·목록을 제공한다.
- 원본 문제 이미지는 별도 확대 대화상자로 볼 수 있다. 열고 닫을 때 답안·풀이 상태를 유지한다.

## 작업

### 1. 보호자 요약 계산
- Files: public/src/learning/guardian-summary.js, tests/guardian-summary.test.js
- Interface: buildGuardianSummary(state, catalog, {now}) → activity(7일), activeDays, totalResponses, undatedResponses, concepts, nextSteps, assessmentStatus, sharedMessage.
- [x] 날짜 경계·중복·다른 학생·모름·날짜 없음·보충/독립 구분의 실패 테스트를 작성하고 RED 확인.
- [x] 순수 읽기 함수 구현, 테스트 GREEN. 원본 JSON 불변 확인.

### 2. 표시 설정과 확대
- Files: public/src/state/display-preferences.js, public/src/ui/image-viewer.js, public/index.html, public/styles.css, public/overview.css, public/roadmap.css, public/sidenav.css, public/accessibility.css, tests/display-preferences.test.js
- Interface: createDisplayPreferences(storage).largeText/setLargeText(bool), installDisplayControls({document,storage}).
- [x] 기본값·복원·손상·저장 실패·기록 키 보존 테스트 RED→GREEN.
- [x] 상단 토글·설정 상태 알림·이미지 확대 연결. DOM 재생성 없이 적용.

### 3. 보호자 입장·화면·공유
- Files: public/src/state/demo-session.js, public/src/ui/demo-entry.js, public/src/ui/subject-selection.js, public/src/ui/guardian.js, public/guardian.css, public/app.js, public/src/ui/mentor.js, public/src/ui/guardian-message.js, tests/demo-entry-app.test.js
- [x] 실제 앱 통합 테스트: 보호자 읽기 전용·세 역할 왕복·기록 유지·멘토 공유 문구/비공개 일지 분리·큰글씨 입력 유지 RED→GREEN.
- [x] 그래프에 수치·날짜·글 요약 제공, 기록 없는 날은 '기록 없음'. 현재/다음/목표를 짧은 순서로 표시.

### 4. 최종 검증
- [x] 전체 node --test tests/*.test.js, npm run check:content, git diff --check.
- [x] 실제 브라우저: 기존 기록 유지, 보호자 진입·새로고침·읽기 전용, 멘토 안내 공유, 큰글씨 역할 이동/새로고침, 미저장 입력 유지, 이미지 확대와 Escape/포커스 복원.
- [x] 375px/768px/1440px와 큰글씨에서 잘림·겹침·가로 넘침 점검. 기존 풀이·AI 대체·로드맵 회귀 확인.
- [x] 다른 세션 상태와 변경 목록을 다시 확인. 구현·검증 결과와 한계를 기록한다.

## 진행 기록
- 기준 전체 테스트225/225. 작업 폴더 깨끗함. 관련 다른 채팅 idle 확인, 충돌 없음. 기존 ver2 체크아웃에서 진행(기존 세션 방식 유지).
- UI 검토는 ui-ux-pro-max 사용. 기존 청록색·Pretendard·카드 양식 유지, 새 외부 라이브러리 없음. 그래프는 7일 막대와 직접 수치로 읽도록 한다.

- 구현 결정: 멘토 공유 안내는 선택 필드 guardianMessages에 저장하며, 기존 필드 없는 저장본은 그대로 복원한다. 손상 시 자동 삭제하지 않고 기존 복구 화면으로 보낸다.
- 검토 보완: 출처 ID가 없는 기존 생성 문항의 개념도 해당 학생 경로의 itemId 스냅샷에서 읽는다. 실제 선수 관계를 따라 다음 3단계까지 보여 주고, 개념 목록은 4개 이후 펼쳐 본다.
- 최종: 전체236/236, 콘텐츠362 오류0, 공백 검사 통과. 별도 리뷰 Critical/Important 미해결 없음. 브라우저 검증 결과는 docs/baeumgil/보호자_큰글씨_통합검증.md 참조.
- 동시 작업 재확인: 다른 세션이 team-feedback 계획 문서만 추가했고 이 작업 종료를 기다리는 내용을 명시했다. 실행 코드 변경은 겹치지 않으며 그 문서는 수정하지 않았다.
- 커밋 인계: 사용자 요청으로 구현·테스트·검증 문서와 가상 화면 예시를 커밋한다. 다른 세션의 team-feedback 문서는 제외한다. 커밋 직전 재실행236/236, 콘텐츠 오류0 확인. 원격 푸시는 별도 요청 범위다.

# 로그인·회원가입 프로토타입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첫 화면을 실제 서비스처럼 로그인 화면으로 바꾸고, 시연 계정 3개(멘토·멘티·보호자)로 들어가게 하며, 회원가입은 입력·검증까지만 하고 실제로 등록하지 않는다.

**Architecture:** DB와 서버 인증은 만들지 않는다. 시연 계정과 가입 검증은 브라우저 모듈(`src/auth/`)의 순수 함수로 두고, 로그인에 성공하면 지금의 역할 입장(`onEnter(role)` → `demoSession.enter(role)`)을 그대로 쓴다. 계정과 역할이 1:1이라 입장 상태 저장 구조(`baeumgil:demo-session:v1`)는 바꾸지 않는다. 화면 전환(로그인/회원가입/가입 완료)은 `demo-entry.js`의 모듈 상태 `entryView.view`로만 관리하고 저장하지 않는다.

**Tech Stack:** Vanilla JS ES modules, HTML/CSS, `node:test`, 기존 Node 서버(`server.mjs`) 변경 없음.

**Spec:** 2026-10-25 사용자 요청 — "main에 실제 DB까지는 아니지만 회원가입이랑 로그인 화면도 구현하자. 실제 서비스 프로토타입을 만든다고 생각하고. 임시로 학부모, 멘토, 멘티 아이디 비번 만들어서 들어갈 수 있게 해서. 회원가입은 화면만 있고 실제로 등록은 안되게 해서." 원 피드백(노션 피드백 페이지): 회원가입에 지역·나이·이름·비밀번호·역할 입력, 나이로 고령자면 큰글씨 추천, 보호자·멘토·멘티 매칭.

## Global Constraints

- 작업 폴더 `C:\dev\gangwon\ver2\apps\baeumgil`, 브랜치 `ver2`. worktree를 만들지 않는다.
- **시작 조건:** 다른 세션의 ShipOS 디자인 작업(`index.html`, `tests/demo-entry-app.test.js`, `learning-overview.js`, `mentor.js` 수정 중)이 커밋된 뒤 시작한다. 시작 전 `git status --short`가 비어 있는지 확인한다.
- 커밋은 이 계획에서 만든·고친 경로만 골라 `git add` 한다. push는 사용자가 요청할 때만 한다.
- 시연 계정(고정값):

  | 역할 | 아이디 | 비밀번호 | 화면에 보이는 이름 |
  |---|---|---|---|
  | 멘토 | `mentor01` | `mentor1234` | 김멘토(가명) |
  | 멘티 | `learner01` | `learner1234` | 하늘(가명) |
  | 보호자 | `parent01` | `parent1234` | 하늘(가명)의 보호자 |

- 비밀번호와 회원가입 입력값은 localStorage·sessionStorage·서버 어디에도 저장하지 않는다. 입장 상태에는 지금처럼 `role`, `subjectId`만 저장한다.
- 시연 계정 비밀번호는 클라이언트 코드와 로그인 화면에 공개된다(시연용 공개 값). 실제 서비스 비밀번호가 아니라는 안내 문구를 화면에 둔다.
- 회원가입 데이터는 가명 사용을 안내한다. 실제 이름 입력을 요구하지 않는다.
- 기존 학습 기록 저장 키·스키마·채점·학습 엔진은 바꾸지 않는다.
- 문구는 기존 화면처럼 존댓말 "-요"체.

## Review Focus

1. **비밀번호가 어디에도 남지 않는다:** 로그인 실패·성공, 회원가입 제출 뒤 localStorage와 sessionStorage 어떤 값에도 입력한 비밀번호 문자열이 없어야 한다. → Task 3, Task 4 테스트.
2. **Enter 키 제출과 이전 화면 핸들러:** 폼 안에서 Enter로 로그인·가입이 되고, 로그인 뒤 학습 화면에서 남은 `app.onsubmit`이 동작하지 않아야 한다. → Task 3 테스트(`app.onsubmit`이 렌더마다 초기화).
3. **아이디 앞뒤 공백·대문자:** `" Mentor01 "`은 로그인되고, 비밀번호 앞뒤 공백은 그대로 비교해 틀린 것으로 본다. → Task 1 테스트.
4. **검증 오류 뒤 입력 유지:** 가입 검증에 실패하면 비밀번호 두 칸만 비우고 나머지 입력은 그대로 남는다. 첫 오류 칸에 포커스가 간다. → Task 4 테스트.
5. **큰글씨 추천 창이 떠 있는 동안:** 로그인·가입 버튼과 빠른 입장 버튼이 동작하지 않는다(기존 규칙 유지). 가입 화면에서 연령대를 "60세 이상"으로 바꿔도 같은 창이 뜬다. → Task 4 테스트.

---

## File Structure

| 파일 | 책임 |
|---|---|
| Create `public/src/auth/accounts.js` | 시연 계정 목록과 `authenticate` |
| Create `public/src/auth/signup.js` | 가입 선택지(지역·연령대·역할)와 `validateSignup` |
| Create `public/src/ui/signup-form.js` | 가입 폼 HTML과 폼 값 읽기 |
| Modify `public/src/ui/demo-entry.js` | 첫 화면을 로그인/가입/가입 완료 3개 화면으로 전환 (큰글씨 추천 창은 그대로 재사용) |
| Create `public/auth.css` | 로그인·가입 화면 스타일 |
| Modify `public/index.html` | `auth.css` 연결, "역할 바꾸기" → "로그아웃", 안내 문구 |
| Modify `public/app.js` | `app.onsubmit` 초기화, 입장 안내 문구 |
| Create `tests/auth.test.js` | Task 1·2 단위 테스트 |
| Modify `tests/demo-entry.test.js`, `tests/demo-entry-app.test.js` | 화면·앱 흐름 테스트 |

---

### Task 1: 시연 계정 인증

**Files:**
- Create: `public/src/auth/accounts.js`
- Test: `tests/auth.test.js`

**Interfaces:**
- Produces:
  - `DEMO_ACCOUNTS: ReadonlyArray<{ loginId: string, password: string, role: 'mentor'|'learner'|'guardian', label: string }>` — 위 표 순서(멘토, 멘티, 보호자), `label`은 `'멘토'|'멘티'|'보호자'`. 배열과 각 항목을 `Object.freeze`.
  - `authenticate(loginId: unknown, password: unknown) → { ok: true, role } | { ok: false, reason: 'empty' | 'mismatch' }` — 아이디는 `trim()` 후 소문자로 비교한다. 비밀번호는 그대로 비교한다. 문자열이 아니거나 trim 뒤 빈 값이면 `'empty'`.
  - `isReservedLoginId(loginId: string) → boolean` — 시연 계정 아이디와 같으면 true(Task 2가 사용).

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/auth.test.js`)

```js
test('demo accounts log in by role; ids ignore case and outer spaces, passwords do not', () => {
  assert.deepEqual(DEMO_ACCOUNTS.map(a => [a.loginId, a.role]), [['mentor01','mentor'],['learner01','learner'],['parent01','guardian']]);
  assert.deepEqual(authenticate('mentor01', 'mentor1234'), { ok: true, role: 'mentor' });
  assert.deepEqual(authenticate(' Parent01 ', 'parent1234'), { ok: true, role: 'guardian' });
  assert.deepEqual(authenticate('learner01', ' learner1234'), { ok: false, reason: 'mismatch' });
  assert.deepEqual(authenticate('learner01', 'mentor1234'), { ok: false, reason: 'mismatch' });
  assert.deepEqual(authenticate('nobody', 'x'), { ok: false, reason: 'mismatch' });
  for (const [id, pw] of [['', 'a'], ['   ', 'a'], ['mentor01', ''], [null, undefined]]) assert.equal(authenticate(id, pw).reason, 'empty');
  assert.equal(Object.isFrozen(DEMO_ACCOUNTS[0]), true);
  assert.equal(isReservedLoginId('MENTOR01'), true);
});
```

- [ ] **Step 2:** `node --test tests/auth.test.js` → 모듈이 없어 FAIL
- [ ] **Step 3:** `public/src/auth/accounts.js` 구현. 파일 첫 줄 주석: 시연용 공개 계정이며 실제 인증이 아님.
- [ ] **Step 4:** `node --test tests/auth.test.js` → PASS
- [ ] **Step 5: 커밋** `git add public/src/auth/accounts.js tests/auth.test.js && git commit -m "feat: 시연 계정 인증 모듈 추가"`

---

### Task 2: 회원가입 검증

**Files:**
- Create: `public/src/auth/signup.js`
- Test: `tests/auth.test.js`

**Interfaces:**
- Consumes: `isReservedLoginId` (Task 1)
- Produces:
  - `SIGNUP_ROLES = [['learner','멘티(학생)'],['mentor','멘토'],['guardian','보호자']]`
  - `GANGWON_REGIONS` — `['춘천시','원주시','강릉시','동해시','태백시','속초시','삼척시','홍천군','횡성군','영월군','평창군','정선군','철원군','화천군','양구군','인제군','고성군','양양군','강원 외 지역']`
  - `SIGNUP_AGE_BANDS = [['under14','14세 미만'],['teen','14~19세'],['adult','20~59세'],['senior','60세 이상']]`
  - `validateSignup(form) → { ok: boolean, errors: Record<field, string> }`
    - `form` 필드: `name, loginId, password, passwordConfirm, role, region, ageBand, linkCode, agree, guardianAgree` (문자열, 체크박스는 boolean)
    - `errors`의 키 순서는 위 필드 순서(Task 4가 첫 오류 칸에 포커스할 때 사용)
  - `normalizeLinkCode(code: string) → string` — trim 후 대문자

검증 규칙과 오류 문구(정확히 이 문구):

| 필드 | 규칙 | 오류 문구 |
|---|---|---|
| name | trim 후 1~20자 | `이름(가명)을 1~20자로 입력해 주세요.` |
| loginId | `/^[a-z0-9]{4,16}$/` (trim·소문자 후) | `아이디는 영문 소문자와 숫자 4~16자예요.` |
| loginId | 시연 계정 아이디와 같음 | `이미 사용 중인 아이디예요.` |
| password | 8~32자, 영문과 숫자를 각각 1자 이상 | `비밀번호는 영문과 숫자를 섞어 8~32자로 만들어 주세요.` |
| passwordConfirm | password와 다름 | `비밀번호가 서로 달라요.` |
| role | SIGNUP_ROLES 밖 | `역할을 골라 주세요.` |
| region | GANGWON_REGIONS 밖 | `사는 지역을 골라 주세요.` |
| ageBand | SIGNUP_AGE_BANDS 밖 | `연령대를 골라 주세요.` |
| linkCode | 값이 있는데 `/^BG-[A-Z0-9]{4}$/`가 아님(정규화 후) | `연결 코드는 BG-1234 형식이에요.` |
| linkCode | role이 guardian인데 비어 있음 | `자녀의 연결 코드를 입력해 주세요.` |
| agree | false | `개인정보 수집·이용에 동의해 주세요.` |
| guardianAgree | ageBand가 under14이고 guardianAgree가 false | `14세 미만은 보호자 동의가 필요해요.` |

- [ ] **Step 1: 실패하는 테스트 작성**

```js
const valid = { name:'하늘', loginId:'sky2026', password:'abc12345', passwordConfirm:'abc12345', role:'learner', region:'춘천시', ageBand:'teen', linkCode:'', agree:true, guardianAgree:false };
test('signup validation accepts a complete form and reports each rule with its exact message', () => {
  assert.deepEqual(validateSignup(valid), { ok: true, errors: {} });
  const bad = validateSignup({ ...valid, name:' ', loginId:'Mentor01', password:'abcdefgh', passwordConfirm:'x', role:'admin', region:'서울', ageBand:'', linkCode:'bg-12', agree:false });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors), ['name','loginId','password','passwordConfirm','role','region','ageBand','linkCode','agree']);
  assert.equal(bad.errors.loginId, '이미 사용 중인 아이디예요.');
  assert.equal(validateSignup({ ...valid, role:'guardian' }).errors.linkCode, '자녀의 연결 코드를 입력해 주세요.');
  assert.equal(validateSignup({ ...valid, role:'guardian', linkCode:' bg-a1b2 ' }).ok, true);
  assert.equal(validateSignup({ ...valid, ageBand:'under14' }).errors.guardianAgree, '14세 미만은 보호자 동의가 필요해요.');
  assert.equal(validateSignup({ ...valid, ageBand:'under14', guardianAgree:true }).ok, true);
  assert.equal(validateSignup({ ...valid, password:'12345678', passwordConfirm:'12345678' }).errors.password, '비밀번호는 영문과 숫자를 섞어 8~32자로 만들어 주세요.');
});
```

- [ ] **Step 2:** `node --test tests/auth.test.js` → FAIL
- [ ] **Step 3:** `public/src/auth/signup.js` 구현
- [ ] **Step 4:** `node --test tests/auth.test.js` → PASS
- [ ] **Step 5: 커밋** `git add public/src/auth/signup.js tests/auth.test.js && git commit -m "feat: 회원가입 입력 검증 추가"`

---

### Task 3: 로그인 화면

**Files:**
- Modify: `public/src/ui/demo-entry.js` (역할 카드 3개 → 로그인 화면)
- Modify: `public/app.js` (`render()`의 핸들러 초기화 부분에 `app.onsubmit = null;` 추가)
- Create: `public/auth.css`
- Modify: `public/index.html` (`auth.css` 링크, `#change-role` 문구 "로그아웃", `.demo-note` 문구)
- Test: `tests/demo-entry.test.js`, `tests/demo-entry-app.test.js`

**Interfaces:**
- Consumes: `authenticate`, `DEMO_ACCOUNTS` (Task 1)
- Produces:
  - `renderDemoEntry({ root, state, onEnter, persistent, display })` — 시그니처는 그대로. 모듈 상태 `entryView`에 `view: 'login'|'signup'|'signup-done'`(기본 `'login'`), `loginId: string`, `loginError: string`, `signupValues`, `signupErrors`를 더한다.
  - DOM 계약(Task 4와 테스트가 사용):
    - `<form id="login-form">` 안 `#login-id`(autocomplete="username"), `#login-password`(type="password", autocomplete="current-password"), 제출 버튼 `data-auth-action="login"`
    - 오류 `<p id="login-error" role="alert">`
    - 회원가입 이동 버튼 `data-auth-action="signup"`
    - 시연 계정 상자: 계정마다 아이디·비밀번호를 보여 주고, 빠른 입장 버튼 `data-enter-role="mentor|learner|guardian"`(문구: "멘토로 바로 들어가기" 등). 기존 테스트 도우미 `enterMath`가 이 dataset을 그대로 쓴다.
    - 기존 "보기 편한 글씨" 연령대 섹션과 추천 창은 로그인 화면에 그대로 둔다.

화면 구성(위에서 아래):
1. 머리말: pill "배움길", 제목 "배움은 함께, 시작은 나에게 맞게." 유지, 부제 "로그인하고 오늘의 배움을 이어가요."
2. 로그인 카드: 아이디, 비밀번호, [로그인](primary large), 오류 문구, "처음이신가요? [회원가입]"
3. 보기 편한 글씨 섹션(기존)
4. 시연 계정 상자: 제목 "시연 계정", 설명 "심사·체험용 공개 계정이에요. 실제 서비스 비밀번호가 아니에요.", 3행(역할·아이디·비밀번호·빠른 입장 버튼)

동작:
- 로그인 버튼 클릭과 `#login-form` 제출(Enter)은 같은 함수로 처리한다. 제출 시 `event.preventDefault()`.
- 실패: `empty` → `아이디와 비밀번호를 입력해 주세요.`, `mismatch` → `아이디 또는 비밀번호가 맞지 않아요.` 아이디는 입력값을 유지하고 비밀번호 칸은 비운 채 다시 그린다. 오류 뒤 `#login-password`에 포커스.
- 성공: `entryView`의 loginId·loginError를 비우고 `onEnter(role)`. 이후 흐름(과목 선택, 보호자 바로 입장)은 기존과 같다.
- index.html 문구: `#change-role` → `로그아웃`. `.demo-note` 앞부분 → `배움길 프로토타입이에요. 시연 계정으로만 로그인할 수 있고 회원 정보는 저장하지 않아요.` `#entry-session-note` → `로그인 상태를 저장할 수 없어 새로고침하면 다시 로그인해야 할 수 있어요.`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/demo-entry.test.js`:

```js
test('login screen enters only with a matching demo account and keeps the typed id on failure', () => {
  const fields = { 'login-id': { value: '' }, 'login-password': { value: '' } };
  const root = { innerHTML: '', querySelector: sel => fields[sel.slice(1)] ?? { focus() {} } };
  const roles = [];
  const press = dataset => root.onclick({ target: { closest: () => ({ dataset }) } });
  renderDemoEntry({ root, state: createDemoState(), onEnter: r => roles.push(r), persistent: true });
  assert.match(root.innerHTML, /id="login-form"/);
  assert.match(root.innerHTML, /mentor01/); assert.match(root.innerHTML, /실제 서비스 비밀번호가 아니에요/);
  press({ authAction: 'login' });
  assert.match(root.innerHTML, /아이디와 비밀번호를 입력해 주세요/);
  fields['login-id'].value = 'learner01'; fields['login-password'].value = 'wrong';
  press({ authAction: 'login' });
  assert.match(root.innerHTML, /아이디 또는 비밀번호가 맞지 않아요/);
  assert.match(root.innerHTML, /value="learner01"/); assert.deepEqual(roles, []);
  fields['login-password'].value = 'learner1234';
  root.onsubmit({ preventDefault() {} });
  assert.deepEqual(roles, ['learner']);
});
```

`tests/demo-entry-app.test.js` (앱 전체, 기존 `boot`·`click` 도우미 사용):

```js
test('logging in with a demo account reaches the workspace, stores no password, and logout returns to login', async t => {
  const h = await boot(t, { saved: seeded() });
  h.node('login-id').value = 'mentor01'; h.node('login-password').value = 'mentor1234';
  click(h.app, { authAction: 'login' });
  assert.match(h.app.innerHTML, /어떤 과목을 함께 배울까요/);
  click(h.app, { subjectId: 'math' });
  assert.equal(h.app.onsubmit, null);
  for (const v of [h.local.getItem(STORAGE_KEY), h.tab.getItem(DEMO_SESSION_KEY)]) assert.doesNotMatch(String(v), /mentor1234/);
  click(h.node('change-role'));
  assert.match(h.app.innerHTML, /id="login-form"/);
});
```

(`boot`의 가짜 DOM에서 `app.querySelector('#login-id')`는 `node('login-id')`를 돌려준다.)

- [ ] **Step 2:** `node --test tests/demo-entry.test.js tests/demo-entry-app.test.js` → 새 테스트 FAIL
- [ ] **Step 3:** `demo-entry.js` 로그인 화면 구현, `app.js`에 `app.onsubmit = null;`, `index.html` 문구·링크, `auth.css`(로그인 카드 최대 폭 28rem 가운데 정렬, 시연 계정 상자는 표 대신 행 목록, 640px 이하에서 한 줄씩 쌓기, `.large-text`에서도 가로 스크롤 없음). 토큰은 `styles.css`의 `--primary`, `--line`, `--surface`, `--radius-lg`만 쓴다.
- [ ] **Step 4:** `npm test` → 전체 PASS. 기존 테스트 중 "멘토로 체험하기" 같은 옛 문구를 확인하는 단언은 새 문구("멘토로 바로 들어가기")로 바꾼다. 동작 단언은 바꾸지 않는다.
- [ ] **Step 5: 커밋** `git add public/src/ui/demo-entry.js public/app.js public/index.html public/auth.css tests/demo-entry.test.js tests/demo-entry-app.test.js && git commit -m "feat: 첫 화면을 시연 계정 로그인으로 전환"`

---

### Task 4: 회원가입 화면 (등록하지 않음)

**Files:**
- Create: `public/src/ui/signup-form.js`
- Modify: `public/src/ui/demo-entry.js` (signup / signup-done 화면 연결)
- Modify: `public/auth.css`
- Test: `tests/demo-entry.test.js`, `tests/demo-entry-app.test.js`

**Interfaces:**
- Consumes: `validateSignup`, `normalizeLinkCode`, `SIGNUP_ROLES`, `GANGWON_REGIONS`, `SIGNUP_AGE_BANDS` (Task 2), `entryView`·추천 창 (Task 3)
- Produces:
  - `renderSignupForm(values, errors) → string` — `<form id="signup-form" novalidate>`. 필드 id: `#signup-name`, `#signup-login-id`, `#signup-password`, `#signup-password-confirm`, 역할 선택 버튼 `data-signup-role="learner|mentor|guardian"`(`aria-pressed`, 첫 화면 연령대 버튼과 같은 방식. 고른 값은 `entryView.signupValues.role`에 둔다), `#signup-region`(select), `#signup-age`(select, `data-signup-age`), `#signup-link-code`, `#signup-agree`, `#signup-guardian-agree`. 오류가 있는 칸은 `aria-invalid="true"`와 `aria-describedby="<id>-error"`, 오류 문구 `<p id="<id>-error" class="field-error">`. 값은 `esc()`로 넣는다. 비밀번호 칸에는 값을 넣지 않는다.
  - `readSignupForm(root, role) → form` — 위 id에서 Task 2의 `form` 객체를 만든다. `role`은 `entryView.signupValues.role`(역할 버튼은 입력 칸이 아니라서 따로 넘긴다). 체크박스는 `.checked`.
  - 역할 버튼을 누르면 현재 입력값을 `readSignupForm`으로 읽어 `signupValues`에 담고(비밀번호 제외) 다시 그린다. 보호자를 고르면 연결 코드 칸이 필수로 표시된다.
  - 버튼: 가입 제출 `data-auth-action="signup-submit"`, 로그인으로 `data-auth-action="login-view"`, 가입 완료 화면의 `data-auth-action="login-view"`.

폼 구성과 안내 문구:
- 제목 "배움길 회원가입", 부제 "이름은 가명으로 적어도 괜찮아요."
- 역할: 멘티(학생) / 멘토 / 보호자 (선택 버튼 3개) — **폼의 첫 칸**에 둔다. 역할을 바꾸면 화면을 다시 그리면서 비밀번호 칸이 비워지므로, 비밀번호보다 먼저 고르게 한다. 비밀번호를 입력한 뒤 역할을 바꾸면 "역할을 바꿔서 비밀번호를 다시 입력해 주세요."를 비밀번호 칸 아래에 보여 준다.
- 지역: 강원 18개 시군 + "강원 외 지역"
- 연령대: 4개. 바뀌어서 `senior`이 되면 기존 추천 창(`entryView.recommend = true`)을 띄운다(이미 큰글씨면 띄우지 않음).
- 연결 코드: 라벨 "연결 코드 (보호자는 필수)", 도움말 "멘토·학생·보호자를 서로 연결하는 코드예요. 센터나 멘토에게 받아요. 프로토타입에서는 실제로 연결되지 않아요."
- 동의: "개인정보 수집·이용 동의 (필수)", 연령대가 `under14`일 때만 "보호자 동의 (14세 미만 필수)" 칸 표시
- 하단: [가입하기](primary large), [로그인으로 돌아가기](secondary)

동작:
- 제출(버튼·Enter): `validateSignup(readSignupForm(root))`.
  - 실패 → `entryView.signupValues`에 비밀번호 두 칸을 뺀 값 저장, `signupErrors` 저장, 다시 그린 뒤 첫 오류 칸(`Object.keys(errors)[0]`에 대응하는 id)에 포커스.
  - 성공 → `signupValues`·`signupErrors`를 비우고 `view = 'signup-done'`. **아무것도 저장하지 않는다.**
- 가입 완료 화면: 제목 "가입 신청 화면을 확인했어요", 본문 "프로토타입이라 실제 계정은 만들어지지 않았어요. 시연 계정으로 로그인해 주세요.", 버튼 [로그인 화면으로].
- 로그인 ↔ 가입 전환 시 `loginError`는 비운다. 새로고침하면 로그인 화면부터(entryView는 저장하지 않음).

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/demo-entry.test.js`:
- `signup validation errors keep entered values except passwords and focus the first invalid field` — 가입 화면으로 이동 → 이름만 입력 후 제출 → innerHTML에 `아이디는 영문 소문자와 숫자 4~16자예요.`와 `aria-invalid="true"`, 입력한 이름 값이 남고 비밀번호 칸에 `value=` 없음, 포커스된 요소가 `signup-login-id`.
- `a valid signup only shows the prototype notice and enters nothing` — 유효한 값으로 제출 → `실제 계정은 만들어지지 않았어요` 표시, `onEnter` 호출 0회 → `login-view` → 로그인 폼.
- `choosing 60 or older in signup opens the large text recommendation` — `root.onchange({ target: { dataset: { signupAge: '' }, value: 'senior' } })` → `큰 글씨로 볼까요` 표시, 열린 동안 `data-auth-action="signup-submit"` 클릭이 아무 일도 하지 않음.

`tests/demo-entry-app.test.js`:
- `signup submission stores nothing in either storage` — 앱 boot → 가입 화면 → 필드 값 설정(`h.node('signup-password').value='abc12345'` 등) → 제출 → `h.local`, `h.tab`의 모든 값에 `abc12345`·입력한 이름이 없고 `STORAGE_KEY` 값이 제출 전과 같음.

- [ ] **Step 2:** 해당 테스트만 실행 → FAIL
- [ ] **Step 3:** `signup-form.js` 구현, `demo-entry.js`에서 view별 렌더와 `onclick`/`onsubmit`/`onchange` 연결, `auth.css`에 폼 스타일(라벨은 항상 보이게, 오류는 칸 바로 아래 `--bad` 색, 터치 높이 44px 이상)
- [ ] **Step 4:** `npm test` → 전체 PASS
- [ ] **Step 5: 커밋** `git add public/src/ui/signup-form.js public/src/ui/demo-entry.js public/auth.css tests/demo-entry.test.js tests/demo-entry-app.test.js && git commit -m "feat: 등록하지 않는 회원가입 화면 추가"`

---

### Task 5: 화면 확인과 마무리

**Files:** 코드 변경 없음(발견한 문제만 해당 Task 파일에서 수정)

- [ ] **Step 1:** `npm run dev`(또는 실행 중인 4173 서버)에서 브라우저 확인. PC 폭과 390px 폭, 큰글씨 켠 상태에서 각각:
  - 시연 계정 3개로 로그인 → 멘토·멘티는 과목 선택, 보호자는 학습 소식으로 바로 이동
  - 틀린 비밀번호 오류, Enter 제출
  - 회원가입 오류 표시·포커스, 60세 이상 추천 창, 14세 미만 보호자 동의 칸, 가입 완료 안내
  - 로그아웃 → 로그인 화면
  - 가로 스크롤 없음, 콘솔 오류 없음
- [ ] **Step 2:** 개발자 도구에서 localStorage·sessionStorage에 비밀번호·가입 입력값이 없는지 확인
- [ ] **Step 3:** 확인 중 켠 큰글씨는 끄고 끝낸다(시연 브라우저 상태 보존)
- [ ] **Step 4:** 문제 수정이 있었다면 `npm test` 전체 PASS 후 해당 파일만 커밋

## 발표할 때 주의

- "로그인과 회원가입 흐름을 실제 서비스처럼 설계했고, 프로토타입에서는 시연 계정만 열어 두었다"고 말한다. 보안 인증을 구현했다고 말하지 않는다.
- 실제 서비스 계획: 비밀번호는 서버에서 해시로 저장, 연결 코드는 센터가 발급, 14세 미만은 법정대리인 동의 절차.

# Demo mentor / learner entry implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the approved demo role entry screen to ver2 while retaining all learning and mentoring records when switching roles.

**Architecture:** Keep the existing localStorage learning store. Store only a validated demo role in sessionStorage. A separate entry renderer and demo session helpers coordinate entry/exit; the existing learner and mentor renderers remain the destination screens.

**Tech Stack:** Existing browser ES modules, HTML, CSS and Node test runner; no new dependencies.

**Spec:** User-approved design in this chat, summarized below.

## Approved behavior and constraints

- First visit offers “멘토로 체험하기” and “멘티로 체험하기”, with fictitious profiles and browser-local storage notice. No real authentication or credentials.
- Mentor enters the home screen. Learner with an assignment/path can continue without a compulsory initial assessment; otherwise existing initial assessment/result/waiting UI is used.
- Header identifies the current profile/role. “역할 바꾸기” returns to entry without deleting records. Reset remains separate and confirmed.
- Refresh retains the role in the same tab. A fresh tab with no entry state starts at entry. Browser-duplicated tabs may inherit sessionStorage; this is not an authentication boundary.
- Leaving stops learner timing, aborts and invalidates pending AI responses, preserves log drafts in memory and warns before discarding unsaved session-form inputs.
- Existing work and unrelated changes must be preserved. If overlapping work appears, stop and wait as requested.

## Coordination and rulings

- 2026-10-24: App chat “기획서 검토 및 배움길 설계” reports completed/idle. Initial assessment is present in HEAD `ebb4054`.
- Existing uncommitted edits: exam images, exam-bank.json, build-exam-bank.mjs and trim_exam_question_images.py. These are outside this plan's write scope.
- Ruling: work directly in the requested ver2 checkout and avoid commits/merges while unrelated work is present. Check target-file changes before edits and review only this feature's diff.
- Ruling: the approved design and explicit implementation request authorize continuous inline execution; no second design approval is needed.

## Review focus

- Entry/exit must never invoke learning reset or replace the shared learner identity.
- An existing assignment must remain reachable without taking the initial assessment.
- Time on the entry screen or mentor screen must not count as learner solving time.
- A response arriving after exit must not save an AI artifact or replace the entry screen.
- Canceling a dirty-form exit prompt must leave the current role/form untouched; successful exit retains saved logs and in-memory draft content.

## Task 1: Demo session and entry UI

Files: create `apps/baeumgil/public/src/state/demo-session.js`, `apps/baeumgil/public/src/ui/demo-entry.js`, `apps/baeumgil/tests/demo-entry.test.js`.

Interfaces: `createDemoSession(storage)` exposes `role`, `persistent`, `enter(role)` and `leave()`; `prepareDemoRole(ui, state, role)` configures destination UI; `cancelPendingDemoAI(ui)` aborts and invalidates pending request slots; `renderDemoEntry({root,state,onEnter,persistent})` renders the two entry choices.

- [x] Write/run failing tests for role restoration, fresh-tab behavior, invalid/corrupt storage, blocked storage, preservation of learning data and drafts, learner destination and entry choice actions.
- [x] Implement the helpers/rendering and rerun targeted tests.

## Task 2: Integrate entry/exit and visual styling

Files: modify `apps/baeumgil/public/app.js`, `apps/baeumgil/public/index.html`, `apps/baeumgil/public/styles.css`; add integration tests to `apps/baeumgil/tests/demo-entry.test.js` or a separate focused test file as needed.

- [x] Test actual app bootstrap/role actions with persisted records, dirty session-form cancellation and timing, plus pending AI invalidation.
- [x] Replace the persistent global role toggle with entry state/current profile/return-to-entry controls. Keep all local learning records and initial-assessment APIs unchanged.
- [x] Preserve in-memory log drafts; guard unsaved session-form changes. Keep recovery and reset available and separate.
- [x] Apply existing teal/amber tokens, semantic buttons, visible focus and stacked mobile role cards.

## Task 3: Verify and document

Files: update `apps/baeumgil/README.md` with the demo entry behavior; this plan records verification outcomes.

- [x] Run `npm test`, `npm run check:content`, and scoped whitespace checks. Report any pre-existing failures from other work.
- [x] Use a separate local preview origin to verify entry → mentor assignment → learner response → role change → mentor record, refresh restoration, entry exit, and draft retention. Verify narrow layout.
- [x] Recheck other-session/target-file conflicts and get a read-only review scoped to this feature.

## Execution record

- Planning: complete. No overlapping target-file edits observed before implementation.

### Verification and coordination update

- Implemented demo entry, role session, data-preserving role exit, pending AI invalidation, unsaved session form guard, responsive styling and usage documentation.
- Before concurrent initial-assessment changes: full suite passed 152/152 tests; content check passed; scoped git diff --check passed. Independent read-only review found no actionable issues and independently passed 13 focused tests.
- Browser QA on dedicated origin http://127.0.0.1:13918: entry → mentor assignment → learner submission → reload → mentor showed 1/1 correct; saved session and edited log draft survived leaving/re-entering. Mobile cards stacked and DOM width equaled scroll width. Native confirm dialog was not reliably observable through the browser controller; cancel/accept behavior is covered by integration tests.
- WAITING as requested by user: at final coordination check, another worker changed learning/initial-assessment.js, learning/diagnostic.js, state/store.js and then ui/initial-assessment.js. A fresh tab initially failed with missing initialQuestions export while that integration was in progress. HEAD also advanced to 69b19d8 for unrelated exam fixes.
- No attempt was made to overwrite or repair the other worker's in-progress changes. Earlier successful tests do NOT certify this evolving combined working tree. No commit or merge was performed.
- Remaining after the other worker finishes: reconcile integration/README if needed, rerun full suite and fresh-browser entry flow including fresh-tab behavior, and recheck target-file conflicts. Feature implementation is present, final integration acceptance is pending.

### Final integration verification — 2026-10-24

- Resumed at user request after the other worker committed adaptive assessment integration as 54bb715. Related chat is idle; no outstanding changes remain in the other worker's diagnostic/store/UI files. HEAD stayed at 54bb715 throughout verification.
- Corrected entry guidance to use the same assessment summary as the learner UI: legacy version-1 records remain stored but no longer produce a misleading waiting-for-mentor caption. Regression test failed before the fix and passed after it. Updated README to describe six domains, 12–30 questions and the early handoff demo flow.
- Added a real-catalog app integration test covering adaptive response → role changes → same-tab refresh → partial-result handoff → mentor assignment → learner practice; assessment data stays unchanged across entry/exit and refresh.
- Final full suite: 160 tests passed (15 entry/role-focused tests). Content validation passed, no content errors. git diff --check passed.
- Fresh browser on isolated port 13919: entry loads without the former missing-export error; one diagnostic response survives leaving and refreshing; second question resumes; partial results reach mentor; mentor assignment opens directly for learner; submitted answer appears as 1/1 correct on mentor screen. New tab starts at entry while first tab remains mentor. No browser console errors observed. Mobile cards stack with scrollWidth = clientWidth = 375.
- Existing focused tests continue to verify preserved confirmed logs/session records and in-memory drafts, dirty-form cancel/accept, excluded entry/mentor solving time and late AI response invalidation. Browser dialog cancellation remains covered by integration tests rather than a reliable native-dialog automation check.
- Saved visual evidence outside the repository in the task visualization directory: demo-entry-final.png. No commit, push or merge performed. Earlier WAITING status is resolved.
- Final independent read-only review against 54bb715 found no actionable issues and independently reran all 15 entry-focused tests successfully; integration accepted.

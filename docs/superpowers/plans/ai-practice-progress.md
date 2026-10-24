# SDD ledger — plan: docs/superpowers/plans/2026-10-24-ai-supplementary-practice.md

- Baseline: ver2 7846f70, 208/208 tests passed with local socket access. Other visible chats inactive; six existing modified files preserved.
- Ruling: work in the user's requested ver2 checkout, retain uncommitted LAN/HTTP fixes, no commit/push — requested integration needs these changes; cost if concurrent edits resume: pause before shared-file edits.
- Pre-flight: validator produces canonical question/spec used by server, persistence, controller; same shared module and version required.
- Pre-flight: controller uses registered evidence only and separate AI state; initial diagnosis and regular paths remain unchanged.
- Pre-flight: mentor results read the same browser records; no cross-device claim.
- Tasks: 1 math; 2 transport/API; 3 state/recovery; 4 controller/UI/mentor; 5 full integration/browser/live checks.

- Task 1: complete — exact algebra, option equivalence and concept bounds; new tests RED→GREEN.
- Task 2: complete — shared Gemini transport preserves old contracts; new API echoes context, same-origin gate, 5s deadline and 4 slots; HTTP/provider tests passed.
- Task 3: complete — separate snapshots/drafts/exposures, idempotent answers, partial recovery and revision conflicts; persistence tests passed.
- Task 4: implemented — all roadmap entry points share controller; mentor home/learning/planning show separate AI results. Full app test verifies refresh, role switch, delayed result cancellation. Final UI/live verification underway.
- Live first sample (10 synthetic requests): 3 accepted / 7 rejected or timed out. Inspection found variable extra fields and out-of-range option factors. Kept validator strict; strengthened prompt with full bounded example (new prompt test RED→GREEN).

- Ruling: constrain the model's generation schema to a small positive-coefficient subset of the approved integer AST grammar — live free JSON frequently exceeded option bounds; cost: not all valid signed expression structures are generated in this pilot. Exact independent validator remains unchanged.
- Final: fixed historical-record status restriction — 'resuming a paused diagnosis preserves historical AI practice and allows saving answers' RED→GREEN.
- Final: fixed malformed evidence recovery — focused null-evidence test RED→GREEN, retained diagnosis.
- Final: fixed help flag carried across navigation — focused help flag test RED→GREEN; graded Important because it changes recorded assistance, not only appearance.
- Task 5: complete — 224/224 full tests; content 362 assignable, zero errors; diff check clean. Live measured 7/10 accepted (like terms 2/5, linear sums 5/5), 2 timeouts, 1 rejection; data in docs/baeumgil/ai-practice-live-check.json.
- Browser: both concepts live generation→submission→explanation→reload passed; draft choice restored; mentor saw two submitted questions with evidence and reached lesson planning. LAN HTTP started diagnosis, used fallback, saved answer, reloaded and switched roles successfully.
- Deployment: verified old PID20916 was `node --env-file-if-exists=.env server.mjs --lan`; restarted only that demo process on 4173 with same command. LAN health200 and practice route400 on intentionally invalid input prove new route is active. No browser records cleared.
- Other related visible thread remained inactive at final check. Existing dirty LAN/ID changes retained. No commit/push by plan constraint.
- Final: no deferred reviewer findings. Teacher feedback remains a human evidence collection task, not a completed product evaluation.
- Commit handoff: user authorized a ver2 commit of the integrated AI practice feature. Re-ran 224/224 tests and content validation (362 assignable, zero errors); related LAN/HTTP fixes and implementation/verification documents are included. No remote push requested.

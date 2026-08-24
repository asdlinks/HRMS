# Framework Technical Debt Register (v1.0)

Compiled from a full audit of `e2e/pages`, `e2e/helpers`, `e2e/fixtures`,
`e2e/tests` (auth/fixture architecture, duplicated logic, synchronization
anti-patterns, locator quality, test-data collision/exhaustion risk), plus
live verification runs against the shared dev tenant. Items already fixed in
this pass are marked done and kept here for traceability, not as open work.

---

## Critical

### C1 — Fixed personas' leave balance / attendance history has no reset mechanism
**Description:** `employeeSelf`/`manager` are real, persistent tenant accounts. Every test that applies/cancels a leave or checks in *as* one of them permanently consumes a slice of a finite yearly allocation or a once-per-calendar-day slot. There is no data-reset utility anywhere in the framework, and none can be built purely inside Playwright — an app-side reset endpoint (out of scope: "no application code") or an out-of-band DB script is required.
**Impact:** Confirmed live this session — repeated Leave-suite runs exhausted `employeeSelf`'s Casual allocation, producing `400 Insufficient leave balance`/`409 overlap` failures on tests that have nothing wrong with their logic. This will recur for **every** future module that mutates state as a fixed persona, and gets worse the more modules are added.
**Recommendation:** Either (a) get application support for a test-only, env-gated reset endpoint, or (b) migrate balance/date-sensitive mutating tests to use `withTemporaryLeaveType()`-style temporary, generously-allocated resources instead of the shared 'Casual' bucket — the mechanism already exists in `helpers/leave.ts`, it's just not applied to the call sites that need it (`leave-cancellation.spec.ts`, `leave-list-approval.spec.ts`, `leave-permissions.spec.ts`, `leave-attendance-integration.spec.ts`). (c) is a documentation-only mitigation: none of these are a framework-code fix within this task's constraints.
**Estimated effort:** App-side reset endpoint: 1-2 days (app team). Retrofit affected spec files to a dedicated allocation: 0.5-1 day.

### C2 — No fixture for authenticating as a dynamically created user
**Description:** Every persona fixture is a pre-provisioned, credentialed account read from `.env.e2e`. There's no way to create an employee via `createEmployee()` and then act *as* that employee — every "self-service" test is forced onto one of five fixed accounts.
**Impact:** This is the root cause behind C1 (self-service tests can't use disposable employees) and will block any future module whose test plan needs "a fresh user does X to their own record" at any scale beyond what 1-2 shared accounts can absorb.
**Recommendation:** Extend the auth layer (note: `AuthenticationManager`'s *architecture* is explicitly out of scope for this pass) with a capability to log in as a just-created employee using its known password — likely a thin addition alongside the existing persona path, not a redesign. Flagging here as the highest-leverage unblock for C1; actually implementing it needs a deliberate, reviewed change to the auth layer, not a drive-by fix.
**Estimated effort:** 1-2 days, requires sign-off since it touches the auth layer.

### C3 — Tenant RBAC state for `admin` is inconsistent across time (shifts.manage / attendance.policies.manage)
**Description:** Confirmed live: in one verification run, `admin` held `shifts.manage`/`attendance.policies.manage` (their New Shift/New Policy buttons rendered); in a later run minutes apart, they didn't, and every dependent test either correctly self-skipped (`ATE-SM-04`, `ATE-SM-06`, which each independently guard with `skipUnlessVisible`) or hard-failed with a 15s timeout (`ATE-PS-11/12-13`, `ATE-NG-11`, `ATE-PS-17/18/19`, `ATE-RG-05` — none of which re-check the guard, they assume an earlier test in the same file already created what they need).
**Impact:** This makes `shifts.spec.ts`/`attendance-policies.spec.ts` non-deterministically pass or fail-as-a-block depending on tenant RBAC state at run time, independent of any code change — confirmed NOT caused by this pass's refactor (see Phase 3/4 verification notes below).
**Recommendation:** Two independent fixes: (1) investigate why `admin`'s effective permissions fluctuate in this tenant — likely a session/JWT staleness or role-assignment issue outside this framework's control, needs app-side investigation; (2) regardless of (1), every test in a file that depends on a permission-gated resource created earlier in that file should carry its own `skipUnlessVisible`-style guard, not rely transitively on an earlier test's guard already having run — a pure framework fix, deferred to High below (H1).
**Estimated effort:** App-side investigation: unknown, needs a look by whoever owns tenant RBAC seeding. Framework-side guard hardening: 0.5 day (see H1).

---

### C4 — Session-expiry handling is fail-fast, not self-healing
**Description:** The Payroll Framework Stabilization pass added `assertSessionActive()`/`installSessionExpiryDetector()` (`helpers/sessionGuard.ts`) so a persona session going stale *mid-test* (PR-VD-04/PR-AP-03/PR-FN-01's actual root cause — see FRAMEWORK_GUIDELINES.md) now fails immediately with a clear `SessionExpiredError` instead of a 15s locator timeout. It does not attempt to recover: no re-login, no retry of the navigation. `AuthenticationManager.resolveState()` already validates/refreshes the cached session once, at the *start* of each test — the gap is any navigation *later in that same test*, if the underlying refresh-token cookie is invalidated in between (plausibly a single-use-rotation race between `AuthenticationManager`'s own scratch refresh call and the app's own client-side refresh-on-mount — unconfirmed, would need app-side investigation to pin down, and either way is application session behavior, out of scope for a framework-only pass).
**Impact:** A test that legitimately needs several `goto()`s will now fail clearly, and fast, instead of confusingly — a real improvement — but still fails. Whatever is actually invalidating the session mid-run will keep recurring until either the app-side mechanism is understood, or the framework grows an automatic re-login-and-retry path.
**Recommendation:** (a) App-side: investigate whether refresh-token rotation can race itself when two refresh calls overlap (AuthenticationManager's own validation call + the app's own mount-time refresh). (b) Framework-side: extend `usePersonaPage()` to catch a `SessionExpiredError`, re-login via `AuthenticationManager`, and retry the failed test step once — bigger than this pass's scope (needs the persona/authManager threaded down to wherever the error is caught, not just a `Page`), flagged here rather than built speculatively.
**Estimated effort:** App-side investigation: unknown. Framework-side auto-recovery: 1-2 days, needs design review (see C2 — the same "thread auth context past the page object" shape).

### C5 — Employees/Payroll DataGrid dataset growth is mitigated locally, not solved
**Description:** The Payroll suite's shared dev tenant had grown to 365 employees (184 created that month alone) by the time of the Stabilization pass — confirmed via a failure screenshot, not an estimate — pushing `EmployeesPage.clickAddEmployee()` and several DataGrid row/button actions past the 15s action timeout purely from client-side render cost (network activity for the same page settled in ~2s; the button/row took 10-14s longer to actually appear, several times not resolving at all within 15s). This pass raised the specific, evidenced call sites' timeouts to a local 30s (see FRAMEWORK_GUIDELINES.md's Cleanup strategy addendum) — a mitigation, not a fix, and every disposable record this framework creates is intentionally never deleted (see Cleanup strategy above).
**Impact:** The growth rate is roughly one employee per Payroll test that needs one (correctly — each needs its own isolated actor; auditing this pass's own test bodies found no incidental duplicate creation to trim without changing what a test asserts). The dataset will keep growing every run, and 30s is headroom, not a ceiling — this will eventually need addressing again.
**Recommendation:** Considered and deliberately NOT done this pass: retrofitting a shared/pooled employee into existing tests. Several of the currently-failing tests' own assertions depend on a genuinely fresh, isolated employee (assignment-history counts, a clean payroll-run line, exactly-one-open-assignment checks) — reusing a pooled employee across them would silently change what they test, which this pass's constraints (no reduced coverage, no test semantics changes) rule out. If growth becomes unmanageable again: (a) get application support for a test-only reset/delete endpoint (mirrors C1's recommendation for leave/attendance state), or (b) a *new* module test that genuinely doesn't care which employee it acts on (e.g. a pure UI-rendering check) can adopt a per-worker-slot cached/reused employee going forward — but that's an opt-in pattern for new tests, not a retrofit of existing ones.
**Estimated effort:** App-side reset endpoint: 1-2 days (app team). Framework-side opt-in pooled-employee helper for new tests: 0.5 day, only worth building when a concrete new test actually needs it.

---

## High

### H1 — Downstream tests don't independently guard permission-gated setup
**Description:** `shifts.spec.ts`/`attendance-policies.spec.ts` (and possibly others) have exactly one `skipUnlessVisible` guard, on the first test in the file — every later test assumes that one succeeded and skips its own check.
**Impact:** As seen in C3, when the guarded permission is transiently absent, the first test skips cleanly but every later test hard-fails with a 15s timeout instead of also skipping — a much worse failure signature (looks like a bug, isn't) and wastes ~15s per test instead of failing fast.
**Recommendation:** Either guard every test independently, or hoist the check into a `beforeEach`/fixture-level skip for the whole file so one missing permission produces one clear skip message, not N confusing timeouts.
**Estimated effort:** 0.5 day across the 2-3 affected files; establish as a required pattern in `FRAMEWORK_GUIDELINES.md` (done) for new modules going forward.

### H2 — No way to read back a created record's numeric id
**Description:** `createEmployee()` returns the `uniqueEmployee()` record (name/email/etc.) but never the server-assigned id — there's no API/DOM read-back anywhere in the helper.
**Impact:** Any future module needing to navigate directly to a created record (`EmployeeProfilePage.goto(userId)`-style) has no path to the id from the shared helper and will either duplicate a lookup-by-name flow or invent a local workaround.
**Recommendation:** Extend `createEmployee()` to capture the id from the create response (or a subsequent lookup) and return it alongside the existing fields — additive, backward-compatible (existing callers destructuring only the fields they use are unaffected).
**Estimated effort:** 0.5 day.

### H3 — `helpers/seed.ts` is Employee/Attendance-suite-named but used broadly, and the duplication it was meant to eliminate still exists elsewhere
**Description:** Despite the file's own docstring framing it as motivated by 4+ Employee-suite spec files (`password-reset-unlock.spec.ts`, `pii-banking.spec.ts`, `role-assignment.spec.ts`, `status-lifecycle.spec.ts`), those files still have their own local `createPlainEmployee()`/`createEmployeeAsAdmin()` copies rather than importing from `helpers/seed.ts`.
**Impact:** The exact duplication this file exists to prevent is still present in 5 spec files; a future author has two "correct-looking" patterns to copy from, and will likely pick whichever file they saw last.
**Recommendation:** Migrate those 5 files to `helpers/seed.ts`'s `createEmployee()`, or rename/re-scope the file (e.g. `helpers/employees.ts`) if there's a real reason the Employee-suite copies can't converge (e.g. a subtly different field set) — audit each one to find out which.
**Estimated effort:** 1 day (5 files, mostly mechanical, but needs care that each local variant's specific field overrides aren't lost).

### H4 — Midnight-crossing risk in `createEmployeeWithProbationState`
**Description:** `today = new Date()` is captured once at helper-invocation time; the actual probation-active assertion happens several network round trips later. A local-midnight crossing between those two moments flips `isProbationActive()`'s exclusive boundary.
**Impact:** Narrow window, low real-world probability (a full apply-leave flow takes seconds, not the minutes needed to straddle midnight) — but not zero, and would produce a confusing, hard-to-reproduce failure in `LV-NG-03`/`LV-NG-04`/`LV-BD-06` if it ever hits.
**Recommendation:** Deliberately not fixed in this pass — padding the boundary would break `LV-BD-06`'s exact-boundary assertion, which needs the precision as-is. Any fix must be tenant/test-specific, not a blind buffer; flagged for whoever owns the Leave suite's probation tests to decide the right trade-off.
**Estimated effort:** 0.5 day design discussion + 0.5 day implementation, only if this ever actually reproduces in CI.

### H5 — Cross-file shared-settings mutation race (documented, not eliminated)
**Description:** `leave-balance.spec.ts`, `leave-probation.spec.ts`, `leave-settings.spec.ts` all mutate the tenant-wide `settings.leave_allocations` blob via a full-replace write. Each file's own `.describe.serial()` prevents a race *within* itself; nothing prevents one across files if they ever run concurrently (`fullyParallel: true` shards by file across workers).
**Impact:** Currently mitigated by luck (worker count vs. file count) more than by design. A future module that also touches `settings` widens the blast radius.
**Recommendation:** Either serialize these three files against each other explicitly (a custom fixture-level lock, or Playwright's `test.describe.configure({ mode: 'serial' })` scoped project-wide for settings-touching files), or — better — get application support for a scoped read-modify-write (PATCH a single key) instead of a full-blob replace.
**Estimated effort:** Framework-side lock: 1 day. App-side scoped write: app team's call.

---

## Medium

### M1 — Remaining non-retrying `.isVisible()`/`.count()`/`.textContent()` call sites
**Description:** This pass fixed every HIGH-severity occurrence (`EmployeeFormDialog`, `AttendanceSettingsPanel`, `AttendancePage`, `LeavesPage`, `EmployeesPage.filterByFirstOption`, `AttendancePoliciesPage.assignedCount`) and the option-render races in `LeavesPage`/`LeaveCancellationPage`. Remaining MEDIUM/LOW findings (`AttendanceCard.ts`'s 5 calls inside `isNotRecordedViewVisible()` — already softened by an `expect.poll()` wrapper at the call site; `status-lifecycle.spec.ts`, `employee-list.spec.ts`, `organization-structure.spec.ts` test-file-level instant checks) were deliberately left — fixing test-file logic in the same pass as framework infrastructure changes was judged higher-risk than the marginal flakiness reduction, and none of these were confirmed to be causing live failures.
**Impact:** Low-probability flakiness, same class as the fixed HIGH items but with less exposure (later in a flow, or already softened by `expect.poll`).
**Recommendation:** Sweep these in a dedicated follow-up pass, one file at a time, each verified with its own test run — not bundled into a large multi-file change.
**Estimated effort:** 1 day.

### M2 — `LeavesPage.ts` uses getters for almost every locator; every other page object uses constructor fields
**Description:** Documented in `FRAMEWORK_GUIDELINES.md` as the accepted convention (constructor fields) with `LeavesPage.ts` as the one pre-existing exception.
**Impact:** Purely a consistency/onboarding-friction issue — a new author reading `LeavesPage.ts` first could copy the getter style into a new module.
**Recommendation:** Leave as-is; not worth the churn/regression-risk of rewriting a heavily-tested, working file purely for style. Guidelines doc now steers new code away from copying it.
**Estimated effort:** N/A (accepted, not scheduled).

### M3 — Inconsistent page-object suffix convention (`*Page`/`*Tab`/`*Panel`/`*Card`/`*Dialog`)
**Description:** Five different suffixes across 16 files, mapped to UI shape rather than one documented scheme.
**Impact:** A new author has no single rule to follow when naming a new module's page object files.
**Recommendation:** `FRAMEWORK_GUIDELINES.md` now documents the existing de facto mapping (routable page / embedded sub-tab / settings sub-section / card widget / dialog) — accept it as the standard rather than renaming 16 existing files.
**Estimated effort:** N/A (documented, not renamed).

### M4 — Inconsistent method naming for the same "delete row" action (`deleteItem`/`deleteDepartment`/`deleteShift`/`openDelete`)
**Description:** Four CRUD-list page objects name the identical action differently; one (`AttendancePoliciesPage.openDelete`) is semantically distinct (opens a confirmation, doesn't complete the delete) and correctly named — the other three aren't inconsistent with each other for a good reason, just historical.
**Impact:** Minor discoverability friction only.
**Recommendation:** Not renamed in this pass (pure rename churn across call sites for no behavior change, non-trivial regression risk for a naming preference). Guidelines doc directs new code to name this action `deleteItem` unless it's genuinely a two-step open-then-confirm flow.
**Estimated effort:** 0.5 day if ever prioritized; low value.

### M5 — Inconsistent `errorText()`/`expectDialogClosed()` surface across near-identical CRUD page objects
**Description:** `BranchTab`/`DepartmentsPage`/`LookupTab` lack an `errorText()` helper that `AttendancePoliciesPage`/`EmployeeFormDialog`/`ShiftsPage` have; `DepartmentsPage`/`ShiftsPage`/`AttendancePoliciesPage` lack `expectDialogClosed()` that `BranchTab`/`LookupTab` have.
**Impact:** A spec needing either has to reach past the page object into a raw `page.getByText(...)` for exactly the files missing it.
**Recommendation:** Add both to every CRUD-list page object for consistency — small, additive, zero regression risk.
**Estimated effort:** 0.5 day.

### M6 — `AttendanceCard.ts` mixes navigation/action/business-rule/assertion concerns more than any other page object
**Description:** Combines locators, actions, embedded domain-rule interpretation (`isAlreadyCheckedInToday()`), and multiple `expect*()` assertion methods in one class.
**Impact:** Harder to extend/test in isolation than the rest of the suite's page objects; not currently causing failures.
**Recommendation:** Not restructured in this pass — real behavior, well-tested, and splitting it is a larger, riskier change than this task's scope justifies. Flagged for a dedicated refactor if the Attendance suite grows further.
**Estimated effort:** 1-2 days if undertaken.

### M7 — `LookupTab`'s dialog-title regex doesn't escape `entityLabel`
**Description:** `new RegExp(\`(New|Edit) ${entityLabel}\`)` — same class of bug as the `listItem` issue fixed this pass, just not yet triggered because no caller passes an `entityLabel` containing regex metacharacters.
**Impact:** Latent, not currently reachable given the only two callers (`'Designation'`, `'Employment Type'`).
**Recommendation:** Wrap with `escapeRegex()` for defense-in-depth — trivial, zero risk.
**Estimated effort:** 5 minutes; bundle into the M1 follow-up sweep.

---

## Low

### L1 — Positional (`nth()`, no accessible name) Edit/Delete buttons in `AttendancePoliciesPage`
**Description:** Edit/Delete are selected by fixed render order (`nth(1)`/`nth(2)`), not by name — the least resilient locator pattern in the framework, because the app itself gives Edit/Delete no Tooltip/title (Assign does).
**Impact:** A future reordering of the actions cell in the app would silently break this without any accessible-name mismatch to signal it.
**Recommendation:** This needs an application-side fix (add a Tooltip/aria-label to Edit/Delete) — out of scope for a framework-only pass. Documented here so it isn't mistaken for something the framework can solve alone.
**Estimated effort:** App-side: trivial. Framework-side: none possible until the app changes.

### L2 — Raw XPath in two files, two different axes, no shared convention
**Description:** `AttendanceSettingsPanel.ts` (`following-sibling::*[2]`) and `LeaveSettingsPanel.ts` (`ancestor::*[3]`) — each justified locally, no documented "when XPath is the right call" rule before this pass.
**Impact:** A third author facing a similar gap has no guidance beyond "grep for an example."
**Recommendation:** `FRAMEWORK_GUIDELINES.md` now documents structural fallbacks (including XPath) as priority-3, requiring a justifying comment — sufficient guidance without forcing a rewrite of either working file.
**Estimated effort:** N/A (documented).

### L3 — `EmployeesPage.employeeLimitBanner` and `LeaveCancellationPage.inlineAlert` are correctly NOT part of the shared `Toast` component
**Description:** Not debt — recorded so a future refactor doesn't "fix" this by incorrectly merging them into `Toast`. Both are persistent/inline `role="alert"` elements, a different UI primitive from a transient Snackbar.
**Impact:** None if left alone; risk is a future well-meaning consolidation pass breaking the distinction.
**Recommendation:** No action. `Toast.ts`'s own doc comment and `FRAMEWORK_GUIDELINES.md`'s Shared Components table both call this out explicitly.

---

## Fixed in this pass (for traceability)

- Popup handling centralized (`AppShellPopup.dismissIfPresent`/`installAppShellPopupAutoDismiss`, wired once into `fixtures/auth.ts`).
- `LeaveSettingsPanel.goto()` / `AttendanceSettingsPanel.goto()` race → bounded `waitFor`.
- `EmployeeFormDialog.isIdentitySectionVisible()`/`isBankingSectionVisible()`, `AttendancePage.isViewingForSelectorVisible()`, `LeavesPage.isTargetEmployeeFieldVisible()`/`isActionsColumnVisible()` → bounded `waitFor`.
- `EmployeesPage.filterByFirstOption()`, `AttendancePage.selectViewingForFirstOption()` → added a visibility wait before reading `.textContent()`.
- `AttendancePoliciesPage.assignedCount()` → added a visibility wait before reading `.textContent()`.
- `LeavesPage.flexiHolidayOptionCount()` / `LeaveCancellationPage.optionCount()` → bounded settle-wait before `.count()`.
- `escapeRegex` centralized (`helpers/locators.ts`); fixed a real, previously-shipped bug in `BranchTab`/`DepartmentsPage`/`LookupTab` (unescaped name interpolated into `RegExp`).
- `itemByName`, `soleButtonIn`, `selectByLabelText`, `rowByCellText` centralized; retrofitted into `BranchTab`, `DepartmentsPage`, `LookupTab`, `ShiftsPage`, `EmployeesPage`, `AttendancePoliciesPage`, `LeavesPage`, `LeaveCancellationPage`, `EmployeeFormDialog`.
- `Toast` component centralized; retrofitted into `LeavesPage`, `LeaveSettingsPanel`, `helpers/seed.ts`, `helpers/leave.ts`.
- `toIso()` de-duplicated (`helpers/leave.ts` now imports from `fixtures/leave-data.ts`).
- `uniqueSuffix()` — fixed cross-worker collision risk (`process.pid` appended).
- `uniquePan()` — fixed float-precision collision risk (bounded string hash instead of `Number()`).
- `uniqueWeekdayRange()` — fixed the deterministic Monday+6=Sunday collision (confirmed live, was actively breaking `LV-NG-18`); added per-call jitter spread for tight-loop callers.
- `pastWeekdayDate()` — added jitter to stop a deterministic same-day-rerun self-collision against fixed personas (was actively breaking `LV-FN-19` on reruns).

All of the above were verified via `npm run e2e:typecheck` (clean) and multiple live Playwright runs; every genuinely new failure surfaced during verification was traced to a pre-existing cause (tenant RBAC state, application-level uniqueness/boundary gaps, or fixed-persona balance exhaustion — see C1/C3) and none to this pass's code changes.

## Fixed in the Payroll Framework Stabilization pass (for traceability)

- `helpers/sessionGuard.ts` (new) — `assertSessionActive()`/`installSessionExpiryDetector()`, wired into every Payroll page object's `goto()` (10 files) plus `EmployeesPage.ts`, and installed once per persona context in `fixtures/auth.ts`. Turns a stale-session-mid-suite symptom (confirmed live: PR-VD-04/PR-AP-03/PR-FN-01 all showed a 401 + the login screen behind a generic 15s locator timeout) into an immediate, clearly-labeled `SessionExpiredError`. See C4 for the residual (non-self-healing) gap.
- `helpers/networkResilience.ts` (new) — `installTransientRequestRetries()`, installed once per persona context. Bounded (3 attempts), logged retries for a genuine transport-level failure only (`ECONNRESET`/`socket hang up`/`ECONNREFUSED`) — confirmed live: PR-BD-03 failed on a raw `read ECONNRESET` calling `GET /api/users`. Cannot retry an actual HTTP response (400/401/403/404/409) even by accident — Playwright never throws for those.
- `EmployeesPage.clickAddEmployee()`, `PayrollComponentsPage.openAdd()/openEdit()/openDelete()`, `PayrollStructuresPage.openAdd()`, `PayrollAssignmentsPage.search()`, `PayrollRunDetailPage.openLine()` — local `{ timeout: 30_000 }` overrides, each backed by trace evidence of a 10-14s (sometimes 15s+) client-side render stall with zero concurrent network activity. Global `actionTimeout` untouched. See C5 for the underlying, not-fully-solved growth driver.
- `pages/components/Toast.ts` — `locator()` scoped to `role="alert"` (filtered by message, `.last()`), NOT the `#notistack-snackbar` id this entry originally said — see the correction below. Confirmed live: PR-FN-14's `expectVisible(/cancel/i)` was a 5-way strict-mode violation (a status Chip, the toast, a dialog heading, and 2 buttons all contain "cancel" on that page) — fixed once, at the shared component, rather than patching that one call site's regex. No spec file changed.
- `auth/types.ts` — added `SessionExpiredError`, distinct from the existing `AuthenticationError`, so a log/CI failure can tell "login itself failed" apart from "a session that logged in fine went stale mid-test" at a glance.

### Correction, found during the live validation run itself

The first version of this pass scoped `Toast.locator()` to `#notistack-snackbar`, based on one confirmed-live screenshot (the "Run canceld" toast). The first full-suite validation run immediately falsified that as a universal anchor: the "Employee added" success toast has no such id at all, only `role="alert"` — sending every `createEmployee()` call (i.e. most of the Payroll suite) into a spurious `element(s) not found` failure and dropping the pass count from 79 to 53. Re-scoped to `getByRole('alert').filter({ hasText: message }).last()`, confirmed against the actual aria snapshot this time (not one sample), which fixed it without reintroducing the original PR-FN-14 ambiguity (none of that violation's other 4 matches carry `role="alert"`).

That same validation run also surfaced a second, related gap: `Toast.expectVisible()` and one DataGrid row-visibility assertion (`payroll-overtime.spec.ts` PR-FN-17) were using Playwright's default 5000ms `expect` timeout, too tight under the same shared-tenant load already documented above for the 15s→30s action-timeout overrides. Both given the same kind of local, scoped override (`Toast.expectVisible(message, timeout = 15_000)`; one `{ timeout: 15_000 }` added directly at the evidenced spec assertion).

**Lesson recorded for future passes:** one screenshot/one confirmed-live trace is not sufficient evidence that a DOM anchor is *universal* across every message/variant a shared component serves — verify against more than one call site before trusting it, and validate framework changes with a real full-suite run before calling them done.

### New finding (out of scope for this pass): `uniquePayrollPeriod()` can still collide across separate suite runs

The final validation run hit `Error: Failed to create payroll run via API for 11/6090: 409 {"error":"A payroll run for 11/6090 already exists"}` (PR-AP-04, payroll-runs-lifecycle.spec.ts). `fixtures/payroll-data.ts`'s `uniquePayrollPeriod()` picks from ~60,000 (year, month) pairs per its own doc comment — collision-free *within* one run, but `payroll_runs` rows are never deleted (this document's Cleanup strategy section), so the pool of already-used pairs only grows across every run this suite has ever had. Given enough accumulated runs, a hash collision with a previously-used period becomes possible — the same accumulation-driven class of risk as C5, just for `payroll_runs` instead of `employees`. Not fixed in this pass (auth/session/timeout hardening was the scope, not test-data generation math); flagged here for whoever next touches `fixtures/payroll-data.ts`.

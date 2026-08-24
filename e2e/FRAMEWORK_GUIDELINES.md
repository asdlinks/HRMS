# Playwright Framework Guidelines (v1.0)

Onboarding reference for anyone automating a new HRMS module in this suite. If
something here conflicts with a specific file's own doc comment, the file
wins for that file — but new code should follow this document, not the
oldest example you happen to find.

---

## Architecture

### Folder structure

```
e2e/
  auth/                  AuthenticationManager + its types — the ONLY place
                         login/session logic lives. Never touch from a spec
                         or a page object.
  config/                auth.config.ts — every configurable auth value
                         (endpoints, timeouts, retries). Add new knobs here,
                         not as literals in AuthenticationManager.
  fixtures/              Playwright fixture wiring (auth.ts) + pure data
                         generators (test-data.ts, leave-data.ts,
                         attendance-data.ts) + persona credential loading
                         (personas.ts). No page interaction code belongs here.
  helpers/               Reusable "arrange" flows that DO touch pages
                         (seed.ts, leave.ts) + cross-cutting utilities
                         (guards.ts, locators.ts). This is where a new
                         module's own "arrange" helpers should live if they
                         don't fit an existing file's scope — create
                         helpers/<module>.ts, don't bolt onto seed.ts/leave.ts.
  pages/                 Page Object Model, one class per routable page or
                         embedded widget.
  pages/components/      Page Objects for UI that isn't a full page — appears
                         inside multiple modules' pages (AppShellPopup.ts,
                         ConfirmDialog.ts, Toast.ts). A new cross-module
                         widget belongs here, not duplicated per module.
  tests/                 One spec file per feature area, tagged
                         @smoke/@regression/@sanity.
  global-setup.ts        Runs once per `npm run e2e` invocation — session
                         cache clearing. Don't add other one-time setup here;
                         if a new module needs global setup, ask whether it's
                         truly global or belongs in a fixture instead.
```

### Authentication flow

Auth is entirely owned by `AuthenticationManager` (`auth/AuthenticationManager.ts`),
configured by `AuthConfig` (`config/auth.config.ts`), and wired into
Playwright's fixture lifecycle by the thin wrapper `fixtures/auth.ts`. Every
spec gets an authenticated page via a persona fixture
(`adminPage`/`managerPage`/`hrDirectoryPage`/`usersManageOnlyPage`/`employeeSelfPage`):

```ts
import { test, expect } from '../fixtures/auth';

test('a new module test', async ({ adminPage }) => {
  await adminPage.goto('/whatever');
});
```

A new feature module needs **zero changes** to the auth layer — it reuses
whichever of the five existing personas already carries the right permission
set (see `e2e/.env.e2e.example` for what each one has). If you genuinely need
a permission combination none of the five has, add ONE new persona key to
`fixtures/personas.ts` + document its env vars in `.env.e2e.example` — do not
add a sixth type of ad hoc login anywhere else.

**Never**, in a spec or page object:
- call `/api/auth/login` or read/write cookies directly,
- read/write an `e2e/.auth/*.json` file directly (use `readPersonaUser()` from
  `fixtures/personas.ts` if you need a persona's id/name),
- add auth-specific logic to `fixtures/auth.ts` — that file is deliberately a
  thin Playwright-lifecycle wrapper; auth behavior changes go in
  `AuthenticationManager`/`auth.config.ts`.

### Fixture lifecycle

1. `fixtures/auth.ts`'s `usePersonaPage()` resolves a session (cache hit +
   refresh, or fresh login) via `AuthenticationManager`, opens a
   `browser.newContext()` seeded with that session, and installs the shared
   `AppShellPopup` auto-dismiss listener on the resulting page (see "Shared
   Components" below) — **before** handing the page to your test.
2. Your test runs with that page.
3. On teardown, the context's current storage state is written back to that
   slot's cache file for the next test, and the context closes.

A new module's spec files interact with none of this directly — just import
`test`/`expect` from `fixtures/auth.ts` and request the persona fixture you
need.

### Page Object standards

Every new page object should look like this:

```ts
import { expect, type Locator, type Page } from '@playwright/test';

/** One-line description of what real component/route this wraps. */
export class WidgetPage {
  readonly page: Page;
  readonly someButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.someButton = page.getByRole('button', { name: 'Do The Thing' });
  }

  async goto() {
    await this.page.goto('/widget');
  }

  async doTheThing() {
    await this.someButton.click();
  }
}
```

Rules (codifying the majority convention already followed by most existing
page objects — `LoginPage.ts`/`OrganizationStructurePage.ts` are the cleanest
reference examples):

- **Locators as constructor fields**, not ad hoc inline in every method.
  Exception: a locator that's parameterized by an argument (e.g.
  `row(name: string)`, `listItem(name: string)`) must be a method, not a
  field — it can't be built once at construction time. `LeavesPage.ts`
  predates this convention and uses getters almost everywhere instead; don't
  copy that pattern into new files, but don't churn `LeavesPage.ts` to match
  either (see Tech Debt Register).
- **Navigation method is always `goto()`.** Every existing top-level routable
  page object uses this name with zero exceptions — keep it that way.
- **`getByRole`/`getByLabel`/`getByText` first.** Reach for `helpers/locators.ts`'s
  `selectByLabelText`/`itemByName`/`rowByCellText` before inventing a new CSS
  or XPath traversal — see Locator Rules below for when CSS/XPath is
  actually the right call.
- **One page object per real UI unit.** A dialog gets its own class
  (`pages/components/` if it's shared across modules, `pages/` if it's a
  single module's own dialog) — don't fold a dialog's locators into the
  page that opens it.
- **Assertions live in the spec, not the page object** — with one accepted
  exception: an `expect*()`/`waitForOpen()` convenience method that
  encapsulates a genuinely reusable checkpoint (`waitForOpen()`,
  `expectDialogClosed()`, `expectRowAbsent()`) is fine; a page object that's
  mostly assertion methods (see `AttendanceCard.ts` in the Tech Debt
  Register) is a smell, not a pattern to repeat.

---

## Coding Standards

### Locator rules

Priority order, same as Playwright's own recommendation:

1. `getByRole` (button/row/gridcell/columnheader/option/checkbox/dialog/alert/heading)
2. `getByLabel` / `getByPlaceholder` / `getByText`
3. A documented structural fallback (`.locator('..')` sibling traversal,
   `xpath=`) — **only** when the app genuinely gives you no accessible
   anchor, and only with a comment explaining why (see `AppShellPopup.ts`'s
   comment on why it can't use `getByRole('dialog')`).
4. CSS class selectors (`.MuiCard-root`, etc.) — last resort, and only to
   scope a container, never to identify the actual interactive element.

**Never build a `RegExp` from user-controlled or generated text without
escaping it first.** Use `escapeRegex()` from `helpers/locators.ts`. Three
page objects (`BranchTab`, `DepartmentsPage`, `LookupTab`) shipped this exact
bug — a name containing `.`/`(`/`+` would mismatch or throw — before it was
centralized; don't reintroduce a local copy.

**Exact vs. non-exact matching** — default to non-exact (`getByText`/`getByLabel`
without `{ exact: true }`) only when you have a documented reason (e.g. MUI's
required-field asterisk making the accessible name `"Label *"` rather than
`"Label"` — see `LeavesPage.ts`'s `startDateField` comment). Otherwise prefer
`exact: true` so a new option/label that happens to be a substring of an
existing one doesn't silently start matching the wrong element.

**Don't hand-roll a MUI-Select-without-labelId traversal, a DataGrid
row-by-cell lookup, or a "sole unnamed button in this row" locator.** Use
`selectByLabelText()` / `rowByCellText()` / `soleButtonIn()` from
`helpers/locators.ts`.

### Waiting strategy

- **Never** use `.isVisible()`/`.count()`/`.textContent()` as an instant,
  non-retrying check immediately after a navigation, dialog-open, filter, or
  dropdown-open action. Playwright's own `expect(locator).toBeVisible()` /
  `toHaveCount()` retry automatically — use those for assertions.
- For a **boolean "does this exist at all" check** (not an assertion — e.g.
  deciding whether to `test.skip`, or confirming a permission-gated element
  is absent for a persona who shouldn't have it), use the bounded-wait idiom,
  not a bare `isVisible()`:
  ```ts
  const visible = await locator.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  ```
  This is the one idiom repeated across `helpers/guards.ts`'s
  `skipUnlessVisible`, `LeaveSettingsPanel.goto()`, `AttendanceSettingsPanel.goto()`,
  `EmployeeFormDialog.isIdentitySectionVisible()`, and others — use it
  verbatim rather than inventing a variant.
- **Never** add a hard-coded `page.waitForTimeout(...)` sleep. None exist in
  this framework as of v1.0 — keep it that way. If you think you need one,
  you're missing a real signal to wait on (a response, a locator, a state
  change) — find it instead.
- A dropdown/Select's option list renders asynchronously after the click
  that opens it. Before reading `.count()` or `.textContent()` on its
  options, give the first option a bounded chance to appear
  (`.first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})`) —
  see `LeavesPage.flexiHolidayOptionCount()` for the reference
  implementation. A genuinely empty list still correctly resolves to 0 once
  the wait times out.

### Assertions

- Prefer the specific matcher over a generic one: `toHaveCount(0)` over
  `expect((await x.count()) === 0).toBe(true)`; `toBeVisible()` over asserting
  on `isVisible()`'s resolved value.
- A toast/success-message assertion goes through `pages/components/Toast.ts`
  (`new Toast(page).expectVisible(message)` or `.toast(message)` if the page
  object already exposes a `toast()` passthrough) — not a fresh
  `page.getByText(...)` per call site. Exception: a **persistent inline
  Alert** (not a transient Snackbar) is a different UI primitive and keeps
  its own locator — see `LeaveCancellationPage.inlineAlert` and
  `EmployeesPage.employeeLimitBanner`.

### Test naming

Every test title starts with the CSV test-case ID(s) it covers, exactly as
the existing suite does: `'LV-FN-01: employee applies for their own leave...'`,
`'EM-BD-01: probation_period boundary...'`. Multiple IDs covered by one test
are joined with ` / ` (`'LV-NG-12 / LV-UI-04: ...'`). Tag every test
`@smoke`/`@regression`/`@sanity` per the existing convention (critical happy
path / negative-and-edge / lighter visibility-gating check, respectively).

A test that documents a **known gap** rather than exercising a passing
assertion should say so plainly in the title (`'(confirmed gap)'`,
`'(known gap)'`) — don't let a reader mistake "this proves the app is broken
in this specific way, on purpose" for "this test is broken."

### CSV traceability

Every module ships a `docs/<Module>_TestCases.csv` before automation starts.
Each spec file's header comment should say which CSV rows it automates and,
explicitly, which it deliberately does NOT (with a one-line reason — "no UI
path," "requires a second tenant," "requires raw DB access") — see
`leave-application.spec.ts`'s block comment above its `test.skip(...)`
placeholders for the reference format. A CSV row with no corresponding test
AND no documented skip reason is a silent coverage gap; don't leave one.

---

## Test Data Standards

### Random data generation

`fixtures/test-data.ts`'s `uniqueSuffix()` is the single source of
per-call uniqueness for every generated name/email/id in the framework —
`${Date.now()}${counter}${process.pid}` (the pid is appended, not prepended,
specifically so `uniqueAadhaar()`'s last-12-characters slice still retains
it). **Every** new unique-value generator should be built on `uniqueSuffix()`
(or `uniqueEmployee()`/`uniqueLeaveTypeName()`-style wrappers around it), not
a fresh `Date.now()` call — a bare timestamp collides across Playwright
workers (separate OS processes that can call it in the same millisecond).

Never derive a numeric seed with `Number(uniqueSuffix())` — that string grows
over a run's lifetime and will silently lose integer precision past
`Number.MAX_SAFE_INTEGER`, producing colliding "unique" values from distinct
inputs. Use a bounded string hash instead (see `hashToSafeInt()` in
`fixtures/test-data.ts`, used by `uniquePan()`).

### Employee creation

Use `helpers/seed.ts`'s `createEmployee(page, overrides?)` for a disposable
employee you'll interact with as `adminPage`/another privileged persona — it
returns the full `uniqueEmployee()` record (name/email/employeeId/DOB/
joiningDate/password) but **not** the created user's numeric id (there's no
read-back of the new row). If your module needs the id, you'll need to look
it up separately (e.g. via the Employees grid) until this is extended — see
Tech Debt Register.

`createEmployeeWithProbationState()` (`helpers/leave.ts`) is the reference
pattern for a module that needs an employee in a specific computed state
relative to *today* (not just a disposable fresh employee) — read its doc
comment before copying: it inverts the app's own date arithmetic and
verifies the inversion round-trips, rather than assuming naive subtraction
is safe.

**There is no fixture for logging in as a freshly created employee.** Every
persona fixture is a pre-provisioned, credentialed account read from
`.env.e2e`. If a new module's tests need to act *as* a just-created user
(not just create one and act on it as an admin), that's a framework gap, not
something to work around locally — see Tech Debt Register before building a
one-off login path.

### Date generation

- `uniqueWeekdayRange(spanDays)` (`fixtures/leave-data.ts`) — a jittered,
  future, Monday-anchored `{start, end}` pair, safe against landing `end` on
  the app's blocked Sunday (checked and nudged forward regardless of
  `spanDays`) and jittered per-call (not just per-millisecond) so a tight
  loop of calls in one test doesn't collide on the same week.
- `pastWeekdayDate(daysAgo)` — jittered by up to 4 extra days specifically so
  a same-day rerun against a **fixed persona** (which has real leave/attendance
  history from earlier runs) doesn't deterministically collide with itself.
- Both floor at `'2026-01-01'` to match the app's own hardcoded date-picker
  minimum (`LeavesPage.tsx`) — a documented known gap, not something either
  fixture works around silently.
- **Building a new date fixture?** Work out by hand whether your formula can
  land on a day the app's business rules reject (weekends, holidays,
  min/max bounds) for *every* parameter value you'll actually call it with —
  `uniqueWeekdayRange(6)` shipped for a while always landing exactly on a
  blocked Sunday (Monday + 6 = Sunday) before this was caught. A parameter
  that "usually" works isn't safe; check the arithmetic exhaustively for
  small integer ranges.

### Cleanup strategy

**There is no test-data deletion anywhere in this framework**, and per this
task's constraints, this document doesn't invent one that would require
application changes. The strategy is, and remains, **make collisions
impossible via generation, not cleanup**:

- Every disposable record (employee, shift, work mode, policy, branch,
  department, lookup entry) is created with a `uniqueSuffix()`-based name and
  never deleted. This is intentional — don't add an `afterEach` that deletes
  what a test created unless the record is a genuine shared/singleton
  resource (see next point).
- The one genuinely shared, mutable resource — the tenant-wide
  `settings.leave_allocations` blob — uses a **temporary-add, use, then
  restore** pattern (`helpers/leave.ts`'s `withTemporaryLeaveType()`) inside
  a `test.describe.serial()` block, never a delete-everything reset. Any new
  module that needs to temporarily mutate a shared settings blob should
  follow this exact shape, including the `try/finally` restore.
- **Fixed personas' own mutable state (leave balance, attendance history) is
  a known, accepted, currently-unmitigated exhaustion risk** — every test
  that applies/cancels a leave or checks in *as* `employeeSelf`/`manager`
  permanently consumes a slice of a real, finite yearly allocation or a
  once-per-calendar-day slot. This is flagged Critical in the Tech Debt
  Register; don't add a new mutating call site against a fixed persona
  without reading that entry first — prefer `createEmployee()` + an admin
  persona acting *on* it wherever the test doesn't specifically require
  self-service semantics.
- **A shared dev tenant's record count only grows, and eventually makes a UI
  action slow enough to exceed the framework's default 15s action timeout —
  confirmed live, not hypothetical.** `helpers/payroll.ts`'s
  `createEmployeeWithSalaryAssignment()` was already overriding `GET
  /api/users`'s timeout to 30s for exactly this reason; the Payroll Framework
  Stabilization pass found the same growth had, by the time of that pass,
  also pushed several UI actions (`EmployeesPage.clickAddEmployee()`,
  `PayrollComponentsPage`/`PayrollStructuresPage`'s row and "New …" actions,
  `PayrollAssignmentsPage.search()`, `PayrollRunDetailPage.openLine()`) past
  the same 15s ceiling. Each now carries the identical local, scoped `{
  timeout: 30_000 }` override at the one call site that needs it — **do not
  raise `playwright.config.ts`'s global `actionTimeout` instead**; a new
  module hitting this same symptom should add its own scoped override at its
  own slow call site, not touch the global default.

---

## Shared Components

| Component | File | What it centralizes |
|---|---|---|
| `AppShellPopup` | `pages/components/AppShellPopup.ts` | The app-wide missed-checkin nudge modal. `installAppShellPopupAutoDismiss(page)` is wired into `fixtures/auth.ts` and dismisses it automatically after every navigation — **no page object should ever add its own dismissal logic**; if you find yourself writing one, the auto-dismiss isn't working for your case and that's a framework bug to fix, not route around locally. |
| `ConfirmDialog` | `pages/components/ConfirmDialog.ts` | The generic "Are you sure?" confirmation dialog pattern, parameterized by its title. |
| `Toast` | `pages/components/Toast.ts` | Transient Snackbar success/error messages (`new Toast(page).expectVisible(message)`). Not for persistent inline Alerts — those keep their own locator. |
| `escapeRegex` | `helpers/locators.ts` | Safe regex interpolation of dynamic names/labels. |
| `itemByName` | `helpers/locators.ts` | A clickable list row/item by its visible (concatenated) name. |
| `soleButtonIn` | `helpers/locators.ts` | The one unnamed icon button inside a row (delete/remove actions with no Tooltip/aria-label). |
| `selectByLabelText` | `helpers/locators.ts` | A labelId-less MUI `<Select>`'s combobox, via its visible label's sibling. |
| `rowByCellText` | `helpers/locators.ts` | A DataGrid row whose named-column gridcell matches given text. |
| `skipUnlessVisible` | `helpers/guards.ts` | `test.skip()` with a bounded-wait visibility check and a clear reason — the reference implementation the bounded-wait idiom above is drawn from. |
| `assertSessionActive` / `installSessionExpiryDetector` | `helpers/sessionGuard.ts` (re-exported from `helpers/guards.ts`) | Call `assertSessionActive(page)` as the first line of any `goto()` that navigates a page which requires an active session. Turns a stale/expired persona session into an immediate, clear `SessionExpiredError` instead of a confusing 15s locator timeout once the app's own client-side auth guard has already bounced the page to `/login`. Zero cost on the happy path — reads a flag set by a `response` listener installed once per persona context in `fixtures/auth.ts`, no wait of its own. Every Payroll page object's `goto()` calls this; extend the same call to a new module's page objects rather than re-deriving the check. |
| `installTransientRequestRetries` | `helpers/networkResilience.ts` | Installed once per persona context in `fixtures/auth.ts` — retries a raw `page.request.*`/`context.request.*` call a bounded number of times, but only on a genuine transport-level failure (`ECONNRESET`, `socket hang up`, `ECONNREFUSED`) never on an actual HTTP response (400/401/403/404/409 always resolve normally in Playwright's API and are never touched by this). No spec file needs to opt in or change anything to get this. |
| `createEmployee` / `createShift` / `createWorkMode` / `createAttendancePolicy` | `helpers/seed.ts` | Disposable-record "arrange" helpers. |
| `createEmployeeWithProbationState` / `withTemporaryLeaveType` / `findLeaveAllocationRowIndex` / `formatDisplayDate` | `helpers/leave.ts` | Leave-suite-specific arrange helpers with no equivalent elsewhere. |
| `uniqueSuffix` / `uniqueEmployee` / `uniqueAadhaar` / `uniquePan` | `fixtures/test-data.ts` | Collision-safe, cross-worker-safe unique value generation. |
| `uniqueWeekdayRange` / `nextSunday` / `pastWeekdayDate` / `nextYearBoundaryRange` / `uniqueLeaveTypeName` / `toIso` | `fixtures/leave-data.ts` | Leave-suite date generation, business-rule-collision-safe. |
| `uniqueShiftName` / `uniquePolicyName` / `uniqueWorkMode` | `fixtures/attendance-data.ts` | Attendance-suite unique naming. |

**Before writing a new helper, grep for the pattern first.** Most duplication
in this framework happened because a second author didn't know a
near-identical helper already existed one file over.

---

## Best Practices

### Do

- Import `test`/`expect` from `fixtures/auth.ts`, not `@playwright/test`
  directly, in every spec file (the persona fixtures aren't available
  otherwise).
- Read a page object's own doc comments before extending it — most encode a
  "confirmed live" reason for an otherwise-odd-looking locator choice.
- Write the CSV-coverage header comment (what's automated, what's
  deliberately skipped and why) before writing the first test in a new spec
  file, not after.
- Use `createEmployee()`/a fresh record wherever the test doesn't specifically
  require a fixed persona's self-service identity.
- Run `npm run e2e:typecheck` before every commit that touches `e2e/`.

### Don't

- Don't add a second place that dismisses the AppShell popup, checks
  `isVisible()` instantly after a navigation, or re-derives `escapeRegex`.
- Don't add a new fixed persona's credentials unless none of the existing
  five can express the permission combination you need.
- Don't mutate the shared `settings` blob outside a `withTemporaryLeaveType()`-style
  temporary-add-then-restore pattern, and don't do it outside a
  `test.describe.serial()` block.
- Don't use `page.waitForTimeout(...)` — ever. Find the real signal.
- Don't hardcode a "known good" Aadhaar/PAN/email/name literal — every one of
  these carries a real uniqueness constraint server-side; use the generators.
- Don't assume a CSS class selector or raw XPath is fine because "it's just
  this one case" — the framework already has two raw-XPath call sites from
  exactly that reasoning; centralize or clearly justify instead of adding a
  third pattern.

# Attendance Module — Automation Design Document (Phase 1)

Status: **DRAFT — awaiting approval**
Reference implementation: Employee module (`e2e/pages/EmployeesPage.ts`, `EmployeeFormDialog.ts`, etc.)
Related existing artifact: [`docs/Attendance_Shifts_TestCases.csv`](Attendance_Shifts_TestCases.csv) — 137 pre-existing manual test cases (API/DB/security/perf level). This design document scopes and aligns with that CSV rather than replacing it — see §10.

---

## 1. Scope

"Attendance" in this codebase is actually five sub-surfaces sharing one engine. Not all of them are reachable from a browser as a human user, which matters because Playwright E2E can only drive what a real browser session can drive.

| Sub-surface | Screens / Components | Principal | In scope for Playwright E2E? |
|---|---|---|---|
| Self check-in/out | `TodayAttendanceCard` (embedded in `AttendancePage` + Employee Dashboard) | Human (browser) | ✅ Yes |
| Attendance history/calendar | `AttendancePage.tsx` (self + "viewing for" others) | Human (browser) | ✅ Yes |
| Shift management | `ShiftsPage.tsx` | Human (browser) | ✅ Yes |
| Work Mode management | `WorkModesPage.tsx` (standalone + embedded in Settings) | Human (browser) | ✅ Yes |
| Attendance Policy management | `AttendancePoliciesPage.tsx` + `AttendancePolicyFormDialog.tsx` | Human (browser) | ✅ Yes |
| Attendance Rules settings (Phase 12B) | `SettingsPage.tsx` → Attendance tab | Human (browser) | ✅ Yes |
| AppShell missed-checkin popup | `AppShell.tsx` | Human (browser) | ✅ Yes |
| Manager/Employee dashboard attendance widgets | `ManagerDashboard.tsx`, `EmployeeDashboard.tsx` | Human (browser) | ✅ Yes (as cross-surface consistency checks) |
| Face/kiosk check-in | `face-attendance` PWA, kiosk device JWT | **Device**, not human | ❌ Out of scope — no browser login exists for a kiosk device; belongs in an API/integration suite, not Playwright UI E2E |
| Kiosk device management (register/rotate/revoke) | `kiosk-devices.routes.js` UI (if any) | Human, but manages a device principal | ⚠️ CRUD screen only, in scope; the *device's own* check-in flow is out of scope |
| Attendance reports (14 report defs, CSV/XLSX/PDF export) | Reports module | Human (browser) | ⚠️ Partially in scope — belongs conceptually to the **Reports module**, not Attendance. Recommend a thin smoke test here ("attendance-daily report renders and exports") and leaving deep report coverage to a future Reports-module automation effort, to avoid scope creep. |
| DB constraints, idempotency races, performance/SLA | — | — | ❌ Out of scope for Playwright — these are already covered as manual/API-level cases in the existing CSV (`AT-DB-*`, `AT-PF-*`, `AT-SC-07/08/09`) |

**This is the E2E baseline for the module — zero Playwright specs exist for Attendance today** (confirmed: no attendance/shift/work-mode files under `e2e/tests/`).

---

## 2. Features inventory

### 2.1 Self check-in/out (`TodayAttendanceCard`)
- Renders only the check-in methods the caller's assigned policy allows (`GET /my-policy`).
- Manual (Office) check-in — single button, no dialog.
- Work-mode check-in (WFH / Client Visit / Field Work) — dialog with optional location share, optional notes; Client Visit requires `clientName`.
- Break / Resume toggle.
- Check-out — optional work summary text (captured only for non-Office modes).
- Live "worked today" timer, method/work-mode badges, `AttendanceTimeline` visual.
- Idempotency keys attached to work-mode check-in and checkout only (not Manual check-in, not break/resume).
- Fires a global `userCheckedIn` DOM event consumed by `AttendancePage` for silent refetch.

### 2.2 Attendance history/calendar (`AttendancePage.tsx`)
- Month calendar: colors Present / Leave (full+half-day) / Absent / Holiday / Off-day (Sun + **hardcoded** 2nd Saturday) / Today / Joining-day.
- Stat cards: Present Days, On Leave, Absent Days, Attendance Rate % (computed over elapsed working days only, from the target user's own tracking-start date).
- "Viewing for" employee selector — visible only with `attendance.view.team`.
- History table (MUI DataGrid): Date, Method, Work Mode, Check-in, Check-out, Client/Notes — built-in column visibility/filter/density/CSV export via the DataGrid toolbar (client-side re-serialization, not a server export).
- Onboarding banner on the target user's joining day.

### 2.3 Shift management (`ShiftsPage.tsx`)
- List: name, type, start–end, grace period, OT flag.
- Create/Edit dialog, type-conditional fields (Split → dynamic window pairs; Night → "next calendar day" checkbox; break-type-conditional fields; OT-conditional fields).
- Delete with in-use guard (409 if referenced by an assignment).
- Assign-shift panel: employee autocomplete + shift + effective-from date, plus assignment-history list for the selected employee.

### 2.4 Work Modes (`WorkModesPage.tsx`)
- Simple CRUD list (code, name, description, active flag), standalone page or compact panel embedded in Settings.
- Delete blocked (409) if referenced as a default or on an attendance row.

### 2.5 Attendance Policies (`AttendancePoliciesPage.tsx` + `AttendancePolicyFormDialog.tsx`)
- DataGrid: Name, Type, Allowed Methods, Assigned count, Active/Inactive.
- Create/Edit: name, policy_type, allowed_methods checklist, geofence lat/lng/radius (packed into `config` JSON).
- Bulk "Assign" dialog — multi-select employees, diffs current vs. selected, fires parallel per-user assign/clear calls.
- Delete has **no server-side in-use guard** (see Edge Cases §9) — UI shows a warning only.

### 2.6 Attendance Rules (Settings → Attendance tab, Phase 12B)
- Weekly Off Days (7 checkboxes), Off Saturdays (1st–5th), "Attendance Required For" (per-role checkboxes, sourced from live roles or a hardcoded fallback list).
- Persisted via generic `POST /api/settings/bulk`.

### 2.7 AppShell missed-checkin popup
- Modal shown once per session load if: role is required for attendance AND not checked in today AND today isn't an off-day/holiday AND today isn't the joining day AND caller has `attendance.checkin`.
- Suppressed on `/attendance` and `/login`. Dismiss via X/backdrop, or click-through navigates to `/attendance`.

### 2.8 Dashboard widgets
- `EmployeeDashboard`: embeds `TodayAttendanceCard`, same eligibility gate.
- `ManagerDashboard`: `TodaysAttendanceBar` (Present/On Leave/Not Checked In, eligible subset only), `AttendanceMethodBreakdownCard` (today's check-ins by method), missing-checkin alert list.

---

## 3. Business rules (automation-relevant)

1. **No policy assigned → Manual only.** Any other method → 403.
2. **Method must be in the assigned policy's `allowed_methods`** → else 403.
3. **Geofencing** only enforced if the policy's `config` has `geofence_center_lat/lng` + `geofence_radius_meters`.
4. **Tracking window**: check-in blocked before `max(joining_date, globalStartDate)`; globalStartDate = `2026-05-01` for years ≤2026, else `${year}-01-01`.
5. **Joining-day block**: cannot check in on the exact joining/creation day — must wait until the next day.
6. **One check-in per day** (`UQ_attendance_..._user_date`) → "Already checked in for today."
7. **Checkout requires an existing open row.**
8. **Shift facts frozen at check-in time** — a later shift reassignment never retroactively changes an already-recorded day.
9. **Multi-day missed-checkout gap**: worked minutes capped at 24h, overtime forced to 0.
10. **Auto-overtime**: created only if `shift.ot_enabled` and computed overtime > 0; a pre-existing manual OT entry for that date wins (auto-create silently no-ops on conflict).
11. **One open assignment per employee** — assigning a new shift auto-closes the prior open one (`effective_to = new effective_from - 1 day`); enforced app-level and by a DB filtered unique index.
12. **Shift/Work Mode delete blocked if referenced**; **Attendance Policy delete is NOT blocked** if referenced (inconsistency — see Edge Cases).
13. **Phase 12B participation is UI-only.** Backend write endpoints never check `required_for_roles`; an opted-out role can still check in manually. Default fallback (when the setting is unset) = every role except `super_admin` participates — and this rule is hand-duplicated in three files (`EmployeeDashboard`, `ManagerDashboard`, `AppShell`).
14. **Payroll is unaware of Phase 12B opt-outs** — LOP calculation counts raw attendance rows regardless of `required_for_roles`.
15. **Calendar's 2nd-Saturday-off is hardcoded**, independent of the tenant's configurable `nth_saturdays_off` — can visually disagree with the popup/Payroll for tenants using a different Nth-Saturday rule.
16. **No timezone conversion** anywhere in shift-time math (raw UTC comparison) — a real risk for non-UTC tenants but likely out of automated-test scope unless the target tenant's timezone is known.

---

## 4. CRUD matrix

| Entity | Create | Read | Update | Delete | In-use delete guard? |
|---|---|---|---|---|---|
| Attendance record (self) | ✅ (check-in) | ✅ (today/monthly/history) | ✅ (check-out, break/resume are sub-updates) | ❌ no delete/edit UI (no regularization feature — confirmed stub) | n/a |
| Shift | ✅ | ✅ | ✅ (PATCH) | ✅ | ✅ 409 if assigned |
| Employee Shift Assignment | ✅ | ✅ (history list) | ➖ (no direct edit — new assignment closes old one) | ❌ no delete UI | n/a |
| Work Mode | ✅ | ✅ | ✅ (PATCH) | ✅ | ✅ 409 if referenced |
| Attendance Policy | ✅ | ✅ | ✅ (PUT) | ✅ | ❌ **no guard — deletable while in use** |
| Policy Assignment (per user) | ✅ (assign) | ✅ (assigned count/list) | ✅ (reassign) | ✅ (assign `null` clears) | n/a |
| Attendance Rules setting | ➖ (upsert only) | ✅ | ✅ | ➖ (no delete concept) | n/a |
| Kiosk Device | ✅ | ✅ | ✅ (rotate key, status) | ➖ (Revoke, not hard delete) | n/a — out of primary scope |

---

## 5. Validations (client + server)

| Field/flow | Rule | Layer |
|---|---|---|
| Check-in `date` | required, valid date | Server schema |
| `workMode` (work-mode select) | enum `WFH\|ClientVisit\|FieldWork` — **`Office` explicitly rejected** (kiosk-only) | Server schema |
| `clientName` (Client Visit) | required, non-blank | Both — client disables Check-In button; server also validates |
| Shift `name` | required, ≤150, unique per tenant | Client (Save button gated only on non-empty) + Server (409 on duplicate) |
| Shift `shift_type` | enum `General\|Flexible\|Night\|Rotational\|Split` | Server schema + DB CHECK |
| Shift `break_type` | enum `none\|unpaid_duration\|paid_duration\|fixed_window` | Server schema + DB CHECK |
| Shift numeric fields (grace/expected minutes etc.) | `type="number"` only — **no client-side bounds check** | Client is weak here; server validates ≥0 |
| Shift assignment `effective_from`/`effective_to` | `effective_to >= effective_from` | Server + DB CHECK `CK_esa_dates` |
| Attendance Policy `allowed_methods` | ≥1 value from `ATTENDANCE_METHODS` | Server schema |
| Attendance Policy `policy_type` | enum `OfficeOnly\|Hybrid\|Remote\|FieldStaff` | Server schema + DB CHECK |
| Work Mode `code` | unique per tenant | Server (409) |
| Geolocation share | silently resolves `null` on denial/timeout (8s) — never blocks check-in client-side | Client only |

---

## 6. Permissions matrix

| Permission code | Gates | Default holders (post-030) |
|---|---|---|
| `attendance.checkin` | check-in/break/resume/checkout (self) | employee, manager, hr, attendance_admin, super_admin |
| `attendance.view.team` | viewing another user's monthly attendance, "viewing for" selector, manager attendance widgets | manager, hr, attendance_admin, super_admin |
| `attendance.policy.manage` | Attendance Policies CRUD + assign | attendance_admin, super_admin (hr lost this in 030) |
| `attendance.device.manage` | Kiosk device CRUD/config/status | attendance_admin, super_admin |
| `attendance.face.enroll` | Face enrollment (human side) | attendance_admin, super_admin |
| `attendance.face.sync` | Kiosk-only embedding sync | **not human-grantable** |
| `attendance.checkin.kiosk` | Kiosk-only face check-in | **not human-grantable** |
| `attendance.settings.view` / `.manage` | Attendance Rules settings read/edit | view: broader; manage: attendance_admin, super_admin |
| `shifts.view` / `shifts.manage` | Shift list (view) vs CRUD/assign (manage) | attendance_admin, super_admin (manage); hr/manager view-only or none per role |
| `work-modes.manage` | Work Mode CRUD/assign (GET `/` is permission-free) | attendance_admin, super_admin |
| `reports.attendance.view.own/.team/.all` | Attendance report scope | tiered by role |

**Personas already available for reuse** (`e2e/fixtures/personas.ts`): `admin` (full), `manager` (`users.view.team` only — **does not currently map to attendance permissions**, needs verification/extension), `hrDirectory`, `usersManageOnly`, `employeeSelf` (no view/manage — good for negative/self-only checks).

⚠️ **Design gap to resolve before Phase 3**: none of the 5 existing personas is confirmed to hold `attendance.policy.manage`, `shifts.manage`, or `work-modes.manage` specifically — they were defined around Employee-module permissions. Need either (a) confirm `admin` persona's role also holds these (likely, if it's `super_admin`), or (b) add a 6th persona (e.g. `attendanceAdmin`) mapped to the `attendance_admin` role for clean permission-segregation tests (mirrors how `usersManageOnlyPage` exists to prove segregation in Employee tests). **Recommend (b)** — see §9 open questions.

---

## 7. Search / Filters / Sorting / Pagination

| Screen | Search | Filter | Sort | Pagination |
|---|---|---|---|---|
| Attendance History table | ❌ none | DataGrid built-in column filter | DataGrid built-in (default: date desc) | DataGrid built-in |
| Shifts list | ❌ none seen | ❌ none | ❌ none | ❌ none (assume full list, likely short) |
| Work Modes list | ❌ none | ❌ none | ❌ none | ❌ none |
| Attendance Policies grid | ❌ none | ❌ none | DataGrid default | DataGrid default |
| Policy "Assign" employee picker | ✅ name filter | — | — | — |
| Shift "Assign" employee picker | ✅ autocomplete | — | — | — |

**Gap consistent with the Employee suite**: sort/pagination automation has no existing pattern in this codebase (Employee list doesn't test it either) — if DataGrid defaults are trustworthy, we may deliberately scope this out rather than invent unproven patterns; flagging as a judgment call for Phase 2, not silently skipping.

---

## 8. Exports / Imports

- **Attendance History table**: DataGrid toolbar CSV export — client-side re-serialization of loaded rows. In scope (light smoke coverage: click export, assert download event fires with expected filename pattern).
- **No server-driven export lives inside the Attendance module itself.** The Payroll-style CSV/XLSX/PDF export exists only in the **Reports module** (`GET /api/reports/:reportId/export`), and 14 attendance report defs use it. Recommend one thin cross-module smoke test (e.g. export `attendance-daily` as CSV) and leaving exhaustive report coverage for a future Reports-module design doc.
- **No import feature exists anywhere in Attendance** (no bulk-upload of attendance records, shifts, or policies) — confirmed absent, not a gap to test.

---

## 9. Dependencies

- **Employee (`users`)** — hard dependency: `attendance_policy_id`, `default_work_mode_id`, `joining_date` (tracking-start rule), org-structure columns used as report filters. Attendance E2E tests will need to **seed/reuse an employee** via the existing `EmployeesPage`/`EmployeeFormDialog`/`uniqueEmployee()` pattern.
- **Shifts** feed frozen late/early/OT facts onto each attendance row at check-in time.
- **Work Modes** — `work_mode` (legacy text) and `work_mode_id` (FK) co-exist; not fully backfilled historically.
- **Payroll** — consumes raw attendance row-count for LOP; consumes auto-created `overtime_entries`. Cross-module test candidate (§ Edge Cases item 4 below), but full Payroll run automation is out of this design doc's scope — flag as a hand-off item.
- **Leave** — monthly view cross-references approved leaves to distinguish Leave vs Absent.
- **Holidays / Branches (`locations`)** — holiday and kiosk-device location scoping.
- **Settings module** — `attendance_rules` shares the generic KV `settings` table with unrelated Payroll/General settings (shared blast radius if the bulk-upsert permission map ever regresses).
- **Reports module** — hosts attendance exports (see §8).
- **RBAC/Roles** — `attendance_admin` is a dedicated Enterprise-template role; needs a persona (see §6).

---

## 10. Edge cases prioritized for automation

These map directly to rows already itemized as manual/API cases in `Attendance_Shifts_TestCases.csv` — the ones below are the subset genuinely observable/reproducible **through the browser UI**, which is the E2E value-add on top of that CSV (not a replacement for its API/DB/security rows):

| # | Edge case | Why it matters | Existing CSV ref |
|---|---|---|---|
| 1 | Second check-in same day → "Already checked in" toast, UI doesn't re-render a stale check-in button | Duplicate-prevention UX | AT-NG-07 |
| 2 | Checkout with no check-in today → error surfaced in UI, not a silent no-op | AT-NG-08 |
| 3 | Client Visit check-in with blank `clientName` → Check-In button stays disabled | AT-UI-02 |
| 4 | Joining-day check-in block — new employee sees blocked/blocked-with-message state on their own joining day, then succeeds the next day | High business-rule visibility risk | AT-NG-04, AT-BD-07 |
| 5 | Calendar's hardcoded 2nd-Saturday-off vs. a tenant configured for a different Nth Saturday — cross-surface UI disagreement (calendar vs. AppShell popup vs. Settings copy) | Known inconsistency, high regression value | — (new; not in CSV, UI-only) |
| 6 | Delete an in-use Attendance Policy (no server guard) → confirm UI warns, then verify affected employee's next check-in degrades to Manual-only rather than erroring | AT-FN-14/AT-NG-* adjacent, UI-observable consequence not in CSV |
| 7 | Toggling a role out of "Attendance Required For" → popup stops appearing for that role's users AND Manager dashboard KPI denominator changes, in the same test run | Verifies the 3 hand-duplicated implementations agree | AT-UI-13/14/15 |
| 8 | Shift delete blocked while assigned (409 surfaced as UI error) vs. successful delete once reassigned | AT-NG-13 |
| 9 | Work Mode delete blocked while referenced | AT-NG-14 |
| 10 | Permission-gated visibility: `employeeSelf`-equivalent persona sees no "viewing for" selector, no Shifts/Work Modes/Policies admin nav items; an attendance-admin-equivalent persona sees all of them | AT-PM-01 through 05 |
| 11 | Multi-day missed checkout — hard to exercise via UI without manipulating system time/mocking; **recommend seeding this scenario via a direct API call in test setup** (already-established pattern: login is API-based) rather than attempting a real 2-day wait in UI | AT-BD-04 |

Items requiring real elapsed time, precise geofence coordinates, face-embedding confidence thresholds, or concurrency races (AT-BD-02/03, AT-SC-08/09, AT-PF-*) are **not good Playwright UI candidates** — they're correctly already covered as API/DB-level manual cases in the CSV and should stay there.

---

## 11. Proposed automation architecture (no code yet — structure only)

Fully reuses the existing framework per the Employee-module precedent; **zero changes needed to the auth layer**.

```
e2e/
  fixtures/
    personas.ts          + optionally add `attendanceAdmin` persona (see §6 open question)
    attendance-data.ts    NEW — uniqueShift()/uniquePolicy()/uniqueWorkMode() factories + boundary arrays,
                           mirroring test-data.ts's pattern; kept separate per architecture report's
                           recommendation (test-data.ts is Employee-specific despite its generic name)
  pages/
    AttendanceCard.ts      NEW — wraps TodayAttendanceCard (check-in/out, break/resume, dialogs)
    AttendancePage.ts       NEW — wraps calendar + stat cards + history table + "viewing for" selector
    ShiftsPage.ts            NEW — list + form dialog + assign panel
    WorkModesPage.ts          NEW — simple CRUD list (candidate to model after LookupTab's generic pattern
                                    if its markup is structurally close to Designations/Employment Types)
    AttendancePoliciesPage.ts  NEW — grid + form dialog + bulk-assign dialog
    AttendanceSettingsPanel.ts  NEW — wraps the Settings→Attendance tab (weekly offs/Nth-Saturday/required-for-roles)
    components/
      ConfirmDialog.ts        REUSE as-is (already generic)
  tests/
    attendance-checkin-checkout.spec.ts   NEW
    attendance-history-calendar.spec.ts   NEW
    attendance-policies.spec.ts           NEW
    shifts.spec.ts                        NEW
    work-modes.spec.ts                    NEW
    attendance-rules-settings.spec.ts     NEW
    attendance-permissions.spec.ts        NEW (cross-cutting persona-swap suite)
```

Conventions carried over unchanged: `import { test, expect } from '../fixtures/auth'`; `getByRole`/`getByLabel`/text locators (no `data-testid` exists in this codebase); `{ tag: ['@smoke'|'@regression'|'@sanity'] }`; test titles embed the manual-test-case ID (e.g. `AT-FN-01`) tying back to the CSV; `test.skip(reason)` for permission-gated sections rather than hard failure; toast/snackbar-text assertions plus structural DOM assertions; Playwright's built-in polling only, no manual waits.

**One deliberate deviation to flag**: the Employee suite's ad hoc per-spec-file `createPlainEmployee()` helper duplication was called out as an anti-pattern in the architecture review. Since Attendance tests will need a seeded employee (for check-in flows) *and* a seeded shift/policy/work-mode (for assignment flows), recommend introducing a genuinely shared `e2e/helpers/seed.ts` this time rather than repeating the copy-paste pattern — this module is the natural place to fix that rough edge rather than propagate it further.

---

## 12. Open questions before Phase 2

1. **Persona coverage** — do we add a 6th `attendanceAdmin` persona, or confirm `admin`'s underlying role already covers `attendance.policy.manage`/`shifts.manage`/`work-modes.manage`? (Recommend adding one — cleaner permission-segregation tests, mirrors `usersManageOnlyPage`'s purpose.)
2. **Reports module boundary** — confirm the one thin attendance-export smoke test belongs here vs. deferring entirely to a future Reports-module design doc.
3. **Kiosk device CRUD screen** — confirm whether a device-management UI actually exists to test, or whether kiosk devices are provisioned out-of-band (script/DB) today.
4. **Time-dependent scenarios** (joining-day boundary, multi-day gap, tracking-window cutoff) — confirm API-seeding via direct calls (mirroring the auth layer's own API-based login) is acceptable, since real elapsed-time waits are not viable in CI.
5. **Non-UTC tenant testing** — confirm this is out of scope (current test tenant `mywe` — verify its configured timezone, if any, before deciding).

---

**Awaiting approval to proceed to Phase 2 (manual test case generation, categorized into Smoke/Regression/Positive/Negative/Boundary/Permission/Validation).**

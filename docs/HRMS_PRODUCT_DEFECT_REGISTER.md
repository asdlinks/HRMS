# HRMS Product Defect Register

**The single source of truth for application (product) defects discovered by the Playwright e2e automation**, across the stabilized modules: Employee Master, Attendance, Leave Management, Payroll & Salary Grades, Company Profile Settings, and Company Documents.

> **Coverage note:** RBAC & Roles was stabilized as a later module (Playwright V2 Baseline) but predates this register being kept current for it — its confirmed defects, if any, are not yet transcribed here. Company Profile Settings and Company Documents (added below) are current as of their own stabilization/re-verification passes.

This document is distinct from, and consolidates evidence out of:
- `e2e/KNOWN_AUTOMATION_AND_PRODUCT_ISSUES.md` — a much sparser, pre-existing tracker (kept as-is; not modified by this pass)
- `e2e/FRAMEWORK_TECH_DEBT.md` — **automation/framework** debt only (locator quality, session handling, test-data growth) — deliberately excluded here
- The per-module CSV test-case files (`docs/*_TestCases.csv`) and the Playwright spec files themselves, which are the primary evidence for every row below

**Scope discipline:** every entry below is a genuine, evidenced *application* defect — something the product does incorrectly, confirmed by a passing Playwright test whose entire purpose is to prove the incorrect behavior (per this suite's own convention of marking such tests `(confirmed gap)`/`(known gap)` in their titles), or by direct source-code confirmation cross-referenced against a test. Automation bugs, framework limitations, environment/network flakiness, and test-data issues are explicitly excluded — see each module's own stabilization work for those. Nothing in this register was invented; every row cites its exact evidence.

---

## 1. Executive Summary

| Metric | Count |
|---|---|
| **Total Product Bugs** | **49** |
| Critical | 6 |
| High | 7 |
| Medium | 25 |
| Low | 11 |

### Bugs by module

| Module | Count | Critical | High | Medium | Low |
|---|---|---|---|---|---|
| Employee Master | 3 | 0 | 1 | 2 | 0 |
| Attendance | 8 | 0 | 2 | 3 | 3 |
| Leave Management | 11 | 4 | 3 | 2 | 2 |
| Payroll & Salary Grades | 11 | 1 | 1 | 8 | 1 |
| Company Profile Settings | 7 | 1 | 0 | 4 | 2 |
| Company Documents | 9 | 0 | 0 | 6 | 3 |
| **Total** | **49** | **6** | **7** | **25** | **11** |

### Bugs by category (primary)

| Category | Count |
|---|---|
| Validation | 20 |
| UI | 10 |
| Security | 9 |
| Business Logic | 7 |
| Data Integrity | 3 |
| API | 0 as primary (see §8 — one Data Integrity/API dual-category bug cross-referenced there) |

### The 6 Critical items, at a glance

| Bug ID | Module | Title |
|---|---|---|
| LV-003 | Leave | A `leaves.approve` holder can approve/reject their own pending leave — no ownership check |
| LV-006 | Leave | `GET /api/settings` (incl. `leave_allocations`) has no read-side permission guard at all |
| LV-007 | Leave | `end_date < start_date` is accepted server-side — only the browser's native input blocks it |
| LV-001 | Leave | `is_half_day` datatype handling — pre-existing Critical issue, carried forward (see note in §3) |
| PR-002 | Payroll | Payroll run CSV export includes bank account number/IFSC/UPI in full plaintext, no masking |
| CP-001 | Company Profile Settings | `POST /api/settings/bulk` allows ANY authenticated user to write arbitrary keys, bypassing the permission check entirely for any key name outside a hardcoded 4-entry allowlist |

---

## 2. Product Defect Register

| Bug ID | Module | CSV Test ID(s) | Title | Severity | Category | Status | Owner |
|---|---|---|---|---|---|---|---|
| EM-001 | Employee Master | EM-SC-01 | Aadhaar/PAN rendered fully unmasked to any privileged viewer | High | Security | Open | Full Stack |
| EM-002 | Employee Master | EM-VD-05 | Banking fields (account number/IFSC/UPI) have no server-side format validation | Medium | Validation | Open | Backend |
| EM-003 | Employee Master | EM-VD-12, EM-BD-06 | Date fields (`joining_date`, `date_of_birth`) accept non-date strings, no format validation | Medium | Validation | Open | Backend |
| AT-001 | Attendance | ATE-RG-03 | "2nd Saturday off" is hardcoded, ignores tenant's configurable Nth-Saturday setting | Medium | Business Logic | Open | Frontend |
| AT-002 | Attendance | ATE-RG-05 | Attendance Policy delete has no in-use guard (inconsistent with Shifts/Work Modes) | High | Business Logic | Open | Backend |
| AT-003 | Attendance | ATE-PM-04, ATE-PM-07 | Attendance Policies / Work Modes admin screens render CRUD controls with no client-side permission gate | Medium | Security | Open | Frontend |
| AT-004 | Attendance | ATE-VD-07 | Attendance Policy form doesn't adapt fields to `policy_type` | Low | UI | Open | Frontend |
| AT-005 | Attendance | ATE-PS-16, AT-FN-15 | "Assign default Work Mode to employee" has an API but no reachable UI | Medium | Business Logic | Open | Frontend |
| AT-006 | Attendance | (n/a — FRAMEWORK_TECH_DEBT.md C3) | `admin` persona's effective RBAC state for `shifts.manage`/`attendance.policy.manage` is non-deterministic across time | High | Security | Open | Backend |
| AT-007 | Attendance | ATE-BD-08 | No validation blocks configuring all 7 days as Weekly Off Days | Low | Validation | Open | Full Stack |
| AT-008 | Attendance | (n/a) | Edit/Delete icon buttons in the Attendance Policies grid have no accessible name | Low | UI | Open | Frontend |
| LV-001 | Leave | LV-FN-13, LV-UI-05, LV-VD-02 | `is_half_day` datatype handling — pre-existing known issue, status unconfirmed in current codebase | Critical | Data Integrity / API | Open | Backend |
| LV-002 | Leave | LV-NG-04 | Probation Earned/Paid block matches on substring — incorrectly blocks any type merely containing "paid" (e.g. "Unpaid") | High | Business Logic | Open | Backend |
| LV-003 | Leave | LV-NG-18, LV-SC-01, LV-SC-02, LV-PM-03 | `leaves.approve` carries no ownership/manager-relationship check — self-approval succeeds | Critical | Security | Open | Backend |
| LV-004 | Leave | LV-NG-19 | Cancelling an already-started/completed Approved leave succeeds server-side (client-only guard) | High | Business Logic | Open | Backend |
| LV-005 | Leave | LV-NG-20, LV-DB-03 | Concurrent overlapping leave applications both succeed — race condition, no locking/unique constraint | High | Data Integrity | Open | Backend |
| LV-006 | Leave | LV-SC-03 | `GET /api/settings` (including `leave_allocations`) has no read-side permission guard | Critical | Security | Open | Backend |
| LV-007 | Leave | LV-NG-10 | `end_date < start_date` accepted server-side — only the browser's native date input blocks it | Critical | Validation | Open | Backend |
| LV-008 | Leave | LV-UI-01 | "Apply for Leave" button rendered unconditionally, not permission-gated | Medium | UI | Open | Frontend |
| LV-009 | Leave | LV-UI-11 | Date-picker minimum hardcoded to a fixed literal date (`2026-01-01`), not computed from "today" | Medium | UI | Open | Frontend |
| LV-010 | Leave | LV-NG-17 | `GET /leaves` 403 is silently swallowed client-side, shows misleading empty state instead of an error | Low | UI | Open | Frontend |
| LV-011 | Leave | LV-VD-06 | `reason` field accepts unbounded-length text, no max-length validation anywhere | Low | Validation | Open | Backend |
| PR-001 | Payroll | PR-FN-14 | Cancel-run success toast reads "Run canceld" (typo) | Low | UI | Open | Frontend |
| PR-002 | Payroll | PR-SC-01 | Payroll run CSV export includes bank_account_number/bank_ifsc_code/bank_upi_id in full plaintext, no masking | Critical | Security | Open | Backend |
| PR-003 | Payroll | PR-NG-06, PR-BD-03 | `ctc_annual` accepts a negative value — Zod has no floor, only the DB CHECK constraint rejects it | Medium | Validation | Open | Backend |
| PR-004 | Payroll | PR-VD-04 | `effective_from` accepts a non-date string — passes Zod, fails only at the SQL DATE cast (unhandled error, not a friendly 400) | Medium | Validation | Open | Backend |
| PR-005 | Payroll | PR-NG-22 | `percent_of_component` salary component accepts a missing `base_component_id` — not caught by Zod | Medium | Validation | Open | Backend |
| PR-006 | Payroll | PR-VD-03 | Duplicate `component_id` within one structure-components-replace request is not deduped/rejected | Medium | Validation | Open | Backend |
| PR-007 | Payroll | PR-NG-04, PR-VD-08 | `min_amount` > `max_amount` accepted for salary grades — no cross-field Zod refinement | Medium | Validation | Open | Backend |
| PR-008 | Payroll | PR-VD-09, PR-VD-10 | `payroll_settings` blob has no schema validation at all — wrong types and invalid enum values accepted verbatim | High | Validation | Open | Backend |
| PR-009 | Payroll | PR-VD-06 | Overtime `hours` field accepts a non-numeric string — no numeric-format check | Medium | Validation | Open | Backend |
| PR-010 | Payroll | PR-BD-02, PR-VD-05 | `POST /api/payroll/runs` `period_year`/`period_month` has no bounds or type-format validation | Medium | Validation | Open | Backend |
| PR-011 | Payroll | PR-UI-07 | Overtime action list on the client doesn't exclude the approver's own Pending entries (server-side 403 only) | Medium | UI | Open | Frontend |
| CP-001 | Company Profile Settings | CP-NG-08, CP-NG-09, CP-SC-01 | `POST /api/settings/bulk` accepts any key not in the 4-entry `KEY_PERMISSION` map with zero permission check, for any authenticated user | Critical | Security | Open | Backend |
| CP-002 | Company Profile Settings | CP-NG-06 | `currency` has a dedicated UI dropdown but no server-side enum — any string within length is accepted | Medium | Validation | Open | Backend |
| CP-003 | Company Profile Settings | CP-NG-07 | `date_format` has a dedicated UI dropdown but no server-side enum — any string within length is accepted | Medium | Validation | Open | Backend |
| CP-004 | Company Profile Settings | CP-NG-11 | `attendance_link` accepts any value (including a `javascript:` URI) with zero validation | Low | Validation | Open | Backend |
| CP-005 | Company Profile Settings | CP-SC-05 | `currency` is purely decorative — no payroll/payslip code path anywhere reads `tenants.currency` | Medium | Business Logic | Open | Backend |
| CP-006 | Company Profile Settings | CP-UI-05 | Logo upload's `accept="image/*"` is cosmetic only — a non-image file under 300KB is accepted and persisted as `logo_url` with zero server-side content-type validation | Medium | Validation | Open | Full Stack |
| CP-007 | Company Profile Settings | CP-UI-07 | Button `contrastText` is hardcoded white regardless of the configured primary theme color's lightness — a pale brand color produces low-contrast button text | Low | UI | Open | Frontend |
| CD-001 | Company Documents | CD-BD-01 | A file exactly at the advertised 20MB upload limit is REJECTED, not accepted — the effective limit is one byte short of `MAX_FILE_SIZE_BYTES` | Medium | Validation | Open | Backend |
| CD-002 | Company Documents | CD-NG-12 | `expiry_date` earlier than `effective_date` is accepted with no cross-field validation | Medium | Validation | Open | Backend |
| CD-003 | Company Documents | CD-NG-13, CD-VD-05 | `effective_date`/`expiry_date` accept non-date strings, passing Zod and failing only at the SQL layer with an unhandled error | Medium | Validation | Open | Backend |
| CD-004 | Company Documents | CD-SC-04 | Upload only checks file extension, never actual content/magic bytes — a non-PDF file renamed to `.pdf` is accepted | Medium | Security | Open | Backend |
| CD-005 | Company Documents | CD-UI-04, CD-UI-05 | The upload dialog's file-type restriction and file-size pre-check are both client-side only — any file reaches the network and relies entirely on the server's (correct) rejection | Low | UI | Open | Frontend |
| CD-006 | Company Documents | CD-NG-11 | An empty visibility object (`{}`) is accepted for a new document — it's invisible to everyone except the manage-holder's own admin list, which still shows it with no indication it's unreachable | Low | UI | Open | Frontend |
| CD-007 | Company Documents | CD-SC-05, CD-PM-02 | `company-documents.view` has zero functional effect anywhere in the codebase — confirmed by static code reading | Medium | Security | Open | Backend |
| CD-008 | Company Documents | CD-SC-06 | No storage-usage tracking or enforcement exists against a tenant's `subscription_plans.storage_limit_mb` — uploads can exceed the configured plan limit indefinitely | Medium | Business Logic | Open | Backend |
| CD-009 | Company Documents | CD-SC-07 | `DELETE /:id`'s on-disk file removal swallows filesystem errors silently (`fs.unlink(..., () => {})`) — a failed delete can leave an orphaned file with no error surfaced anywhere | Low | Data Integrity | Open | Backend |

---

## 3. Detailed Defect Descriptions

### Employee Master

#### EM-001 — Aadhaar/PAN rendered fully unmasked to any privileged viewer
- **Related CSV Test ID(s):** EM-SC-01 (also touches EM-FN-10, EM-UI-14)
- **Description:** When a privileged caller (e.g. admin, holding `users.pii.manage`) views another employee's profile, the Aadhaar and PAN numbers are displayed in full plaintext — there is no partial masking (e.g. `****9098`) anywhere in the UI or API response.
- **Expected Behaviour:** Sensitive national-ID numbers should not be fully exposed even to an authorized viewer — some form of masking is the expected security posture (per CSV row EM-SC-01).
- **Actual Behaviour:** The test explicitly asserts the full, unmasked Aadhaar and PAN strings ARE visible on the profile page, proving no masking exists anywhere.
- **Severity:** High — PII exposure/compliance risk; not Critical because access control itself is correctly enforced elsewhere (non-privileged callers get zero data, not masked data).
- **Category:** Security / Data Integrity
- **Evidence:** `e2e/tests/employee-detail-profile.spec.ts:58-70` (test `EM-FN-10 / EM-UI-14 / EM-SC-01`; assertions lines 68-69 assert full Aadhaar/PAN values visible); CSV `docs/EmployeeMaster_TestCases.csv` row EM-SC-01.
- **Suggested Owner:** Full Stack (masking belongs in the API response layer; frontend needs a reveal-on-demand affordance if masking is added).

#### EM-002 — Banking fields have no server-side format validation
- **Related CSV Test ID(s):** EM-VD-05
- **Description:** The banking-information save endpoint accepts obviously malformed values — letters in an account number, a bogus IFSC string, a nonsense UPI ID — with no regex/format check on the server.
- **Expected Behaviour:** CSV row EM-VD-05 documents the gap directly: format/regex validation for these fields should exist server-side.
- **Actual Behaviour:** Submitting `accountNumber: 'NOT-A-NUMBER-!!'`, `ifsc: 'not-an-ifsc'`, `upi: 'not-a-upi-id'` succeeds with a "Banking information saved" confirmation — no rejection at all.
- **Severity:** Medium — no security exposure, but bad banking data can silently break downstream payroll disbursement.
- **Category:** Validation
- **Evidence:** `e2e/tests/pii-banking.spec.ts:93-108` (test `EM-VD-05: banking fields have no server-side format validation (confirmed gap)`); `e2e/fixtures/test-data.ts:112-119` (`INVALID_BANKING_SAMPLE`); CSV row EM-VD-05.
- **Suggested Owner:** Backend (`userBankingUpdateSchema` needs IFSC/account-number/UPI format regexes).

#### EM-003 — Date fields accept non-date strings, no format validation
- **Related CSV Test ID(s):** EM-VD-12 (API-confirmed), EM-BD-06 (same underlying schema gap, corroborating only)
- **Description:** `userCreateSchema`'s `joining_date` field has no real-date-format check — any non-empty string is accepted. The same schema pattern applies to `date_of_birth`.
- **Expected Behaviour:** Date-typed business fields should be validated as real, well-formed dates server-side.
- **Actual Behaviour:** A direct `POST /api/users` call with `joining_date: 'not-a-real-date'` returns HTTP 200 (accepted), proving no date-format validation exists for this field at the schema level.
- **Severity:** Medium — data-integrity risk: garbage date values can silently corrupt tenure/probation calculations, reports, and payroll period logic downstream.
- **Category:** Validation / Data Integrity
- **Evidence:** `e2e/tests/employee-creation.spec.ts:255-262` (test `EM-VD-12`, direct API call asserted at line 261 to return 200); corroborating boundary case `e2e/tests/employee-creation.spec.ts:196-220` (EM-BD-06 — not independently conclusive on its own since it's gated by a native `<input type="date">` in the browser); CSV rows EM-VD-12, EM-BD-06.
- **Suggested Owner:** Backend (`userCreateSchema`/`userUpdateSchema` need a real date-format check on `joining_date`/`exit_date`/`date_of_birth`).

---

### Attendance

#### AT-001 — "2nd Saturday off" is hardcoded, ignoring the tenant's configurable setting
- **Related CSV Test ID(s):** ATE-RG-03
- **Description:** `AttendancePage.tsx`'s calendar always shades the 2nd Saturday of the month as an off-day regardless of what the tenant's `nth_saturdays_off` setting is actually configured to.
- **Expected Behaviour:** After reconfiguring the tenant to 1st & 3rd Saturday off (not 2nd), the calendar should stop marking the 2nd Saturday as off.
- **Actual Behaviour:** The calendar still renders the 2nd Saturday with off-day styling after the setting was changed and saved successfully.
- **Severity:** Medium — visual/business-rule disagreement across calendar, AppShell popup, and Settings copy; not a security or data-corruption issue.
- **Category:** Business Logic / UI
- **Evidence:** `e2e/tests/attendance-history-calendar.spec.ts:97-127`; `docs/Attendance_E2E_TestCases.csv:34`; `docs/Attendance_AutomationDesign.md` §3 rule 15, §10 edge case 5.
- **Suggested Owner:** Frontend

#### AT-002 — Attendance Policy delete has no in-use guard
- **Related CSV Test ID(s):** ATE-RG-05
- **Description:** Shifts and Work Modes both correctly 409 when deletion is attempted while referenced/assigned. Attendance Policies do not — deletion of a policy actively assigned to an employee succeeds outright.
- **Expected Behaviour:** Consistent with Shifts (AT-NG-13) and Work Modes (AT-NG-14), delete of an in-use Attendance Policy should be blocked.
- **Actual Behaviour:** "Policy deleted" toast appears and the row is removed even though it was actively assigned to an employee at the time.
- **Severity:** High — silently strips an employee's assigned policy (degrading them to Manual-only check-in) with no confirmation of downstream impact to the admin.
- **Category:** Business Logic / Data Integrity
- **Evidence:** `e2e/tests/attendance-policies.spec.ts:86-109`; `docs/Attendance_E2E_TestCases.csv:36`; `docs/Attendance_AutomationDesign.md` §4 CRUD matrix, §10 edge case 6.
- **Suggested Owner:** Backend

#### AT-003 — Attendance Policies / Work Modes admin screens have no client-side permission gate
- **Related CSV Test ID(s):** ATE-PM-04, ATE-PM-07
- **Description:** `ShiftsPage` correctly hides "New Shift" via `hasPermission('shifts.manage')`. `AttendancePoliciesPage` and `WorkModesPage` render New/Edit/Delete/Assign controls unconditionally — confirmed by reading both components, no `hasPermission` gate exists on either.
- **Expected Behaviour:** A persona lacking `attendance.policy.manage`/`work-modes.manage` should see no actionable CRUD controls (matching Shifts' pattern).
- **Actual Behaviour:** Fully clickable controls render regardless of permission; only a server-side 403 on click reveals the gap.
- **Severity:** Medium — not an actual access-control bypass (server enforces correctly), but misleading affordances and inconsistent with Shifts' correct pattern.
- **Category:** Security / UI
- **Evidence:** `e2e/tests/attendance-permissions.spec.ts:8-24, 71-73` (ATE-PM-04/07 currently `test.skip()`'d as unautomatable from the UI for this exact reason); `docs/Attendance_AutomationDesign.md` §6.
- **Suggested Owner:** Frontend

#### AT-004 — Attendance Policy form doesn't adapt fields to `policy_type`
- **Related CSV Test ID(s):** ATE-VD-07
- **Description:** The allowed-methods checklist and geofence lat/lng/radius fields render identically for every `policy_type` (e.g. Field Staff vs Office Only) — no type-conditional logic exists in `AttendancePolicyFormDialog.tsx`.
- **Expected Behaviour:** Fields should adjust sensibly per policy type.
- **Actual Behaviour:** Identical field visibility confirmed for both Field Staff and Office Only.
- **Severity:** Low — UX/data-quality gap, not access-control or corruption risk.
- **Category:** UI / Business Logic
- **Evidence:** `e2e/tests/attendance-policies.spec.ts:128-144`; `docs/Attendance_E2E_TestCases.csv:82`.
- **Suggested Owner:** Frontend

#### AT-005 — "Assign default Work Mode to employee" has an API but no reachable UI
- **Related CSV Test ID(s):** ATE-PS-16, AT-FN-15
- **Description:** `client/src/api/workModes.ts` exposes an assign call, but no page component anywhere invokes it — confirmed absent by source inspection.
- **Expected Behaviour:** Admin should be able to assign a default Work Mode via some UI flow with persistence confirmation.
- **Actual Behaviour:** No UI entry point exists anywhere in the app to perform this action.
- **Severity:** Medium — a documented CRUD capability is effectively unusable by any real end user.
- **Category:** Business Logic (functional gap)
- **Evidence:** `e2e/tests/work-modes.spec.ts:74-75` (`test.skip` comment); `docs/Attendance_E2E_TestCases.csv:25`.
- **Suggested Owner:** Frontend

#### AT-006 — `admin` persona's effective RBAC state is non-deterministic across time
- **Related CSV Test ID(s):** contextually ATE-SM-04, ATE-SM-06
- **Description:** Confirmed live during two separate verification runs minutes apart: `admin` held `shifts.manage`/`attendance.policy.manage` in one run and did not in a later run, with no explicit role/permission change made in between.
- **Expected Behaviour:** A fixed persona's effective permissions should be stable between runs absent an explicit administrative change.
- **Actual Behaviour:** Permissions observably flip, causing dependent UI to appear/disappear inconsistently; root mechanism (session/JWT staleness vs. actual role-data drift) is unconfirmed.
- **Severity:** High — RBAC state should never be non-deterministic; the reasoning is precautionary since the underlying cause is unconfirmed, but the symptom itself is a real risk regardless of cause.
- **Category:** Security / Business Logic
- **Evidence:** `e2e/FRAMEWORK_TECH_DEBT.md:25-29` (entry C3); guard sites throughout `e2e/tests/shifts.spec.ts` and `e2e/tests/attendance-policies.spec.ts`.
- **Suggested Owner:** Backend (RBAC/session/JWT layer)

#### AT-007 — No validation blocks configuring all 7 days as Weekly Off Days
- **Related CSV Test ID(s):** ATE-BD-08
- **Description:** Settings → Attendance tab accepts and saves a state where every weekday is checked as a weekly off day, with no validation anywhere in the stack blocking it.
- **Expected Behaviour:** CSV explicitly calls out this needs a decision — either block it or document it as intentional.
- **Actual Behaviour:** Save succeeds with zero warning for a fully-off work week.
- **Severity:** Low.
- **Category:** Validation
- **Evidence:** `e2e/tests/attendance-rules-settings.spec.ts:42-60`; `docs/Attendance_E2E_TestCases.csv:63`.
- **Suggested Owner:** Full Stack

#### AT-008 — Edit/Delete icon buttons have no accessible name
- **Related CSV Test ID(s):** none direct
- **Description:** The Assign button in the Attendance Policies grid carries a native `title` attribute; Edit and Delete do not — they're only reachable by fixed positional order.
- **Expected Behaviour:** All action buttons should have a discoverable accessible name, consistent with Assign's own pattern.
- **Actual Behaviour:** Only Assign has one.
- **Severity:** Low (accessibility/discoverability).
- **Category:** UI
- **Evidence:** `e2e/pages/AttendancePoliciesPage.ts:19-25, 50-56`; `e2e/FRAMEWORK_TECH_DEBT.md:129-133` (entry L1).
- **Suggested Owner:** Frontend

---

### Leave Management

#### LV-001 — `is_half_day` datatype handling (pre-existing known issue, carried forward)
- **Related CSV Test ID(s):** LV-FN-13, LV-UI-05, LV-VD-02
- **Description:** The client sends `is_half_day` as the number `1`/`0`; the Zod schema accepts either `z.boolean()` or `z.number()`; the repository insert casts with `!!data.is_half_day` into a `sql.Bit` column. This tri-layer type juggling is the shape of defect `e2e/KNOWN_AUTOMATION_AND_PRODUCT_ISSUES.md` originally flagged as `LV-P0-001` ("Leave request fails — `is_half_day` datatype mismatch").
- **Expected Behaviour:** A half-day leave request is accepted and always counted as exactly 0.5 day, regardless of whether `1`/`0` or `true`/`false` is sent.
- **Actual Behaviour:** In the current codebase, the tests exercising this path (LV-FN-13, LV-UI-05) currently **pass** — suggesting the repository-layer coercion may already mitigate the originally-flagged failure. No currently-failing test proves the datatype mismatch still causes "Leave request fails."
- **Severity:** Critical (carried forward from the existing register pending explicit reconfirmation) — if it still reproduces via a path not exercised by this suite, a request that silently fails to record is a core-workflow blocker.
- **Category:** Data Integrity / API
- **Evidence:** `e2e/tests/leave-balance.spec.ts:61-101` (LV-FN-13); `e2e/tests/leave-application.spec.ts:229-244` (LV-UI-05); `server/schemas/index.js:15`; `server/repositories/leaves.repository.js:75`; original flag `e2e/KNOWN_AUTOMATION_AND_PRODUCT_ISSUES.md:16`.
- **Suggested Owner:** Backend
- **⚠️ Action needed:** This is the one entry in this register whose *current* reproducibility could not be independently reconfirmed from passing/failing test evidence alone — recommend a human explicitly re-verify against the original `LV-P0-001` report before closing or downgrading it.

#### LV-002 — Probation Earned/Paid block matches on substring
- **Related CSV Test ID(s):** LV-NG-04
- **Description:** The server computes `isEarned = type.toLowerCase().includes('earned') || type.toLowerCase().includes('paid')`. A custom leave type named "Unpaid" contains the substring "paid," so it is wrongly treated as Earned/Paid and blocked during probation — the opposite of its intended meaning.
- **Expected Behaviour:** Only genuine Earned/Paid leave types should be blocked during probation.
- **Actual Behaviour:** Applying for a leave type named "Unpaid" during an active probation window is blocked with the toast "Earned/Paid Leave is not available during your probation period."
- **Severity:** High — incorrectly blocks a legitimate, unrelated leave benefit for probationary employees; a naming-collision bug in core business logic.
- **Category:** Business Logic / Validation
- **Evidence:** `e2e/tests/leave-probation.spec.ts:45-60`; root cause `server/routes/leaves.routes.js:82`; CSV row LV-NG-04.
- **Suggested Owner:** Backend

#### LV-003 — Self-approval: `leaves.approve` carries no ownership/manager-relationship check
- **Related CSV Test ID(s):** LV-NG-18, LV-SC-01, LV-SC-02, LV-PM-03
- **Description:** `PATCH /leaves/:id` only checks `permissions.includes('leaves.approve')` for the approve/reject branch — there is no comparison between the leave's owner and the requester, and no manager-relationship scoping at all.
- **Expected Behaviour:** Approval should require either a manager-relationship or, at minimum, that the approver is not the leave's own owner.
- **Actual Behaviour:** The `manager` persona applies for their own leave, then approves it themselves; the PATCH returns `200 {"success": true}` and the UI shows "Leave approved successfully!" — self-approval succeeds identically to approving anyone else's leave.
- **Severity:** Critical — a governance/segregation-of-duties bypass; any employee holding a tenant-wide approval permission can unilaterally approve their own leave with no check.
- **Category:** Security
- **Evidence:** `e2e/tests/leave-list-approval.spec.ts:126-155`; root cause `server/routes/leaves.routes.js:178-188` (no ownership check before `updateLeaveStatus`); CSV rows LV-NG-18, LV-SC-01, LV-SC-02, LV-PM-03.
- **Suggested Owner:** Backend

#### LV-004 — Cancelling an already-started/completed Approved leave succeeds server-side
- **Related CSV Test ID(s):** LV-NG-19
- **Description:** The "can't cancel a leave that's already begun" rule is enforced only by the client's `start_date >= today` dropdown filter. The server's `cancelLeave()` guards only on `status IN ('Pending','Approved')`, with no date check at all.
- **Expected Behaviour:** A leave that has already started (or finished) should not be cancellable.
- **Actual Behaviour:** A past-dated (already-started/completed) leave is confirmed absent from the UI dropdown, but the identical PATCH issued directly returns `200 {"success": true, "status": "Cancelled"}`.
- **Severity:** High — allows retroactively cancelling leave that's already been taken, which can corrupt attendance/payroll records for a period already processed.
- **Category:** Business Logic / Validation
- **Evidence:** `e2e/tests/leave-cancellation.spec.ts:97-133`; root cause `server/repositories/leaves.repository.js:94-104`; CSV row LV-NG-19.
- **Suggested Owner:** Backend

#### LV-005 — Concurrent overlapping leave applications both succeed (race condition)
- **Related CSV Test ID(s):** LV-NG-20, LV-DB-03
- **Description:** `hasOverlappingLeave()` is a plain SELECT with no locking or transactional isolation around the subsequent INSERT. Two identical/overlapping requests fired concurrently can both read "no overlap yet" before either commits.
- **Expected Behaviour:** Only one of two concurrent, identical-date overlapping requests for the same user should succeed (matching the already-correct sequential-case behavior).
- **Actual Behaviour:** Two concurrent `POST /leaves` calls with identical payloads (via `Promise.all`) both return success, and a follow-up GET shows 2 separate overlapping rows persisted.
- **Severity:** High — a genuine data-integrity gap (duplicate/overlapping leave records, double balance consumption) exploitable simply by a double-click or retried request under normal network conditions.
- **Category:** Data Integrity
- **Evidence:** `e2e/tests/leave-application.spec.ts:159-184`; root cause `server/repositories/leaves.repository.js:134-146` (no locking/unique constraint); CSV rows LV-NG-20, LV-DB-03.
- **Suggested Owner:** Backend

#### LV-006 — `GET /api/settings` has no read-side permission guard
- **Related CSV Test ID(s):** LV-SC-03
- **Description:** `settings.routes.js`'s `GET /` applies no permission check whatsoever — only the `POST /bulk` write path checks per-key permissions.
- **Expected Behaviour:** Reading `leave_allocations` (and other settings keys) should require at least an equivalent read scope, matching the write-side gating.
- **Actual Behaviour:** The `hrDirectory` persona (holding neither `leaves.*` nor `general.settings.*`) loads `/leaves`; the balance cards, sourced from this same unguarded `GET /settings` call, render the tenant's real configured allocation data.
- **Severity:** Critical — unauthenticated-by-permission exposure of tenant-wide configuration data to any logged-in user, regardless of role.
- **Category:** Security
- **Evidence:** `e2e/tests/leave-settings.spec.ts:54-62`; root cause `server/routes/settings.routes.js:21-32`; CSV row LV-SC-03.
- **Suggested Owner:** Backend

#### LV-007 — `end_date < start_date` accepted server-side
- **Related CSV Test ID(s):** LV-NG-10
- **Description:** Neither `leaveApplySchema` nor the `POST /leaves` route ever compares `start_date` and `end_date`. The only protection is the browser's native `<input type="date" min={startDate}>` constraint.
- **Expected Behaviour:** The server should reject a request where `end_date` precedes `start_date`.
- **Actual Behaviour:** The client-side HTML5 constraint blocks submission in the browser; direct source review of the schema and route confirms no server-side comparison exists at all.
- **Severity:** Critical — reachable via any non-browser client (a different frontend, a future API integration, a replayed/modified request); a negative/zero day count would silently corrupt balance-used math with no DB constraint to catch it.
- **Category:** Validation
- **Evidence:** `e2e/tests/leave-application.spec.ts:137-157`; direct code confirmation `server/schemas/index.js:9-17`, `server/routes/leaves.routes.js:63-151`; CSV row LV-NG-10.
- **Suggested Owner:** Backend
- **Note:** A genuinely conclusive fix-verification would need a new direct-API test bypassing the browser guard (does not currently exist) — see §9.

#### LV-008 — "Apply for Leave" button rendered unconditionally
- **Related CSV Test ID(s):** LV-UI-01
- **Description:** The button is rendered regardless of `hasPermission('leaves.apply.own')`/`.any`; only the eventual server-side check blocks submission afterward with a 403.
- **Expected Behaviour:** The button should be hidden/disabled for a persona holding neither apply permission.
- **Actual Behaviour:** The button is visible for `hrDirectoryPage` (a persona lacking apply permissions).
- **Severity:** Medium — not exploitable (server independently blocks it), but a confirmed UX/permission-gating defect.
- **Category:** UI
- **Evidence:** `e2e/tests/leave-list-approval.spec.ts:109-113`; CSV row LV-UI-01.
- **Suggested Owner:** Frontend

#### LV-009 — Date-picker minimum hardcoded to a fixed literal date
- **Related CSV Test ID(s):** LV-UI-11
- **Description:** `LeavesPage.tsx` hardcodes the Start/End Date fields' `min` attribute to the literal string `'2026-01-01'` rather than deriving it from the current date.
- **Expected Behaviour:** The minimum selectable date should track "today."
- **Actual Behaviour:** The field's `min` attribute is confirmed to literally be `2026-01-01`.
- **Severity:** Medium — a maintenance time-bomb (becomes meaningless/wrong once past that date) and currently allows freely picking past dates.
- **Category:** UI / Validation
- **Evidence:** `e2e/tests/leave-application.spec.ts:260-266`; `client/src/pages/LeavesPage.tsx:385`; CSV row LV-UI-11.
- **Suggested Owner:** Frontend

#### LV-010 — `GET /leaves` 403 silently swallowed, misleading empty state shown
- **Related CSV Test ID(s):** LV-NG-17
- **Description:** A 403 from `GET /leaves` (persona lacking any `leaves.view.*` permission) is caught by a bare try/catch that only logs to console, so the UI falls back to its normal empty-list rendering.
- **Expected Behaviour:** A permission failure should be distinguishable to the user from "you simply have no leave records."
- **Actual Behaviour:** The persona instead sees the literal "No leave records found" empty-state message.
- **Severity:** Low — no security impact (server correctly returns 403), but a confirmed error-handling/UX defect.
- **Category:** UI
- **Evidence:** `e2e/tests/leave-list-approval.spec.ts:103-107`; CSV row LV-NG-17.
- **Suggested Owner:** Frontend

#### LV-011 — `reason` field accepts unbounded-length text
- **Related CSV Test ID(s):** LV-VD-06
- **Description:** The `reason` column is `NVARCHAR(MAX)` with no schema-level or DB-level length constraint.
- **Expected Behaviour:** A reasonable maximum length should be enforced.
- **Actual Behaviour:** An ~11,500-character reason string is accepted and the leave is successfully recorded.
- **Severity:** Low — not currently exploited or breaking anything, but a minor data-hygiene/potential-abuse gap.
- **Category:** Validation
- **Evidence:** `e2e/tests/leave-application.spec.ts:246-258`; CSV row LV-VD-06.
- **Suggested Owner:** Backend

---

### Payroll & Salary Grades

#### PR-001 — Cancel-run success toast reads "Run canceld" (typo)
- **Related CSV Test ID(s):** PR-FN-14
- **Description:** `PayrollRunDetailPage.tsx` derives its action-confirmation toast text via `${action}+'d'`, which happens to spell "processed"/"approved"/"marked paid" correctly but produces the literal string "canceld" (missing an "l") for the cancel action.
- **Expected Behaviour:** The toast should read "Run cancelled."
- **Actual Behaviour:** The toast reads "Run canceld."
- **Severity:** Low — cosmetic only, no functional impact.
- **Category:** UI
- **Evidence:** `e2e/tests/payroll-runs-lifecycle.spec.ts` (test `PR-FN-14`, confirmed live during the Payroll Framework Stabilization pass — see `e2e/FRAMEWORK_TECH_DEBT.md`'s "Fixed in the Payroll Framework Stabilization pass" section).
- **Suggested Owner:** Frontend

#### PR-002 — Payroll run CSV export includes banking PII in full plaintext
- **Related CSV Test ID(s):** PR-SC-01
- **Description:** `GET /api/payroll/runs/:id/export` (via `payrollExport.service.js`'s GENERIC_CSV format) includes each employee's account number and IFSC code as plain, unmasked text under human-readable headers ("Account Number", "IFSC Code").
- **Expected Behaviour:** Exported banking data should be masked or otherwise protected, not exposed in full plaintext in a downloadable file.
- **Actual Behaviour:** The account number this test itself set is present verbatim, unmasked, in that employee's export row.
- **Severity:** Critical — a real financial-PII exposure/compliance risk in a downloadable, potentially-forwarded file; access control being correct elsewhere doesn't mitigate the exposure once the file leaves the system.
- **Category:** Security
- **Evidence:** `e2e/tests/payroll-security-permissions.spec.ts:27-50` (test `PR-SC-01`); CSV row PR-SC-01.
- **Suggested Owner:** Backend (`payrollExport.service.js` needs masking/redaction, or the export should require a stricter, dedicated permission).

#### PR-003 — `ctc_annual` accepts a negative value
- **Related CSV Test ID(s):** PR-NG-06, PR-BD-03
- **Description:** `payrollAssignmentSchema` has no floor on `ctc_annual` — only the database's own `CHECK (ctc_annual >= 0)` constraint rejects a negative value, surfacing as a raw unhandled DB error rather than a friendly 400.
- **Expected Behaviour:** A negative CTC should be rejected with a clean 400 validation error at the API layer.
- **Actual Behaviour:** The request reaches the DB and fails there; Zod never catches it.
- **Severity:** Medium — data-integrity/API-quality issue (unfriendly error surface), not directly exploitable since the DB constraint does ultimately prevent bad data from persisting.
- **Category:** Validation
- **Evidence:** `e2e/tests/payroll-salary-assignments.spec.ts:55-68` (PR-NG-06), `:71-90` (PR-BD-03 boundary case); `e2e/tests/payroll-not-automatable.spec.ts:21` (PR-DB-03, confirming the same gap at the raw-DB layer); CSV rows PR-NG-06, PR-BD-03.
- **Suggested Owner:** Backend (add a `.nonnegative()`/`.min(0)` refinement to `payrollAssignmentSchema`).

#### PR-004 — `effective_from` accepts a non-date string
- **Related CSV Test ID(s):** PR-VD-04
- **Description:** `payrollAssignmentSchema` only checks `effective_from` for minimum string length, not actual date format — an arbitrary non-date string passes Zod and fails only when the SQL layer attempts the DATE cast.
- **Expected Behaviour:** A non-date `effective_from` value should be rejected with a friendly 400 at the API layer.
- **Actual Behaviour:** The request reaches the SQL layer and surfaces as an unhandled error there instead.
- **Severity:** Medium — same class of issue as PR-003 (schema too permissive, unfriendly error surface).
- **Category:** Validation
- **Evidence:** `e2e/tests/payroll-salary-assignments.spec.ts:129-142` (test `PR-VD-04 (confirmed gap)`); CSV row PR-VD-04.
- **Suggested Owner:** Backend (add a real date-format check, e.g. `z.string().regex(...)` or a date-parsing refinement).

#### PR-005 — `percent_of_component` salary component accepts a missing `base_component_id`
- **Related CSV Test ID(s):** PR-NG-22
- **Description:** A salary component with `calculation_type: 'percent_of_component'` logically requires a `base_component_id` (what it's a percentage of), but the schema doesn't enforce this conditional requirement — the request reaches the DB and surfaces as an unhandled error from the `CK_salary_components_base_required`/`CK_salary_components_config_required` constraints instead of a friendly validation message.
- **Expected Behaviour:** Submitting a `percent_of_component` component with no `base_component_id` should be rejected with a clean 400.
- **Actual Behaviour:** Surfaces as an unhandled DB-level error.
- **Severity:** Medium.
- **Category:** Validation
- **Evidence:** `e2e/tests/payroll-salary-components.spec.ts:117-127` (test `PR-NG-22 (confirmed gap)`); `e2e/tests/payroll-not-automatable.spec.ts:43` (PR-DB-14, confirming the same gap at the DB layer); CSV row PR-NG-22.
- **Suggested Owner:** Backend (add a Zod `.refine()` conditionally requiring `base_component_id` when `calculation_type === 'percent_of_component'`).

#### PR-006 — Duplicate `component_id` within one structure-components-replace request not deduped
- **Related CSV Test ID(s):** PR-VD-03
- **Description:** `structureComponentsReplaceSchema` performs no deduplication on its `items` array — a duplicate `component_id` within one `PUT /structures/:id/components` request reaches the DB and surfaces as an unhandled error from the `UQ_salary_structure_components` constraint.
- **Expected Behaviour:** A duplicate `component_id` in the same request should be rejected with a friendly 400.
- **Actual Behaviour:** Surfaces as an unhandled DB-level error.
- **Severity:** Medium.
- **Category:** Validation
- **Evidence:** `e2e/tests/payroll-salary-structures.spec.ts:105-121` (test `PR-VD-03 (confirmed gap)`); `e2e/tests/payroll-not-automatable.spec.ts:45` (PR-DB-15, confirming the same gap at the DB layer); CSV row PR-VD-03.
- **Suggested Owner:** Backend (add a Zod `.refine()` rejecting duplicate `component_id` values in the array).

#### PR-007 — `min_amount` > `max_amount` accepted for salary grades
- **Related CSV Test ID(s):** PR-NG-04, PR-VD-08
- **Description:** No cross-field Zod refinement compares `min_amount` and `max_amount` on salary grade creation — an inverted range reaches the DB and surfaces as an unhandled error rather than a friendly 400.
- **Expected Behaviour:** `min_amount > max_amount` should be rejected with a clean validation error.
- **Actual Behaviour:** Surfaces as an unhandled DB-level error.
- **Severity:** Medium.
- **Category:** Validation
- **Evidence:** `e2e/tests/payroll-salary-grades.spec.ts:79-93` (test `PR-NG-04 / PR-VD-08 (confirmed gap)`); `e2e/tests/payroll-not-automatable.spec.ts:17` (PR-DB-01, confirming the same gap at the DB layer); CSV rows PR-NG-04, PR-VD-08.
- **Suggested Owner:** Backend (add a Zod `.refine()` enforcing `min_amount <= max_amount`, and similarly for `mid_amount` if applicable).

#### PR-008 — `payroll_settings` blob has no schema validation at all
- **Related CSV Test ID(s):** PR-VD-09, PR-VD-10
- **Description:** `settingsBulkSchema` performs zero shape/type/range validation on the `payroll_settings` key. Wrong-typed values (`ot_rate_multiplier: 'not-a-number'`, `standard_monthly_hours: -50`) are accepted and stored verbatim; an unrecognized `rounding_rule` enum value (`'round_to_nearest_prime'`) is likewise stored as-is and silently falls through to the default rounding branch at computation time, with no error or warning anywhere.
- **Expected Behaviour:** `payroll_settings` fields should be schema-validated for type, range, and (for `rounding_rule`) enum membership.
- **Actual Behaviour:** Any shape is accepted and persisted; invalid values silently affect payroll computation later with no diagnostic trail.
- **Severity:** High — this is tenant-wide configuration that directly drives real payroll math; garbage values persisting silently (and only manifesting as a wrong number downstream, with no error at the point of misconfiguration) is a meaningfully worse risk than the per-record validation gaps above.
- **Category:** Validation
- **Evidence:** `e2e/tests/payroll-settings.spec.ts:46-64` (tests `PR-VD-09 (confirmed gap)` and `PR-VD-10`); CSV rows PR-VD-09, PR-VD-10.
- **Suggested Owner:** Backend (add a proper Zod schema for the `payroll_settings` shape, including a `z.enum(...)` for `rounding_rule`).

#### PR-009 — Overtime `hours` field accepts a non-numeric string
- **Related CSV Test ID(s):** PR-VD-06
- **Description:** `overtimeEntrySchema` has no numeric-format check on `hours` — a non-numeric string is not caught by Zod.
- **Expected Behaviour:** A non-numeric `hours` value should be rejected with a friendly 400.
- **Actual Behaviour:** Not rejected by Zod (only the DB's `CHECK (hours > 0 AND hours <= 24)` provides any floor/ceiling, and only for values that coerce to a comparable number).
- **Severity:** Medium.
- **Category:** Validation
- **Evidence:** `e2e/tests/payroll-overtime.spec.ts:124-138` (test `PR-VD-06 (confirmed gap)`); `e2e/tests/payroll-not-automatable.spec.ts:39` (PR-DB-12, confirming the same gap at the DB layer); CSV row PR-VD-06.
- **Suggested Owner:** Backend (add `z.coerce.number()` or an explicit numeric-format check to `overtimeEntrySchema`).

#### PR-010 — `POST /api/payroll/runs` `period_year`/`period_month` has no bounds or type validation
- **Related CSV Test ID(s):** PR-BD-02, PR-VD-05
- **Description:** `payrollRunCreateSchema` accepts `period_year`/`period_month` via `z.union([z.string(), z.number()])` with no numeric-format or range check. An extreme/negative `period_year` is accepted (only overflowing SQL Server's own DATE range at 99999 produces an unhandled 500, not a validation error); non-numeric strings (`'not-a-year'`, `'not-a-month'`) also pass through, since the route's own manual range check (`periodMonth < 1 || periodMonth > 12`) silently passes on `NaN` (every `NaN` comparison is `false`).
- **Expected Behaviour:** `period_year`/`period_month` should have explicit bounds checks and reject non-numeric input with a friendly 400.
- **Actual Behaviour:** Both extreme values and non-numeric strings pass through with no validation error.
- **Severity:** Medium — a garbage payroll run at an absurd period is a nuisance/data-hygiene issue more than an active corruption risk, since it doesn't collide with real data by construction (per this suite's own test-data design), but it's still a real, unhandled input-validation gap.
- **Category:** Validation
- **Evidence:** `e2e/tests/payroll-runs-lifecycle.spec.ts:296-312` (tests `PR-BD-02 (confirmed gap)` and `PR-VD-05`); `e2e/tests/payroll-not-automatable.spec.ts:29` (PR-DB-07, confirming the app-reachable half of this gap); CSV rows PR-BD-02, PR-VD-05.
- **Suggested Owner:** Backend (add explicit numeric coercion + range bounds to `payrollRunCreateSchema`).

#### PR-011 — Overtime action list doesn't exclude the approver's own Pending entries
- **Related CSV Test ID(s):** PR-UI-07
- **Description:** `PayrollOvertimePage.tsx` renders the Approve/Reject icons for every Pending row regardless of whether `row.user_id` matches the current viewer — no client-side self-exclusion exists. Only the server-side click handler returns a 403.
- **Expected Behaviour:** Per the CSV's documented expectation, a reviewer's own Pending entries should not offer Approve/Reject actions on the client.
- **Actual Behaviour:** Both action icons render for the caller's own Pending row; clicking either only then gets a 403 from the server.
- **Severity:** Medium — not an access-control bypass (server correctly blocks it), but a confirmed UX gap that lets a user attempt an action destined to fail.
- **Category:** UI
- **Evidence:** `e2e/tests/payroll-overtime.spec.ts:144-157` (test `PR-UI-07 (confirmed gap vs. the CSV's expected result)`); CSV row PR-UI-07.
- **Suggested Owner:** Frontend (add a client-side `row.user_id !== currentUserId` check before rendering the review icons).

### Company Profile Settings

#### CP-001 — `POST /api/settings/bulk` permission bypass for any unmapped key
- **Related CSV Test ID(s):** CP-NG-08, CP-NG-09, CP-SC-01
- **Description:** `server/routes/settings.routes.js`'s bulk-write handler checks each key in the request body against a hardcoded 4-entry `KEY_PERMISSION` map (`payroll_settings`, `attendance_rules`, `leave_allocations`, `attendance_link`). A key that ISN'T in that map has `required === undefined`, so the `if (required && !perms.has(required))` guard never fires — the write proceeds with no authorization check of any kind.
- **Expected Behaviour:** Writing to the tenant-wide `settings` table should require SOME permission, or the endpoint should reject keys it doesn't recognize, not silently accept and persist them.
- **Actual Behaviour:** A persona holding none of the four gated permissions (confirmed with the `employeeSelf` persona, which holds only `company.view`) successfully writes an arbitrary new key via `POST /api/settings/bulk`, which is then readable back via `GET /api/settings` (itself unguarded — see the note on LV-006 below). A mixed payload combining a gated key the caller lacks with an unmapped key IS rejected 403 for the whole request (the guard loop runs to completion before any write), so this is not exploitable to override one of the four gated keys — but it is a genuine, unauthenticated-scope-of-authorization write primitive into shared tenant state for ANY logged-in user.
- **Severity:** Critical — a write endpoint with no effective access control for the majority of its own key-space, reachable by the lowest-privileged persona in the tenant.
- **Category:** Security
- **Evidence:** `e2e/tests/company-profile-permissions-security.spec.ts` (tests `CP-NG-08 / CP-SC-01 (CRITICAL, confirmed gap)` and `CP-NG-09 / CP-PM-04`); `server/routes/settings.routes.js` lines 14-19 (`KEY_PERMISSION` map) and 34-42 (the guard loop); CSV rows CP-NG-08, CP-NG-09, CP-SC-01.
- **Suggested Owner:** Backend — either default-deny (reject any key absent from `KEY_PERMISSION`) or require a baseline `general.settings.manage` for every key, gated keys layering additional requirements on top.

#### CP-002 — `currency` has no server-side enum despite a fixed UI dropdown
- **Related CSV Test ID(s):** CP-NG-06
- **Description:** `companyProfileUpdateSchema` (`server/schemas/index.js`) validates `currency` with only `z.string().min(1).max(10)` — no `z.enum(CURRENCY_OPTIONS)` — even though the Company Profile tab only ever offers 8 fixed values via a `<Select>`.
- **Expected Behaviour:** A value outside the UI's own `CURRENCY_OPTIONS` list should be rejected server-side, the same way the UI never lets a user type one directly.
- **Actual Behaviour:** `PUT /api/company` with `currency: "banana"` succeeds (200) and round-trips verbatim.
- **Severity:** Medium — no security exposure, but silently permits inconsistent/nonsensical tenant configuration reachable only by bypassing the UI (direct API call).
- **Category:** Validation
- **Evidence:** `e2e/tests/company-profile-validation.spec.ts` (test `CP-NG-06 (confirmed gap)`); `server/schemas/index.js` line ~316 (`currency` field); CSV row CP-NG-06.
- **Suggested Owner:** Backend (`z.enum(['INR','USD','EUR','GBP','AUD','CAD','SGD','AED'])`, matching `client/src/pages/SettingsPage.tsx`'s `CURRENCY_OPTIONS`).

#### CP-003 — `date_format` has no server-side enum despite a fixed UI dropdown
- **Related CSV Test ID(s):** CP-NG-07
- **Description:** Same gap as CP-002, for `date_format` — schema only enforces `z.string().min(1).max(20)`, no `z.enum(DATE_FORMAT_OPTIONS)`.
- **Expected Behaviour:** A value outside `['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']` should be rejected.
- **Actual Behaviour:** `PUT /api/company` with `date_format: "not-a-format"` succeeds (200) and round-trips verbatim — and since nothing downstream re-validates this value before using it to format real dates, an invalid format string could silently break date rendering wherever it's read.
- **Severity:** Medium
- **Category:** Validation
- **Evidence:** `e2e/tests/company-profile-validation.spec.ts` (test `CP-NG-07 (confirmed gap)`); `server/schemas/index.js` line ~317 (`date_format` field); CSV row CP-NG-07.
- **Suggested Owner:** Backend (`z.enum(['DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD'])`).

#### CP-004 — `attendance_link` accepts any value with zero validation
- **Related CSV Test ID(s):** CP-NG-11
- **Description:** The `settingsBulkSchema` (`z.record(z.string(), z.unknown())`) performs no shape/format validation on any value, including `attendance_link`. A value like `javascript:alert(1)` is accepted and stored verbatim.
- **Expected Behaviour:** A field intended to hold a URL should be validated as one, or at minimum reject scheme-based XSS payload patterns.
- **Actual Behaviour:** Accepted and echoed back unchanged via `GET /api/settings`.
- **Severity:** Low — grepping `client/`/`server/` for every reference to `attendance_link` finds only this form's own read/write and an empty seed value at tenant provisioning; nothing renders it as a clickable `<a href>` anywhere, so the XSS payload has no live sink to execute in today's codebase. Still worth fixing before this field is ever wired into a real link.
- **Category:** Validation
- **Evidence:** `e2e/tests/company-profile-permissions-security.spec.ts` (test `CP-NG-11 (confirmed gap)`); CSV row CP-NG-11.
- **Suggested Owner:** Backend (a URL-shape check, or a stricter `settingsBulkSchema` per-key shape validation more generally — see CP-001's suggested fix, which would need to coexist with this).

#### CP-005 — `currency` is a purely decorative field
- **Related CSV Test ID(s):** CP-SC-05
- **Description:** The Company Profile tab presents `currency` as a meaningful configuration choice (an 8-option dropdown, prominently labeled "Locale & Financial Year"), but no payroll/payslip-generation code path anywhere reads `tenants.currency` — confirmed by grepping `server/services/payroll*.js` and `server/repositories/payroll*.js` for any reference to it.
- **Expected Behaviour:** Changing the tenant's currency should affect currency symbols/formatting somewhere downstream (payslips being the obvious candidate), or the field shouldn't imply that it does.
- **Actual Behaviour:** The value round-trips through GET/PUT `/api/company` and is never read again by anything else in the codebase.
- **Severity:** Medium — not a security or data-integrity issue, but a materially misleading piece of UI: an admin changing this field would reasonably expect it to have an effect somewhere, and it has none.
- **Category:** Business Logic
- **Evidence:** Confirmed by direct source-code reading (grep for `currency` across `server/services/` and `server/repositories/` payroll files, and `company.repository.js`) — not runtime-observable via UI/API alone, hence tracked as not-automatable in `e2e/tests/company-profile-not-automatable.spec.ts` (`CP-SC-05`); CSV row CP-SC-05.
- **Suggested Owner:** Backend/Product — either wire `currency` into payslip/report currency-symbol rendering, or explicitly scope it out of the Company Profile form with a note that it's reserved for future use.

#### CP-006 — Logo upload accepts non-image files with zero server-side type validation
- **Related CSV Test ID(s):** CP-UI-05
- **Description:** The Upload Logo control's `accept="image/*"` is a client-side filter hint only — `setInputFiles` (and any non-standard file picker) bypasses it trivially. The client does check file SIZE (`> 300KB` is rejected before any read), but never file TYPE. `companyProfileUpdateSchema`'s `logo_url` field is `z.string().max(5_000_000)` — a bare length cap, no content-type/magic-byte check of any kind.
- **Expected Behaviour:** Either the client or the server should verify the uploaded file is actually an image before accepting it as a logo.
- **Actual Behaviour:** Uploading a `.docx` file under 300KB is accepted client-side, base64-encoded into `logo_url`, and persisted via `PUT /api/company` with no rejection at any layer.
- **Severity:** Medium — no code execution risk (the value is only ever rendered inside an `<img src>`, which simply fails to display non-image data), but allows arbitrary binary data up to ~5MB to be stored disguised as a company logo, which is both a data-integrity and minor storage-abuse concern.
- **Category:** Validation
- **Evidence:** `e2e/tests/company-profile-validation.spec.ts` (test `CP-UI-05 (type bypass, confirmed gap)`); `client/src/pages/SettingsPage.tsx`'s `handleLogoUpload` (size-only check); `server/schemas/index.js`'s `logo_url` field; CSV row CP-UI-05.
- **Suggested Owner:** Full Stack (client-side MIME check via the File object's `type`, plus a server-side magic-byte check on the decoded base64 payload before persisting).

#### CP-007 — Button text contrast is hardcoded, ignoring theme lightness
- **Related CSV Test ID(s):** CP-UI-07
- **Description:** The MUI theme built from the tenant's configured `theme_primary_color` hardcodes `contrastText: '#fff'` rather than computing it from the chosen color's actual lightness.
- **Expected Behaviour:** A very pale primary color (e.g. `#fefefe`) should produce dark button text for adequate contrast, per standard WCAG-aware theme construction.
- **Actual Behaviour:** Confirmed live: setting `theme_primary_color` to `#fefefe` (near-white) and reloading, the primary "Save" button's computed text color is still `rgb(255, 255, 255)` — white-on-near-white, a WCAG contrast failure.
- **Severity:** Low — an edge case only reachable if a tenant deliberately picks an extremely pale brand color; no functional breakage, but a real accessibility gap if it happens.
- **Category:** UI
- **Evidence:** `e2e/tests/company-profile-lifecycle.spec.ts` (test `CP-UI-07 (confirmed gap)`); CSV row CP-UI-07.
- **Suggested Owner:** Frontend (compute `contrastText` from the chosen color's relative luminance, e.g. via MUI's own `getContrastRatio`/`darken`/`lighten` helpers, instead of a fixed literal).

### Company Documents

#### CD-001 — Upload rejected at exactly the advertised 20MB limit (off-by-one)
- **Related CSV Test ID(s):** CD-BD-01 (also CD-NG-02)
- **Description:** `server/routes/companyDocuments.routes.js` sets `MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024` and multer's `limits.fileSize` to that value, with an error message reading "File exceeds the 20MB size limit" — clearly implying a file AT 20MB should be the largest accepted size.
- **Expected Behaviour:** A file of exactly 20MB (20,971,520 bytes) should be accepted; only files strictly larger should be rejected.
- **Actual Behaviour:** Confirmed live via a direct byte-boundary probe: a 20,971,519-byte (20MB − 1) file is accepted (200); a 20,971,520-byte (exactly 20MB) file is rejected with the same 400 "File exceeds the 20MB size limit" error as an oversized one. The real, usable limit is one byte short of the documented/intended value.
- **Severity:** Medium — no security exposure, but a real, user-facing off-by-one: a file the system's own error message and constant name claim should fit does not.
- **Category:** Validation
- **Evidence:** `e2e/tests/company-documents-form-validation.spec.ts` (test `CD-BD-01 (confirmed gap)`); `server/routes/companyDocuments.routes.js` line 15 (`MAX_FILE_SIZE_BYTES`) and its multer `limits.fileSize` wiring; CSV row CD-BD-01.
- **Suggested Owner:** Backend (either bump the configured limit by one byte, or fix whatever byte-counting nuance in the multer/busboy pipeline causes the off-by-one, so the advertised and effective limits actually match).

#### CD-002 — `expiry_date` earlier than `effective_date` accepted with no cross-field validation
- **Related CSV Test ID(s):** CD-NG-12
- **Description:** `companyDocumentMetadataSchema` validates `effective_date` and `expiry_date` independently — no `.refine()` cross-checks that expiry comes after (or on) the effective date.
- **Expected Behaviour:** A document whose expiry predates its own effective date is nonsensical and should be rejected.
- **Actual Behaviour:** Submitting `expiry_date` 30 days before `effective_date` succeeds (200) with no validation error.
- **Severity:** Medium — no security exposure, but produces a document that is effectively never visible to non-manage users (expired before it ever becomes effective), a confusing state for whoever created it.
- **Category:** Validation
- **Evidence:** `e2e/tests/company-documents-form-validation.spec.ts` (test `CD-NG-12 (confirmed gap)`); CSV row CD-NG-12.
- **Suggested Owner:** Backend (`companyDocumentMetadataSchema.refine(data => !data.expiry_date || data.expiry_date >= data.effective_date, ...)`).

#### CD-003 — Non-date strings in `effective_date`/`expiry_date` fail only at the SQL layer, not with a clean 400
- **Related CSV Test ID(s):** CD-NG-13, CD-VD-05
- **Description:** Both date fields are validated with only a non-empty-string/min-length check in `companyDocumentMetadataSchema` — no actual date-format validation (e.g. `z.string().date()` or a regex).
- **Expected Behaviour:** A non-date string like `"not-a-date"` should be rejected with a clean 400 validation error.
- **Actual Behaviour:** The request passes schema validation and only fails (or silently misbehaves) once the value reaches the SQL DATE-typed column binding — an unhandled/unclean error path rather than a friendly validation message.
- **Severity:** Medium — matches the exact pattern PR-004 already documents for Payroll's `effective_from` field.
- **Category:** Validation
- **Evidence:** `e2e/tests/company-documents-form-validation.spec.ts` (tests `CD-NG-13 (confirmed gap)` and `CD-VD-05 (confirmed gap)`); CSV rows CD-NG-13, CD-VD-05.
- **Suggested Owner:** Backend (add `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` or equivalent to both fields in `companyDocumentMetadataSchema`).

#### CD-004 — Upload only checks file extension, never actual content
- **Related CSV Test ID(s):** CD-SC-04
- **Description:** `multer`'s `fileFilter` (companyDocuments.routes.js) checks `path.extname(file.originalname)` against an allowlist — it never inspects the file's actual magic bytes/content-type.
- **Expected Behaviour:** A file whose actual content doesn't match its claimed extension should ideally be flagged, or at minimum this should be a known, deliberate tradeoff.
- **Actual Behaviour:** A plain-text file renamed to `spoofed.pdf` uploads successfully and is treated as a normal PDF document (previewed/downloaded as such).
- **Severity:** Medium — no immediate exploit demonstrated (the file is never executed, only served back for download/preview), but a real gap in content-type integrity that could surprise a downstream consumer expecting genuine PDF bytes.
- **Category:** Security
- **Evidence:** `e2e/tests/company-documents-permissions-security.spec.ts` (test `CD-SC-04 (confirmed gap)`); CSV row CD-SC-04.
- **Suggested Owner:** Backend (a magic-byte/content-sniffing check, e.g. `file-type` package, layered on top of the existing extension allowlist).

#### CD-005 — Upload dialog's file-type/size restrictions are client-side only
- **Related CSV Test ID(s):** CD-UI-04, CD-UI-05
- **Description:** The file input's `accept="..."` attribute and the absence of any client-side size pre-check mean an invalid-extension or oversized file is only ever caught by the server, after a full network round trip.
- **Expected Behaviour:** Obviously-invalid selections (wrong extension, over 20MB) should ideally be caught client-side before hitting the network, for a faster/cleaner user experience.
- **Actual Behaviour:** Both cases reach the server and are correctly rejected there (400) — the server-side enforcement itself is NOT broken, only the client-side pre-check is missing.
- **Severity:** Low — purely a UX/round-trip-efficiency gap; the server's own validation is correct, so there is no functional or security consequence, matching the "server enforces correctly, client doesn't gate" pattern AT-003 already documents for a different module.
- **Category:** UI
- **Evidence:** `e2e/tests/company-documents-form-validation.spec.ts` (tests `CD-UI-04 (confirmed gap)` and `CD-UI-05 (confirmed gap)`); CSV rows CD-UI-04, CD-UI-05.
- **Suggested Owner:** Frontend (client-side extension/size pre-check in `DocumentFormDialog.tsx`, mirroring `SettingsPage.tsx`'s own logo-upload size guard).

#### CD-006 — An empty visibility object produces a document invisible to everyone but shown as if normal in the admin list
- **Related CSV Test ID(s):** CD-NG-11
- **Description:** `documentVisibilitySchema` accepts `{}` (no `allEmployees`, no `roleIds`/`departmentIds`/`locationIds`) as a valid visibility payload, producing zero share rows. `listForAdmin` (companyDocuments.repository.js) ignores shares entirely, so the document still appears normally in the manage-holder's own list.
- **Expected Behaviour:** Either reject an empty visibility object outright, or visibly flag a zero-share document in the admin list as "not visible to anyone" so the creator notices the mistake.
- **Actual Behaviour:** The document is created successfully, appears completely normal in the admin list, and is silently invisible (404) to every single non-manage user — with no indication anywhere in the UI that this happened.
- **Severity:** Low — not a security issue (the correct-and-arguably-secure default is "share with nobody"), but a real UX trap: an admin who forgets to set a visibility option gets no warning that their upload reached exactly zero intended recipients.
- **Category:** UI
- **Evidence:** `e2e/tests/company-documents-visibility.spec.ts` (test `CD-NG-11`); CSV row CD-NG-11.
- **Suggested Owner:** Frontend (a "Visible to: nobody" badge/warning in the admin list, or require at least one visibility option before allowing Publish).

#### CD-007 — `company-documents.view` has zero functional effect
- **Related CSV Test ID(s):** CD-SC-05, CD-PM-02
- **Description:** The permission `company-documents.view` exists in the RBAC seed/migration data (035_company_documents.sql, 040_company_documents_permission_backfill.sql, tenantProvisioning.service.js) but is never referenced by any route, middleware, or UI component — confirmed by grepping `server/` and `client/` end-to-end for the literal string.
- **Expected Behaviour:** A permission that exists specifically to grant read access should gate SOMETHING — otherwise a role holding it vs. a role holding neither is indistinguishable, which can mislead whoever configures roles into believing they've granted or restricted something they haven't.
- **Actual Behaviour:** Employee-level document visibility is controlled entirely by the per-document `company_document_shares` rows, not by this permission — a user with `company-documents.view` sees exactly the same documents as a user with no company-documents permission at all.
- **Severity:** Medium — no direct exploit (visibility is still correctly enforced by share rows), but a real RBAC-hygiene defect: an unused permission in the model is a latent source of false confidence for whoever administers roles.
- **Category:** Security
- **Evidence:** `e2e/tests/company-documents-not-automatable.spec.ts` (row `CD-SC-05 / CD-PM-02`, confirmed via static code reading — not runtime-observable with this suite's 5 configured personas); CSV rows CD-SC-05, CD-PM-02.
- **Suggested Owner:** Backend/Product — either wire this permission into an actual gate (e.g. require it for the employee-facing list route), or remove it from the seed/migration data to avoid a misleading role-configuration UI.

#### CD-008 — No storage-usage tracking or enforcement against the tenant's plan limit
- **Related CSV Test ID(s):** CD-SC-06
- **Description:** `subscription_plans.storage_limit_mb` exists as a per-plan configured value (surfaced via `GET /company`'s `storage_limit_mb` field), but no route anywhere sums a tenant's actual stored-file usage (`size_bytes` across `company_document_versions`) to compare against it — confirmed by reading `companyDocuments.routes.js`/`.repository.js` end-to-end.
- **Expected Behaviour:** Uploads should stop (or at least warn) once a tenant's cumulative document storage exceeds its subscribed plan's limit.
- **Actual Behaviour:** There is no code path that could ever enforce this — a tenant can upload indefinitely regardless of its plan's `storage_limit_mb`, since nothing ever computes "current usage" to compare against it.
- **Severity:** Medium — a business/billing-enforcement gap rather than a security one; the configured limit is purely decorative today.
- **Category:** Business Logic
- **Evidence:** Confirmed by direct source-code reading (no route sums `size_bytes`; `company.repository.js`'s `storage_limit_mb` is a bare catalogue value with nothing to compare against) — not runtime-observable without a usage-reporting endpoint that doesn't exist, hence tracked as not-automatable in `e2e/tests/company-documents-not-automatable.spec.ts` (`CD-SC-06`); CSV row CD-SC-06.
- **Suggested Owner:** Backend/Product — add a usage-reporting endpoint and enforce it at upload time, or explicitly decide `storage_limit_mb` is not yet enforced and document that.

#### CD-009 — Silent filesystem-error swallowing on delete
- **Related CSV Test ID(s):** CD-SC-07
- **Description:** `DELETE /:id`'s on-disk cleanup step calls `fs.unlink(filePath, () => {})` — a fire-and-forget callback that discards any error (permission denied, file already gone, disk issue) with no logging and no effect on the API's response.
- **Expected Behaviour:** A failed file deletion should at least be logged server-side, even if the API still reports success for the DB-side deletion.
- **Actual Behaviour:** `DELETE /:id` always returns `{success: true}` regardless of whether the underlying file was actually removed from disk — a failure is completely invisible to both the caller and any server-side log.
- **Severity:** Low — an operational/observability gap, not a functional one from the caller's perspective (the DB record is correctly removed either way); risk is silent disk-space accumulation over time if deletions start failing.
- **Category:** Data Integrity
- **Evidence:** Confirmed by direct source-code reading of `companyDocuments.routes.js`'s `DELETE /:id` handler — not independently triggerable live (no Playwright action can make a remote dev server's filesystem read-only mid-test), hence tracked as not-automatable in `e2e/tests/company-documents-not-automatable.spec.ts` (`CD-SC-07`); CSV row CD-SC-07.
- **Suggested Owner:** Backend (log the `fs.unlink` error at minimum; consider surfacing a partial-failure indicator if this matters operationally).

---

## 4. Security Issues

The 9 defects whose primary category is Security — these represent genuine access-control, data-exposure, or RBAC-integrity gaps:

| Bug ID | Title | Severity |
|---|---|---|
| CP-001 | `POST /api/settings/bulk` accepts any key outside a 4-entry allowlist with zero permission check | Critical |
| LV-006 | `GET /api/settings` has no read-side permission guard at all | Critical |
| LV-003 | `leaves.approve` allows self-approval — no ownership check | Critical |
| PR-002 | Payroll run CSV export includes bank account number/IFSC/UPI in full plaintext | Critical |
| EM-001 | Aadhaar/PAN rendered fully unmasked to any privileged viewer | High |
| AT-006 | `admin` persona's effective RBAC state is non-deterministic across time | High |
| AT-003 | Attendance Policies/Work Modes admin screens have no client-side permission gate (server enforces correctly) | Medium |
| CD-004 | Company document upload only checks file extension, never actual content | Medium |
| CD-007 | `company-documents.view` permission has zero functional effect anywhere | Medium |

**Pattern worth flagging to the app team:** four of these (CP-001, LV-006, LV-003, PR-002) are all variations of "a permission check exists somewhere in the stack but not at the specific point that actually matters" — an allowlist-based write guard with an unbounded bypass for anything outside the allowlist, a read endpoint with no guard at all, a write endpoint with a permission check but no ownership check, and an export with correct access control but no data-level protection. CP-001 and LV-006 both live in the exact same two-route file (`server/routes/settings.routes.js`) — worth a systematic pass across all `server/routes/*.js` files checking every GET/PATCH/export endpoint against its intended permission model, not just these four instances.

---

## 5. Validation Issues

The 20 defects whose primary category is Validation — the largest single bucket, and overwhelmingly a Payroll pattern (8 of 20):

| Bug ID | Module | Title | Severity |
|---|---|---|---|
| LV-007 | Leave | `end_date < start_date` accepted server-side | Critical |
| PR-008 | Payroll | `payroll_settings` blob has no schema validation at all | High |
| EM-002 | Employee Master | Banking fields have no server-side format validation | Medium |
| EM-003 | Employee Master | Date fields accept non-date strings | Medium |
| PR-003 | Payroll | `ctc_annual` accepts a negative value | Medium |
| PR-004 | Payroll | `effective_from` accepts a non-date string | Medium |
| PR-005 | Payroll | `percent_of_component` accepts missing `base_component_id` | Medium |
| PR-006 | Payroll | Duplicate `component_id` not deduped | Medium |
| PR-007 | Payroll | `min_amount` > `max_amount` accepted for salary grades | Medium |
| PR-009 | Payroll | Overtime `hours` accepts a non-numeric string | Medium |
| PR-010 | Payroll | `period_year`/`period_month` no bounds/type validation | Medium |
| CP-002 | Company Profile Settings | `currency` has no server-side enum despite a fixed UI dropdown | Medium |
| CP-003 | Company Profile Settings | `date_format` has no server-side enum despite a fixed UI dropdown | Medium |
| CP-006 | Company Profile Settings | Logo upload accepts non-image files, no server-side content-type check | Medium |
| CD-001 | Company Documents | A file exactly at the advertised 20MB limit is rejected (off-by-one) | Medium |
| CD-002 | Company Documents | `expiry_date` earlier than `effective_date` accepted, no cross-field check | Medium |
| CD-003 | Company Documents | Date fields accept non-date strings, fail only at the SQL layer | Medium |
| AT-007 | Attendance | All 7 days as Weekly Off Days accepted, no validation | Low |
| LV-011 | Leave | `reason` field accepts unbounded-length text | Low |
| CP-004 | Company Profile Settings | `attendance_link` accepts any value (e.g. a `javascript:` URI) with zero validation | Low |

**Pattern worth flagging to the app team:** the Payroll module's Zod schemas (`payrollAssignmentSchema`, `structureComponentsReplaceSchema`, salary-grade/component schemas, `overtimeEntrySchema`, `payrollRunCreateSchema`, `settingsBulkSchema`) share a systemic weakness — nearly every one accepts a value that only the *database's own CHECK constraints* ultimately reject, surfacing as an unhandled 500 instead of a friendly 400. A single, focused validation-hardening pass across `server/schemas/` for the Payroll module (adding numeric floors/ceilings, date-format checks, and cross-field `.refine()`s) would resolve the majority of PR-003 through PR-010 in one coordinated effort rather than eight separate patches.

---

## 6. UI Issues

The 10 defects whose primary category is UI — mostly missing client-side gates where the server already enforces correctly, plus cosmetic/accessibility issues:

| Bug ID | Module | Title | Severity |
|---|---|---|---|
| LV-008 | Leave | "Apply for Leave" button rendered unconditionally | Medium |
| LV-009 | Leave | Date-picker minimum hardcoded to a fixed literal date | Medium |
| PR-011 | Payroll | Overtime action list doesn't exclude approver's own Pending entries | Medium |
| AT-004 | Attendance | Attendance Policy form doesn't adapt fields to `policy_type` | Low |
| AT-008 | Attendance | Edit/Delete icon buttons have no accessible name | Low |
| LV-010 | Leave | `GET /leaves` 403 silently swallowed, misleading empty state shown | Low |
| PR-001 | Payroll | Cancel-run toast typo ("Run canceld") | Low |
| CP-007 | Company Profile Settings | Button `contrastText` hardcoded white regardless of theme lightness | Low |
| CD-005 | Company Documents | Upload dialog's file-type/size restrictions are client-side only (server enforces correctly) | Low |
| CD-006 | Company Documents | Empty visibility ({}) produces an invisible-to-everyone document with no admin-side warning | Low |

---

## 7. Business Logic Issues

The 7 defects whose primary category is Business Logic, plus LV-005 and CD-009 (both Data Integrity — no dedicated section exists, so both are folded in here):

| Bug ID | Module | Title | Severity |
|---|---|---|---|
| LV-003 | Leave | *(see §4 — Security is the more precise primary category, cross-referenced here as it's also a business-process failure)* | Critical |
| AT-002 | Attendance | Attendance Policy delete has no in-use guard | High |
| LV-002 | Leave | Probation Earned/Paid block matches on substring, catches "Unpaid" | High |
| LV-004 | Leave | Cancelling an already-started leave succeeds server-side | High |
| LV-005 | Leave | Concurrent overlapping leave applications both succeed (race condition) | High |
| AT-001 | Attendance | "2nd Saturday off" hardcoded, ignores tenant setting | Medium |
| AT-005 | Attendance | "Assign default Work Mode" has an API but no reachable UI | Medium |
| CP-005 | Company Profile Settings | `currency` is purely decorative — no payroll/payslip code ever reads it | Medium |
| CD-008 | Company Documents | No storage-usage tracking/enforcement against the tenant's plan limit | Medium |
| CD-009 | Company Documents | *(Data Integrity — no dedicated section exists; included here alongside LV-005)* Silent `fs.unlink` error swallowing on delete can orphan files with zero visibility | Low |

---

## 8. API Issues

No defect's primary category was API in isolation, but one dual-category entry belongs here directly — it's fundamentally a request/response contract-type mismatch across the API boundary:

| Bug ID | Module | Title | Severity |
|---|---|---|---|
| LV-001 | Leave | `is_half_day` datatype handling across client → Zod schema → repository layers | Critical |

---

## 9. Future Verification

For every bug above, the exact Playwright test(s) that should be rerun once the application fix ships — a clean pass on these confirms the defect is resolved. All other tests in each module should also be rerun as a regression check, but these are the ones whose *current passing state is itself evidence of the bug* — after a fix, each of these tests' assertions will need to be updated to assert the corrected behavior, and the test should then be verified to pass against the new expected behavior.

| Bug ID | Test file → test title | Post-fix expectation |
|---|---|---|
| EM-001 | `employee-detail-profile.spec.ts` → `EM-FN-10 / EM-UI-14 / EM-SC-01` | Aadhaar/PAN should render masked, not in full |
| EM-002 | `pii-banking.spec.ts` → `EM-VD-05: banking fields have no server-side format validation (confirmed gap)` | Malformed banking values should be rejected with 400 |
| EM-003 | `employee-creation.spec.ts` → `EM-VD-12: joining_date accepts any non-empty string with no date-format validation (confirmed gap)` | Non-date `joining_date` should be rejected with 400 |
| AT-001 | `attendance-history-calendar.spec.ts` → `ATE-RG-03` (2nd-Saturday-off known gap) | Calendar should reflect the tenant's actual `nth_saturdays_off` config |
| AT-002 | `attendance-policies.spec.ts` → `ATE-RG-05` (deleting an in-use policy) | Delete of an in-use policy should be rejected with 409 |
| AT-003 | `attendance-permissions.spec.ts` → un-skip `ATE-PM-04`/`ATE-PM-07` once a `hasPermission` gate exists | CRUD controls should be hidden for a persona lacking the relevant `.manage` permission |
| AT-004 | `attendance-policies.spec.ts` → `ATE-VD-07` (confirmed gap) | Form fields should adapt to the selected `policy_type` |
| AT-005 | `work-modes.spec.ts` → implement/un-skip `ATE-PS-16` once a UI entry point exists | Admin should be able to assign a default Work Mode via the UI |
| AT-006 | `shifts.spec.ts` / `attendance-policies.spec.ts` → their admin-gated smoke tests (`ATE-SM-04`, `ATE-SM-06`), rerun repeatedly across separate sessions | `admin`'s effective permissions should be stable across runs |
| AT-007 | `attendance-rules-settings.spec.ts` → `ATE-BD-08` (all 7 weekly off days) | Should either be rejected or the CSV's expected-result column updated to reflect an intentional decision |
| AT-008 | New test needed once Tooltips are added to Edit/Delete in `AttendancePoliciesPage.tsx` | Edit/Delete should be targetable by accessible name, not position |
| LV-001 | `leave-balance.spec.ts` → `LV-FN-13`; `leave-application.spec.ts` → `LV-UI-05` | Half-day requests should reliably persist as exactly 0.5 day regardless of input type — recommend a human explicitly re-confirm against the original `LV-P0-001` report first |
| LV-002 | `leave-probation.spec.ts` → `LV-NG-04` | A leave type named "Unpaid" should NOT be blocked as Earned/Paid during probation |
| LV-003 | `leave-list-approval.spec.ts` → `LV-NG-18 / LV-SC-01 / LV-SC-02 / LV-PM-03` | Self-approval should be rejected (403/400) |
| LV-004 | `leave-cancellation.spec.ts` → `LV-NG-19` | Cancelling an already-started leave should be rejected server-side, not just hidden client-side |
| LV-005 | `leave-application.spec.ts` → `LV-NG-20` | Only one of two concurrent overlapping requests should succeed |
| LV-006 | `leave-settings.spec.ts` → `LV-SC-03` | `GET /settings` should require appropriate permission before returning `leave_allocations` |
| LV-007 | `leave-application.spec.ts` → `LV-NG-10`, plus a **new** direct-API test bypassing the browser's HTML5 guard (recommended addition, does not currently exist) | `end_date < start_date` should be rejected server-side with 400 |
| LV-008 | `leave-list-approval.spec.ts` → `LV-UI-01` | Apply button should be hidden/disabled for a persona lacking apply permission |
| LV-009 | `leave-application.spec.ts` → `LV-UI-11` | Date-picker `min` should equal the current date, not a fixed literal |
| LV-010 | `leave-list-approval.spec.ts` → `LV-NG-17` | A 403 should surface as a distinguishable error state, not an empty-list message |
| LV-011 | `leave-application.spec.ts` → `LV-VD-06` | An excessively long `reason` should be rejected or truncated per a defined max length |
| PR-001 | `payroll-runs-lifecycle.spec.ts` → `PR-FN-14` | Toast should read "Run cancelled" |
| PR-002 | `payroll-security-permissions.spec.ts` → `PR-SC-01` | Exported banking fields should be masked/redacted, not full plaintext |
| PR-003 | `payroll-salary-assignments.spec.ts` → `PR-NG-06`, `PR-BD-03` | Negative `ctc_annual` should be rejected with a friendly 400, not an unhandled DB error |
| PR-004 | `payroll-salary-assignments.spec.ts` → `PR-VD-04` | Non-date `effective_from` should be rejected with a friendly 400 |
| PR-005 | `payroll-salary-components.spec.ts` → `PR-NG-22` | Missing `base_component_id` on a `percent_of_component` should be rejected with a friendly 400 |
| PR-006 | `payroll-salary-structures.spec.ts` → `PR-VD-03` | Duplicate `component_id` in one request should be rejected with a friendly 400 |
| PR-007 | `payroll-salary-grades.spec.ts` → `PR-NG-04 / PR-VD-08` | `min_amount > max_amount` should be rejected with a friendly 400 |
| PR-008 | `payroll-settings.spec.ts` → `PR-VD-09`, `PR-VD-10` | Wrong-typed values and invalid `rounding_rule` should be rejected with 400 |
| PR-009 | `payroll-overtime.spec.ts` → `PR-VD-06` | Non-numeric `hours` should be rejected with a friendly 400 |
| PR-010 | `payroll-runs-lifecycle.spec.ts` → `PR-BD-02`, `PR-VD-05` | Extreme/negative years and non-numeric period values should be rejected with 400 |
| PR-011 | `payroll-overtime.spec.ts` → `PR-UI-07` | Approve/Reject icons should not render on the caller's own Pending row |
| CP-001 | `company-profile-permissions-security.spec.ts` → `CP-NG-08 / CP-SC-01`, `CP-NG-09 / CP-PM-04` | An unmapped settings key should be rejected (403) or require a baseline permission, not silently accepted |
| CP-002 | `company-profile-validation.spec.ts` → `CP-NG-06` | A `currency` value outside the fixed option list should be rejected with 400 |
| CP-003 | `company-profile-validation.spec.ts` → `CP-NG-07` | A `date_format` value outside the fixed option list should be rejected with 400 |
| CP-004 | `company-profile-permissions-security.spec.ts` → `CP-NG-11` | A malformed/malicious `attendance_link` value should be rejected or sanitized |
| CP-005 | `company-profile-not-automatable.spec.ts` → `CP-SC-05` (static code reading, no runtime test to rerun) | `currency` should either drive real downstream formatting or be removed/labeled as reserved |
| CP-006 | `company-profile-validation.spec.ts` → `CP-UI-05 (type bypass, confirmed gap)` | A non-image file should be rejected as a logo upload |
| CP-007 | `company-profile-lifecycle.spec.ts` → `CP-UI-07 (confirmed gap)` | Button text color should maintain adequate contrast against a pale primary theme color |
| CD-001 | `company-documents-form-validation.spec.ts` → `CD-BD-01 (confirmed gap)` | A file exactly at 20MB should be accepted, matching the advertised limit |
| CD-002 | `company-documents-form-validation.spec.ts` → `CD-NG-12 (confirmed gap)` | `expiry_date` before `effective_date` should be rejected with 400 |
| CD-003 | `company-documents-form-validation.spec.ts` → `CD-NG-13 (confirmed gap)`, `CD-VD-05 (confirmed gap)` | Non-date `effective_date`/`expiry_date` should be rejected with a friendly 400 |
| CD-004 | `company-documents-permissions-security.spec.ts` → `CD-SC-04 (confirmed gap)` | A spoofed-extension file should be rejected once content/magic-byte checking is added |
| CD-005 | `company-documents-form-validation.spec.ts` → `CD-UI-04 (confirmed gap)`, `CD-UI-05 (confirmed gap)` | Invalid extension/oversized files should be blocked client-side before any network request |
| CD-006 | `company-documents-visibility.spec.ts` → `CD-NG-11` | An empty visibility object should either be rejected or clearly flagged in the admin list |
| CD-007 | `company-documents-not-automatable.spec.ts` → `CD-SC-05 / CD-PM-02` (static code reading, no runtime test to rerun) | `company-documents.view` should gate something, or be removed from the permission model |
| CD-008 | `company-documents-not-automatable.spec.ts` → `CD-SC-06` (static code reading, no runtime test to rerun) | Uploads should be blocked/warned once cumulative usage exceeds `storage_limit_mb` |
| CD-009 | `company-documents-not-automatable.spec.ts` → `CD-SC-07` (static code reading, no runtime test to rerun) | A failed `fs.unlink` should be logged, not silently discarded |

**Note on tests marked "(confirmed gap)":** per this suite's own convention (documented in `e2e/FRAMEWORK_GUIDELINES.md`), these tests currently *pass* — passing is what proves the gap exists. After each corresponding application fix ships, the test's own assertions must be inverted/updated to assert the new, correct behavior (e.g. expecting a `400` instead of asserting `response.status()).not.toBe(400)`), and its title should have `(confirmed gap)` removed. This is a coordinated test-and-fix change, not something to do to the test alone — do not "fix" these tests without the corresponding application change landing first.

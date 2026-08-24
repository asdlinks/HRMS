# Phase 8 — Product Hardening Audit Report (Part 1)

Date: 2026-07-13
Scope: Read-only audit of every existing module ahead of the v1.0 commercial release. No code changed in this pass.

## How to read this report

Findings are grouped by domain, each with a priority (Critical / High / Medium / Low), a one-line summary, the file:line to look at, and a one-sentence fix direction. Two gaps are **systemic** — they don't belong to any one module and are called out once here instead of being repeated in every section:

- **No audit-log mechanism exists anywhere in the app.** There is no audit table, no change-history table, no "who did what when" trail for any entity (users, roles, settings, leaves, payroll, attendance). Every domain audit below flags where this is *most* costly, but the underlying fix is one piece of shared infrastructure (see Part 6 of the phase plan).
- **No import/export capability exists anywhere in the app.** No xlsx/csv/pdf library is installed, no `/import` or `/export` route exists on any resource. Every domain that would benefit from bulk import/export is noted below, but again the fix is shared infrastructure (see Part 5 of the phase plan).

Total findings: 22 (Core Platform) + 18 (Attendance) + 19 (Leave) + 20 (Payroll) + 10 (Self-Service/Manager) + 11 (Notifications) ≈ 100 findings across six domains.

---

## 1. Core Platform (Auth, RBAC, Users, Menu, Settings, Company)

### Critical
1. **Tenant suspension/cancellation is never enforced.** `tenants.status` (`trial|active|suspended|cancelled`) is fetched at login but never checked. — `server/routes/auth.routes.js:88-97`, `server/routes/index.js:41`
2. **No brute-force protection on login/kiosk-login** — unlimited password guesses possible. — `server/routes/auth.routes.js:82-101`
3. **DB constraint violations leak raw SQL errors to the client** (e.g. duplicate email surfaces a raw 500 with table/constraint names). — `server/repositories/users.repository.js:189`, `server/middleware/errorHandler.js:15-22`
4. **Privilege escalation via legacy `role` column** — any `users.manage` holder can promote another user to `super_admin` via `PATCH /users/:id`. — `server/repositories/users.repository.js:140-143`, `server/routes/users.routes.js:62-75`

### High
5. No user deactivation — only irrecoverable hard delete (cascades to attendance/leave/notification history). — `server/repositories/users.repository.js:166-178`
6. `payroll.settings.manage` can overwrite *any* tenant setting key, not just payroll ones. — `server/routes/settings.routes.js:22`
7. `GET /api/settings` has no permission check at all. — `server/routes/settings.routes.js:9-20`
8. `GET /api/menu` (admin management endpoint) has no permission check. — `server/routes/menu.routes.js:13-15`
9. No tenant-scoping validation on user FKs (`department_id`, `manager_id`, `location_id`) — cross-tenant linkage possible. — `server/repositories/users.repository.js:111-136`
10. No password complexity policy beyond `min(6)`. — `server/schemas/index.js:26,41-42`
11. No notification/audit trail on security-sensitive events (password reset by admin, role change).

### Medium
12. No safeguard against an admin removing the last role/user holding `settings.manage` (self-lockout risk). — `server/repositories/roles.repository.js:57-82`
13. Menu `permission`/`anyPermission` fields are free text, never validated against the real permissions table. — `server/schemas/index.js:61-75`
14. Role code collisions/empty codes aren't pre-checked before hitting the DB unique constraint. — `server/repositories/roles.repository.js:23-35`
15. Role deletion warning doesn't show which users are affected or offer reassignment. — `client/src/pages/SettingsPage.tsx:888-896`
16. No access/permission-matrix report (who holds what).
17. No optimistic-concurrency protection on shared config writes (Company Profile, Settings, Menu) — last-write-wins.
18. Optimistic UI on employee delete doesn't roll back local state on API failure. — `client/src/pages/EmployeesPage.tsx:112-123`
19. Timing side-channel differentiates "tenant/user not found" vs "wrong password" by response time. — `server/routes/auth.routes.js:88-97,164-173`

### Low
20. Company logo stored as base64 in `NVARCHAR(MAX)` (up to 5MB) rather than blob storage/CDN.
21. Legacy `role` string still drives core visibility logic in parallel with the newer RBAC tables.
22. No step-up/re-auth or notification when an admin resets another user's password. — `server/routes/users.routes.js:85-91`

---

## 2. Attendance & Timekeeping

### Critical
1. **Stale/forgotten check-out can produce bogus multi-day overtime that auto-feeds payroll** with no cap, sanity check, or manual review gate. — `attendance.repository.js:106-112`, `shiftEngine.service.js:87-107`, `attendanceEngine.service.js:190-207`
2. **Overtime approver can approve their own submitted entry** — the self-approval guard has an inverted condition. — `server/routes/overtime.routes.js:41-45`
3. **Face check-in has no server-side trust boundary** — match confidence/threshold lives entirely client-side (kiosk `localStorage`) and is never validated or persisted server-side. — `face-attendance.routes.js:56-70`, `face-attendance/src/config.ts:59-68`

### High
4. No regularization/correction workflow for missed punches anywhere (attendance page is read-only).
5. No absentee/missed-punch detection — "Absent" is a client-side inference only, never a stored fact; no scheduler exists in the codebase at all.
6. No upper bound on check-in date — future-dated attendance is accepted.
7. `attendance.view.team` is not actually scoped to direct reports — any holder can view *any* employee's attendance tenant-wide.
8. Attendance-policy deletion has no in-use guard (unlike shifts/work-modes), so deleting an assigned policy throws a raw FK-violation 500.

### Medium
9. Overtime rejection reason is captured in the schema/DB but never surfaced in the UI — employees are never told why.
10. No confirmation dialog before rejecting an overtime request (inconsistent with delete flows elsewhere).
11. No notifications wired for overtime approve/reject, missed punches, or late arrivals.
12. Race condition on concurrent "start break" calls (no transaction/unique-open-row constraint).
13. Retroactive shift assignment (`effective_from` in the past) can silently conflict with an already-processed payroll period.
14. Duplicate holidays are silently allowed — no uniqueness constraint on `(tenant, name, date, location)`.
15. Kiosk device revocation isn't instant — a revoked device can still transact for up to ~5 minutes (token TTL), with no logging of attempted post-revocation use.

### Low
16. Kiosk app URL setting isn't validated as a URL.
17. Overtime `work_date` has no upper-bound check (future-dated overtime claims possible).
18. No rate limiting on kiosk-login.

---

## 3. Leave Management

### Critical
1. **No server-side leave-balance enforcement** — balance math is client-only display; a direct API call bypasses it entirely.
2. **No overlap/duplicate-leave validation on apply** — the repository has the query (`findPendingLeaveForUser`) but it's only wired into the voice-assistant route, not the main apply endpoint.
3. **No state-transition guard on approve/reject/cancel** — an already-cancelled/rejected leave can be re-approved or re-cancelled; no optimistic-concurrency check.
4. **No real leave-balance data model** — allocations are a single tenant-wide settings blob, not a per-employee ledger; no accrual, carry-forward, or encashment support. This is the root cause of #1.

### High
5. "Cancellation Pending" status exists in the schema/UI but is dead code — an employee can unilaterally cancel a manager-approved leave with zero re-approval step.
6. No multi-level approval chain, delegate-when-manager-on-leave, or auto-escalation on timeout.
7. No confirmation dialogs before Approve/Reject/Cancel actions.
8. The leave owner is never notified when someone else (HR/manager) cancels their leave.
9. No low-balance warning notifications.
10. Backdated leave requests auto-approve with no distance bound or distinguishing flag, despite feeding payroll LOP calculations.
11. Server never re-validates weekend/holiday overlap — client-only check, bypassable via direct API call.

### Medium
12. `half_day_session` accepts any string (no AM/PM enum); no backend check that start=end date when half-day.
13. No team leave calendar/roster view — only a flat list.
14. No leave balance report or leave utilization report.
15. No idempotency key on leave apply (unlike attendance) — retry/double-click can duplicate a request.
16. Approvers can revert a decided leave back to `Pending` via direct API call with none of the original apply-time rules re-checked.
17. Super_admin's own leave requests are invisible to themselves (`role != 'super_admin'` filter applies even to `'own'` scope).

### Low
18. No distinction between "withdraw a pending request" and "cancel an approved leave" — same status/endpoint.
19. Negative/over-range leave balance can render as a negative number in the UI.

---

## 4. Payroll

### Critical
1. **No audit trail for any payroll mutation** beyond single `created_by`/`approved_by` columns — no history of what changed or from what prior value. Highest-risk instance of the systemic audit-log gap.
2. **No maker-checker / segregation of duties** — the same role can create, process, approve, and pay a run; nothing blocks a single person doing all four.
3. **Cancelling a run permanently blocks that pay period** — the unique constraint on `(tenant, year, month)` isn't filtered to exclude cancelled rows.
4. **No off-cycle/bonus/final-settlement run type and no correction workflow for a Paid run** — one row per calendar month, no adjustment-run concept.

### High
5. An Approved run can never be un-approved/reopened if approved by mistake.
6. Payslips can be published (exposed to employees) before the run itself is approved/paid — no status gate on the publish endpoints.
7. No sign validation on component amounts — a negative "deduction" silently inflates net pay and vice versa.
8. Salary-assignment history can be corrupted by back-dating with no overlap/inversion check, and the calc engine will silently pick one of the corrupted rows.
9. A payroll run can be created for a future/unelapsed period with no guard.

### Medium
10. Deactivating a salary component doesn't stop it from being used in structures/runs.
11. Deactivating a salary structure doesn't stop employees assigned to it from being paid off it.
12. `line_status = 'Excluded'` is defined in the schema but never settable — no way to exclude one employee from a run without removing their salary assignment.
13. Salary grade min/mid/max bands are purely informational, never checked against assignment CTC.
14. Zero notifications anywhere in payroll (no payslip-ready, run-completed, or salary-revision alerts).
15. One bad employee's config (e.g. circular component reference) blocks processing for the entire run — no isolate-and-skip path.
16. Bank account details are stored and returned in plaintext with no encryption-at-rest.
17. No payroll register / run-vs-run variance report to flag anomalous individual swings.
18. No import/export anywhere in payroll (bulk component/structure/assignment import, register export for finance handoff).

### Low
19. No bounds validation on numeric payroll settings (pay cycle day, OT multiplier, etc.).
20. `sort_order`/`override_value` accept negative values with no business-rule check.

**Design note (not a gap):** the snapshot-at-process-time calculation model is sound — once a run is Processing/Approved/Paid, editing a live component/structure/assignment cannot retroactively change a finalized number. The gaps above are about surrounding workflow, not the core arithmetic (which has unit test coverage).

---

## 5. Employee Self Service & Manager Experience

### Part 2 — Employee Self Service status

| Area | Status | Note |
|---|---|---|
| My Dashboard | EXISTS | Leave balance, team-out-this-week, celebrations, holidays, announcements, quick actions. |
| My Profile | **PARTIAL** | Read-only viewer of *any* user by id, gated by team/all view permissions — **no self-service view/edit of one's own profile exists at all.** |
| My Attendance | EXISTS | |
| My Leave | EXISTS | Apply + cancel both present. |
| My Payroll | PARTIAL | Payslip view exists; **no download/print of payslip PDF.** |
| My Documents | **MISSING ENTIRELY** | No route, page, API, or data model for employee documents (ID docs, offer letter, policy docs). |
| My Team | EXISTS | |
| My Notifications | PARTIAL | Only a small bell dropdown (last 20, no history/pagination/deep-link) — no dedicated Notification Center. |
| My Calendar | PARTIAL/MISSING | Company holiday calendar exists; no unified personal calendar merging own leave + holidays + team-out. |

### Part 3 — Manager Experience status

| Area | Status | Note |
|---|---|---|
| Manager Dashboard | EXISTS | |
| Manager Approvals | PARTIAL | Approve/reject lives inside shared employee pages (Leaves, Overtime), not a dedicated manager workspace; **no confirmation dialog on either.** |
| Team Attendance | PARTIAL | One-employee-at-a-time view only, no team roster/grid. |
| Team Leave | EXISTS | |
| Team Calendar | PARTIAL | 7-day-forward list, not a real calendar. |
| Pending Requests | EXISTS | |
| Quick Actions | EXISTS | |
| Manager Analytics | PARTIAL | Dashboard charts only; Reports page is thin (counts, no trends). |

### Top gaps
- **Critical:** no self-service profile page; My Documents missing entirely; no confirmation dialog on leave/overtime Approve/Reject.
- **High:** no payslip download; no unified My/Team Calendar; no dedicated Notification Center.
- **Medium:** Team Attendance has no grid view; Manager Analytics is thin.

---

## 6. Notifications & Announcements

**Current state:** a single generic `notifications` table with exactly one producer (the Leave module) and one consumer (a small bell dropdown in the top nav). Announcements are a fully separate table/route/UI with no relationship to notifications at all — posting one never creates a notification row for anyone.

### Category wiring status

| Category | Status |
|---|---|
| Leave Notifications | WIRED |
| Approval Notifications | PARTIAL (leave only; overtime approvals notify no one) |
| Birthday Notifications | PARTIAL (client-computed dashboard card only, no DB row, no read/unread) |
| Company Announcements | PARTIAL (own CRUD, but disconnected from notifications/bell) |
| Attendance Notifications | MISSING |
| Payroll Notifications | MISSING |
| System Alerts | MISSING |

### Top gaps
- **Critical:** no dedicated Notification Center page (history/pagination/filtering); `notifications.type` is free text with no category taxonomy; announcements never fan out into notifications.
- **High:** attendance and payroll have zero emitters; no service-layer/event-bus abstraction — every caller directly writes rows inline, so adding email/SMS/push later means touching every call site; `markAllRead` can't mark a single item read.
- **Medium:** `notifications.manage` permission exists but is dead/unwired; no input validation on notification creation; notification fetch errors fail silently everywhere.

---

## Cross-cutting themes for prioritization

1. **Money-safety in Payroll** (maker-checker, run lifecycle, sign validation) is the highest-stakes area — a wrong paycheck or an untraceable change is a trust-breaking incident for a commercial customer.
2. **Audit log infrastructure** is the single piece of shared infrastructure that would retroactively improve nearly every "Critical"/"High" finding above by making privileged actions traceable.
3. **Notification Center infrastructure** (event-taxonomy + dispatch service) unlocks wiring attendance/payroll/system alerts cheaply once built, rather than one-off per module.
4. **Self-service gaps** (My Profile, My Documents, confirmations on approve/reject) are the most customer-visible day-one gaps for a v1.0 launch.
5. **Import/export** is entirely greenfield — no library, no route, anywhere.

## Suggested next step (per agreed sequencing: Foundation first)

Design and build, in order:
1. Audit-log infrastructure (shared table + write-path helper), wired first into Users/Roles/Settings and Payroll (highest risk).
2. Notification Center infrastructure (category taxonomy + dispatch service + `/notifications` page), then backfill Attendance/Payroll/System Alert emitters.
3. Re-visit this report's Critical findings module-by-module once the above two are in place, since several (e.g. payroll maker-checker, leave state-transition guard) benefit from being logged from day one.

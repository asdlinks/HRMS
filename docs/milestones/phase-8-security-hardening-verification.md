# Phase 8 — Security & Business Rule Hardening: Verification Report

Date: 2026-07-14
Scope: verification of every fix made against the Critical findings in `docs/milestones/phase-8-audit-report.md`, per the approved hardening plan.

## Method

- Static: `node --check` on every edited server file; `tsc --noEmit` on the client.
- Automated: `npm test` in `server/` (payroll calculation suite).
- Migration: `run-migrations.js` applied `025_security_hardening.sql` cleanly against the shared dev DB, and a second run correctly no-ops.
- Live: server booted against the real dev DB; every fix below was exercised end-to-end with real HTTP requests (or, where no test fixture existed — e.g. no OT-enabled shift in this tenant — a temporary fixture was created, exercised, and deleted afterward). All test data created during verification has been removed; no residual rows remain.
- Client: `vite dev` boots clean with no build errors after the `ConfirmDialog` additions. Browser click-through was not performed in this pass — recommend a quick manual pass on Leaves/Overtime/Leave Cancellation before shipping, though the change is a thin wrapper around the same `ConfirmDialog` component already used elsewhere in the app.

## Results by finding

| # | Finding | Status | Verified |
|---|---|---|---|
| Core-1 | Tenant suspension never enforced | **Fixed** | Suspended tenant → login rejected (403) and an already-authenticated session's next call also rejected (403), via `requireActiveTenant` middleware + login/refresh checks. |
| Core-2 | No brute-force protection / lockout | **Fixed** | 5 wrong passwords → 6th attempt (even with the correct password) returns 429 lockout; IP rate limiter also added on `/login` and `/kiosk-login`. |
| Core-3 | Raw SQL error leak on duplicate email | **Fixed** | Creating a user with an existing email now returns a clean 409 `"A user with this email already exists"` instead of a raw DB error. |
| Core-4 | Privilege escalation via `role` column | **Fixed** | `PATCH /users/:id` with `{"role":"super_admin"}` silently drops the field (role unchanged); legitimate fields in the same request still update normally. Role changes now only possible via the already-gated `PUT /users/:id/role`. |
| Attendance-1 | Missed checkout → unintended multi-day overtime | **Fixed** | A 3-day-old open session, checked out today: `worked_minutes` capped to 1440 (24h), `overtime_minutes` forced to 0, **no** overtime entry created — even with `ot_requires_approval = false` on the test shift. |
| Attendance-2 | Overtime self-approval | **Fixed** | A user attempting to approve/reject their own submitted overtime entry now gets 403, before any team/all-permission check runs. |
| Attendance-3 | Face-recognition confidence trusted client-side only | **Fixed** | `confidence: 0.2` → 422 rejection; `confidence: 0.85` → succeeds and the value is persisted on the new `attendance.confidence` column. Schema now requires `confidence` (was optional). |
| Leave-1 | No server-side balance enforcement | **Fixed** | A request that would push usage past the tenant's allocation (7 days) is rejected with 400, even though the request itself doesn't overlap any existing leave. |
| Leave-2 | No server-side overlap validation | **Fixed** | Applying for a date already covered by an Approved leave → 409. |
| Leave-3 | No server-side holiday/weekend validation | **Fixed** | Applying with a Sunday as start/end date → 400, matching the client's own `isHolidayOrSunday` rule. |
| Leave-4 | No leave-balance ledger (root cause of Leave-1) | **Scoped down, not fully solved** | Enforcement now runs server-side against the existing tenant-wide allocation model; a true per-employee ledger (accrual/carry-forward/encashment) is a data-model redesign, explicitly deferred per the approved plan. |
| Leave-state | No state-transition guard | **Fixed** | Re-approving an already-Approved leave → 409; reverting to `Pending` via the PATCH endpoint is now schema-rejected entirely; cancelling an already-Cancelled leave → 409; a valid Approved→Cancelled transition still succeeds. |
| Payroll-1 | No audit trail for payroll mutations | **Deferred** | Per the user's explicit decision — real audit trail infrastructure is the next phase. `processed_by`/`paid_by` columns added now so that phase has data to work with immediately. |
| Payroll-2 | No maker-checker | **"Log only" per user's decision — not blocked** | Verified the same user can create → process → approve → pay a run in one pass and it succeeds; `processed_by`, `approved_by`, and `paid_by` are all correctly populated with that user's id for future review. No enforcement added, as agreed. |
| Payroll-3 | Cancelled run permanently blocks its period | **Fixed** | Created a run for 2027-02, cancelled it, then successfully created a **new** run for the same 2027-02 period — previously this would 409 forever. |
| Payroll-4 | No off-cycle/correction run type | **Deferred** | Explicitly out of scope for this hardening pass (a net-new workflow feature) — flagged in the plan for a future payroll milestone. |
| General-1 | Missing confirmation dialogs on approve/reject/cancel | **Fixed** (typecheck + build verified; not click-tested in a browser) | `LeavesPage.tsx`, `PayrollOvertimePage.tsx`, `LeaveCancellationPage.tsx` all now route their approve/reject/cancel actions through `ConfirmDialog` before calling the API. |
| General-2 | Endpoint validation sweep | **Fixed** | The one gap found (`PUT /kiosk-devices/:id/status`) now validates via a zod schema — an invalid status value returns a clean 400 instead of an ad-hoc check. |

## What's genuinely still open (by design, not oversight)

- **Payroll maker-checker enforcement** — currently log-only. Revisit once the Audit Log phase lands, per your decision.
- **Payroll audit trail** — `processed_by`/`paid_by` are recorded, but there's still no general change-history table. That's the next phase.
- **Payroll off-cycle/correction run type** — not started; flagged as a future payroll-enhancement milestone, not a hardening fix.
- **Full leave-balance ledger** (accrual, carry-forward, encashment) — enforcement now happens server-side, but the underlying model is still the tenant-wide flat allocation, not a per-employee ledger.
- **Browser click-through on the three new confirmation dialogs** — recommend a quick manual pass before this ships to a customer, though the risk is low (same component, same pattern used successfully elsewhere).

## Next steps

Per your instructions, the next phase is:
1. Audit Log Infrastructure
2. Notification Center
3. Employee Self-Service enhancements
4. Manager Experience improvements

All committed to the migration/schema decisions made in this phase (e.g. `processed_by`/`paid_by` on `payroll_runs`, `confidence` on `attendance`) so that infrastructure phase can build directly on top without another payroll/attendance migration.

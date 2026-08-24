/**
 * Data-driven fixtures for the Payroll & Salary Grades suite
 * (docs/Payroll_SalaryGrades_TestCases.csv). Builds on fixtures/test-data.ts's
 * uniqueSuffix() rather than re-deriving it — see that file's own doc comment
 * for why a bare Date.now() isn't safe across parallel workers.
 */
import { uniqueSuffix } from './test-data';

/**
 * Same bounded polynomial hash as fixtures/test-data.ts's private
 * hashToSafeInt() (not exported from there — duplicated here rather than
 * exporting a cross-module-private helper, per this file's own narrow scope).
 * Used below to turn a uniqueSuffix() string into a safe integer for
 * generating collision-free-by-construction period years and OT dates.
 */
function hashToSafeInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) % 2147483647;
  }
  return h;
}

export function uniqueComponentCode(): string {
  return `E2EC${uniqueSuffix()}`.slice(0, 50);
}
export function uniqueComponentName(): string {
  return `E2E Component ${uniqueSuffix()}`;
}
export function uniqueStructureName(): string {
  return `E2E Structure ${uniqueSuffix()}`;
}
export function uniqueGradeCode(): string {
  return `E2EG${uniqueSuffix()}`.slice(0, 50);
}
export function uniqueGradeName(): string {
  return `E2E Grade ${uniqueSuffix()}`;
}

/**
 * `payroll_runs` has a UNIQUE(tenant_id, period_year, period_month)
 * constraint and — like every other record in this framework — no delete
 * route exists for it (see FRAMEWORK_GUIDELINES.md's Cleanup strategy). A
 * real calendar month is therefore a finite, non-renewable resource shared
 * by every future suite run, exactly the C1-style exhaustion risk flagged in
 * FRAMEWORK_TECH_DEBT.md for fixed-persona leave balances — except here it's
 * worse, because there's no reset mechanism even in principle.
 *
 * `payrollRunCreateSchema`/the DB's own CHECK constraint only bound
 * period_month to 1-12 — period_year is confirmed unbounded both at the Zod
 * and DB layer (PR-BD-02/PR-DB-07). Every API-driven run-lifecycle test
 * exploits that gap deliberately: it asks for a run in a year thousands of
 * years from now, which can never collide with real payroll data or with a
 * concurrent worker's own call (60,000 possible (year,month) pairs is
 * comfortably more than this suite will ever create in one run). Only the
 * handful of tests that must exercise the *real* Month/Year <select> (the
 * create-run dialog itself, PR-UI-04/PR-FN-09) use the actual current month —
 * accepted as a one-time-per-real-calendar-month cost, same trade-off
 * FRAMEWORK_TECH_DEBT.md's C1 already accepts for fixed-persona leave/attendance state.
 */
export function uniquePayrollPeriod(): { year: number; month: number } {
  const seed = hashToSafeInt(uniqueSuffix());
  return { year: 3000 + (seed % 5000), month: 1 + (seed % 12) };
}

/**
 * `overtime_entries` has a UNIQUE(tenant_id, user_id, work_date) constraint
 * and no delete route either. Rather than exhausting a real employee's
 * once-per-day OT slot (the same C1-style risk `uniquePayrollPeriod()`
 * documents above), every OT-entry-creating helper/test picks a work_date
 * far enough in the future, and jittered widely enough, that it can never
 * collide with real usage or a concurrent worker's own call.
 */
export function uniqueOvertimeDate(): string {
  const seed = hashToSafeInt(uniqueSuffix());
  const d = new Date();
  d.setDate(d.getDate() + 3650 + (seed % 3000));
  return d.toISOString().slice(0, 10);
}

/**
 * `bank_account_number` carries no uniqueness constraint (unlike
 * Aadhaar/PAN — see fixtures/test-data.ts's uniqueAadhaar() doc comment), so
 * this only needs to be a syntactically plausible digit string, not globally
 * unique — a fixed-width, uniqueSuffix()-derived value is enough to avoid any
 * accidental resemblance to a real account number.
 */
export function uniqueBankAccountNumber(): string {
  return uniqueSuffix().replace(/\D/g, '').padStart(12, '9').slice(-12);
}

// PR-BD-01 — payrollRunCreateSchema has no month range check of its own; the
// route's manual `periodMonth < 1 || periodMonth > 12` check is the only floor.
export const PERIOD_MONTH_BOUNDARY = [
  { value: 1, shouldPass: true, label: 'January (lower bound)' },
  { value: 12, shouldPass: true, label: 'December (upper bound)' },
  { value: 0, shouldPass: false, label: 'zero (one under the lower bound)' },
  { value: 13, shouldPass: false, label: '13 (one over the upper bound)' },
];

// PR-BD-02 / PR-DB-07 — confirmed gap: no *explicit* Zod or DB CHECK bounds
// period_year. A negative value is accepted as-is (proving that gap). A
// huge one (99999) still fails — not from any bounds check, but because it
// overflows SQL Server's own DATE range (0001-9999) once the route builds
// cycle_start_date/cycle_end_date from it, surfacing as an unhandled 500
// ("Validation failed for parameter 'cycleStartDate'. Out of range.") —
// confirmed live, an implicit ceiling the CSV's own "both extremes accepted"
// expectation didn't anticipate.
export const PERIOD_YEAR_EXTREME_VALUES = [
  { value: -5, shouldSucceed: true, label: 'a negative year (no explicit bounds check)' },
  { value: 99999, shouldSucceed: false, label: 'a year overflowing SQL Server\'s own DATE range (implicit ceiling, not a validation error)' },
];

// PR-BD-03 / PR-NG-06 — ctc_annual has no Zod floor; only the DB CHECK
// (ctc_annual >= 0) rejects a negative value.
export const CTC_ANNUAL_BOUNDARY = [
  { value: '0', shouldPass: true, label: 'exactly zero' },
  { value: '-1', shouldPass: false, label: 'a small negative value (DB CHECK only)' },
];

// PR-BD-04 — overtimeEntrySchema has no numeric/range check on hours; only
// the DB CHECK (hours > 0 AND hours <= 24) is the real floor/ceiling.
export const OVERTIME_HOURS_BOUNDARY = [
  { value: '24', shouldPass: true, label: 'exactly 24 (upper bound)' },
  { value: '24.01', shouldPass: false, label: '24.01 (just over the upper bound)' },
  { value: '0.01', shouldPass: true, label: 'just above zero (lower bound is exclusive)' },
  { value: '0', shouldPass: false, label: 'exactly zero (lower bound is exclusive)' },
];

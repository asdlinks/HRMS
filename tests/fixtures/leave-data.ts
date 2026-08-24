/**
 * Data-driven fixtures for the Leave Management suite (docs/LeaveManagement_TestCases.csv).
 * Kept in its own file per the same convention as attendance-data.ts — reuses
 * uniqueSuffix() from test-data.ts rather than re-deriving a counter.
 */
import { uniqueSuffix } from './test-data';

/** Exported so other Leave-suite files (helpers/leave.ts) don't redefine it. */
export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compares a raw `leaves.start_date`/`end_date` value straight off a
 * GET /leaves (or similar) JSON response against a plain `YYYY-MM-DD` string.
 * MSSQL's DATE columns round-trip through the tedious driver as a full ISO
 * timestamp (e.g. `2026-03-05T00:00:00.000Z`), not the bare date string that
 * was sent on create — a plain `===` against the original ISO date silently
 * never matches. Used by the API-contract/notification specs that read leave
 * rows straight back from the API rather than through the UI's own
 * already-formatted grid text (see helpers/leave.ts's formatDisplayDate for
 * that side of the same underlying gotcha).
 */
export function sameDate(rawDbValue: string, iso: string): boolean {
  return toIso(new Date(rawDbValue)) === iso;
}

let callCounter = 0;

/**
 * A Monday→(Monday+spanDays) date range, always at least ~90 days in the
 * future and jittered by `Date.now() % 300` so that even a same-calendar-day
 * rerun of the full suite against the shared `employeeSelf`/`manager`
 * personas never collides with a leave request an earlier run already left
 * behind (leaves.repository.js's overlap check is scoped per-user, and these
 * personas persist across runs — unlike a freshly created employee, which
 * has no history to collide with regardless of dates chosen).
 */
export function uniqueWeekdayRange(spanDays = 1): { start: string; end: string } {
  // callCounter (not just Date.now()) spreads rapid successive same-process
  // calls (e.g. a loop applying several leaves back to back) across
  // different weeks — two calls a few ms apart would otherwise round up to
  // the same Monday and collide on the app's own overlapping-leave rule.
  callCounter += 1;
  const jitterDays = (Date.now() + callCounter * 37) % 300;
  const start = new Date();
  start.setDate(start.getDate() + 90 + jitterDays);
  while (start.getDay() !== 1) start.setDate(start.getDate() + 1); // land on a Monday
  const end = new Date(start);
  end.setDate(end.getDate() + spanDays);
  // A Monday start + a multiple-of-7 span (e.g. spanDays=6) always lands
  // exactly on the following Sunday — the app's own client-side "no
  // Sunday" guard would then silently block every submission with this
  // span, deterministically, not by chance. Nudge forward one day rather
  // than let any spanDays value produce an unusable end date.
  if (end.getDay() === 0) end.setDate(end.getDate() + 1);
  return { start: toIso(start), end: toIso(end) };
}

/** The next Sunday at least `fromDaysOut` days out — for the Sunday-blocked negative case. */
export function nextSunday(fromDaysOut = 60): string {
  const d = new Date();
  d.setDate(d.getDate() + fromDaysOut);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  return toIso(d);
}

/**
 * A weekday date safely in the past (for LV-FN-03's isPastLeave auto-approve
 * path), clamped to never fall before the app's own hardcoded date-picker
 * floor ('2026-01-01' — see docs/Attendance_AutomationDesign.md-style known
 * gaps; LeavesPage.tsx hardcodes the same literal) so native `min` never
 * fights the fill.
 */
export function pastWeekdayDate(daysAgo = 14): string {
  // Unlike uniqueWeekdayRange, this had no jitter at all — a same-day rerun
  // against a fixed persona (employeeSelf/manager) produced the identical
  // date every time, guaranteeing an overlapping-leave collision against
  // that persona's own history from an earlier run the same day. `% 5`
  // spreads reruns across up to 5 distinct past dates instead.
  const jitterDays = Date.now() % 5;
  const d = new Date();
  d.setDate(d.getDate() - daysAgo - jitterDays);
  while (d.getDay() === 0) d.setDate(d.getDate() - 1);
  const iso = toIso(d);
  return iso < '2026-01-01' ? '2026-01-01' : iso;
}

/** Next year's Dec 31 → Jan 1 — for the year-boundary usedDays test (LV-BD-04). */
export function nextYearBoundaryRange(): { start: string; end: string } {
  const year = new Date().getFullYear() + 1;
  return { start: `${year}-12-31`, end: `${year + 1}-01-01` };
}

export function uniqueLeaveTypeName(prefix = 'E2E Type'): string {
  return `${prefix} ${uniqueSuffix()}`;
}

// LV-BD-02 — usedDays + requestedDays exactly == allocation.days (accepted, strict `>` not `>=`) vs one day over (rejected).
export const LEAVE_BALANCE_BOUNDARY = [
  { extraDays: 0, shouldPass: true, label: 'exactly at the allocation (accepted — strict > check)' },
  { extraDays: 1, shouldPass: false, label: 'one day over the allocation (rejected)' },
];

// LV-BD-01 — Flexi Holiday count boundary (server enforces count >= 2 rejects the 3rd, regardless of which specific dates).
export const FLEXI_HOLIDAY_CAP = 2;

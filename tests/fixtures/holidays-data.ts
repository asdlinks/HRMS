/**
 * Data-driven fixtures for the Holidays suite (docs/Holidays_TestCases.csv)
 * — same per-file convention as companyProfile-data.ts/rbac-data.ts. Reuses
 * uniqueSuffix() (test-data.ts) rather than re-deriving it.
 */
import { uniqueSuffix } from './test-data';

export function uniqueHolidayName(prefix = 'E2E Holiday'): string {
  return `${prefix} ${uniqueSuffix()}`;
}

export function uniqueLocationName(prefix = 'E2E Holiday Location'): string {
  return `${prefix} ${uniqueSuffix()}`;
}

/**
 * A deterministic-but-collision-safe future date, well past the app's
 * hardcoded 2026-01-01 date-picker minimum (see FRAMEWORK_GUIDELINES.md's
 * "Date generation" section) given today's date is already past that floor.
 * Nudged off Sunday so a holiday-blocking assertion isn't confounded with
 * leaves.routes.js's separate, unconditional Sunday block (isHolidayOrWeekend
 * checks `getDay() === 0` before ever touching the holidays table).
 *
 * The day offset is derived from uniqueSuffix() (not a bare counter) so
 * parallel workers calling this in the same millisecond still land on
 * different calendar days — collisions here would mean two tests creating a
 * "regular" holiday on the same date, which is harmless (holidays.routes.js
 * has no uniqueness constraint — see HL-NG-06) but would make an
 * HL-SC-01-style leave-blocking assertion ambiguous about which holiday
 * caused the rejection.
 */
export function uniqueFutureNonSundayDate(): string {
  const suffix = uniqueSuffix();
  const dayOffset = 30 + (Number(suffix.slice(-4)) % 300); // 30..329 days out
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // never land on a Sunday
  return d.toISOString().slice(0, 10);
}

/**
 * The single soonest possible non-Sunday date (tomorrow, or the day after if
 * tomorrow is a Sunday) — specifically for HL-FN-11/HL-UI-06's
 * dashboard-widget test. HolidayTimelineCard.tsx only ever renders the 5
 * SOONEST upcoming holidays; every other date generator in this file
 * (uniqueFutureNonSundayDate()) deliberately spreads 30-329 days out
 * precisely so unrelated tests' holidays never collide with each other,
 * which also means a tenant that accumulates enough of them (this framework
 * never deletes disposable records — see FRAMEWORK_GUIDELINES.md's Cleanup
 * strategy) will eventually push any one of them out of that top-5 window.
 * Deliberately NOT randomized within a range (an earlier version spread
 * 1-6 days out) — confirmed live that even that narrower range accumulates
 * enough same-day competitors across repeated runs within one calendar day
 * to occasionally miss the top-5 itself. The single earliest possible day is
 * the best available mitigation, not a full guarantee: it remains
 * theoretically possible for 5+ *other* holidays (real tenant data, or
 * another run earlier the same calendar day) to already occupy tomorrow's
 * slot, which would still need to be read as an environment/test-data
 * artifact of this framework's never-delete policy, not a product defect.
 */
export function nearFutureNonSundayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * `testauto` tenant's "Kochi" location (id 35) — confirmed live to be the
 * `location_id` shared by the `employeeSelf`/`manager`/`usersManageOnly`/
 * `hrDirectory` personas (`admin` alone has `location_id: NULL`). Used by
 * HL-FN-09 (default-to-own-location) and the HL-SC-* cross-location leave
 * tests, the same "hardcoded, documented live env fact" pattern
 * personas.ts's `LOCKED_ACCOUNT_NAME` already establishes.
 */
export const KNOWN_KOCHI_LOCATION_ID = 35;

// HL-BD-01 — holidays.name / flexi_holidays.name is NVARCHAR(255); no schema-level length cap exists (server/schemas/index.js's holidayCreateSchema only checks .min(1)).
export const HOLIDAY_NAME_LENGTH_BOUNDARY = [
  { value: 'A'.repeat(255), shouldPass: true, label: '255 characters (at the DB column limit)' },
  { value: 'A'.repeat(256), shouldPass: false, label: '256 characters (one over — fails only at the DB layer)' },
];

/**
 * Data-driven fixtures for the Announcements suite (docs/Announcements_TestCases.csv)
 * — same per-file convention as holidays-data.ts/rbac-data.ts. Reuses
 * uniqueSuffix() (test-data.ts) rather than re-deriving it.
 */
import { uniqueSuffix } from './test-data';

export function uniqueAnnouncementTitle(prefix = 'E2E Announcement'): string {
  return `${prefix} ${uniqueSuffix()}`;
}

export function uniqueAnnouncementBody(prefix = 'E2E announcement body'): string {
  return `${prefix} ${uniqueSuffix()}`;
}

/**
 * announcements.title is NVARCHAR(200) and announcementCreateSchema mirrors
 * that exact limit (`z.string().min(1).max(200)`) — unlike holidays.name,
 * this one IS schema-enforced, so both ends of the boundary are expected to
 * behave as a clean 200/400, not fail through to a raw DB error. Bare
 * `'A'.repeat(n)` (not uniqueSuffix()-prefixed) — announcements carry no
 * uniqueness constraint at all (AN-NG-06 duplicates are freely accepted, no
 * dedup, same as Holidays' HL-NG-06), so collision-safety isn't a concern
 * here, matching HOLIDAY_NAME_LENGTH_BOUNDARY's identical shape.
 */
export const ANNOUNCEMENT_TITLE_LENGTH_BOUNDARY = [
  { value: 'A'.repeat(200), shouldPass: true, label: 'at the 200-character schema+column limit' },
  { value: 'A'.repeat(201), shouldPass: false, label: '201 characters — one over, rejected by the schema itself (not a DB-layer failure)' },
];

/**
 * Data-driven fixtures for the Company Profile Settings suite
 * (docs/CompanyProfileSettings_TestCases.csv) — same per-file convention as
 * companyDocuments-data.ts/rbac-data.ts. Reuses uniqueSuffix() (test-data.ts)
 * rather than re-deriving it.
 */
import { uniqueSuffix } from './test-data';

export function uniqueCompanyName(prefix = 'E2E Company'): string {
  return `${prefix} ${uniqueSuffix()}`;
}

// CP-BD-02 — theme color hex-length boundary: server/schemas/index.js's
// companyProfileUpdateSchema regex is ^#[0-9A-Fa-f]{6,8}$ — a regex
// repetition RANGE, so 6, 7, AND 8 hex digits all match (confirmed live —
// an earlier version of this fixture wrongly assumed {6,8} meant "exactly 6
// or exactly 8" and expected 7 digits to be rejected; it isn't). The real
// boundary is one digit outside the 6-8 range on either side.
export const THEME_COLOR_LENGTH_BOUNDARY = [
  { value: '#4f46e5', shouldPass: true, label: '6 hex digits (lower bound)' },
  { value: '#4f46e5f', shouldPass: true, label: '7 hex digits (mid-range)' },
  { value: '#4f46e5ff', shouldPass: true, label: '8 hex digits (upper bound, with alpha)' },
  { value: '#4f46e', shouldPass: false, label: '5 hex digits (one under)' },
  { value: '#4f46e5fff', shouldPass: false, label: '9 hex digits (one over)' },
];

// CP-NG-04 — malformed theme colors rejected outright by the same regex.
export const INVALID_THEME_COLORS = [
  { value: 'red', label: 'a named color, not hex' },
  { value: '#fff', label: '3-digit shorthand hex' },
  { value: '4f46e5', label: 'missing leading #' },
  { value: '#gggggg', label: 'non-hex characters' },
];

// CP-BD-03 — financial_year_start_month boundary (schema: z.number().int().min(1).max(12)).
export const FY_START_MONTH_BOUNDARY = [
  { value: 1, shouldPass: true, label: 'January (lower bound)' },
  { value: 12, shouldPass: true, label: 'December (upper bound)' },
  { value: 0, shouldPass: false, label: 'zero (one under)' },
  { value: 13, shouldPass: false, label: 'thirteen (one over)' },
];

// CP-NG-06 / CP-NG-07 (confirmed gaps) — currency/date_format have dedicated
// UI dropdowns (CURRENCY_OPTIONS/DATE_FORMAT_OPTIONS in SettingsPage.tsx) but
// no server-side z.enum — only a bare min/max length check — so any string
// within length passes.
export const INVALID_CURRENCY_SAMPLE = 'banana';
export const INVALID_DATE_FORMAT_SAMPLE = 'not-a-format';

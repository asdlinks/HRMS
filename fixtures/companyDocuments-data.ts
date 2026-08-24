/**
 * Data-driven fixtures for the Company Documents suite
 * (docs/CompanyDocuments_TestCases.csv) — same per-file convention as
 * attendance-data.ts/leave-data.ts/payroll-data.ts/rbac-data.ts. Reuses
 * uniqueSuffix() (test-data.ts) and toIso() (leave-data.ts) rather than
 * re-deriving either.
 */
import { uniqueSuffix } from './test-data';
import { toIso } from './leave-data';

/** Mirrors server/schemas/index.js's DOCUMENT_CATEGORIES exactly (also the DB's CK_company_documents_category CHECK list, migration 035). */
export const DOCUMENT_CATEGORIES = [
  'Leave Policies', 'HR Policies', 'Employee Handbook', 'Code of Conduct', 'IT Policies',
  'Payroll Policies', 'Holiday Lists', 'Insurance Documents', 'Company Forms', 'Templates', 'Other Documents',
] as const;

export function uniqueDocumentTitle(prefix = 'E2E Document'): string {
  return `${prefix} ${uniqueSuffix()}`;
}

/** Today, in the app's own YYYY-MM-DD wire format — the default effective_date for a disposable document. */
export function todayIso(): string {
  return toIso(new Date());
}

/** N days from today — for expiry_date and boundary cases (CD-BD-03/04). */
export function daysFromToday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toIso(d);
}

// CD-BD-06 — title at the schema's 255-character limit vs one over.
export const TITLE_LENGTH_BOUNDARY = [
  { value: 'A'.repeat(255), shouldPass: true, label: '255 characters (at limit)' },
  { value: 'A'.repeat(256), shouldPass: false, label: '256 characters (over limit)' },
];

// CD-BD-02 — category enum match is exact-string, not case-insensitive.
export const CATEGORY_CASING_VARIANTS = [
  { value: 'leave policies', label: 'all-lowercase' },
  { value: 'LEAVE POLICIES', label: 'all-uppercase' },
  { value: 'Leave policies', label: 'mixed case' },
];

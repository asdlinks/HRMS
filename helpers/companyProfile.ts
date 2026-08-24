/**
 * Shared "arrange"/API helpers for the Company Profile Settings suite
 * (docs/CompanyProfileSettings_TestCases.csv). No existing helper file
 * touches `/api/company` or the `attendance_link` settings key — per
 * FRAMEWORK_GUIDELINES.md this gets its own file rather than being bolted
 * onto companyDocuments.ts/leave.ts.
 *
 * Deliberately API-level (page.request.*), same shape as
 * helpers/companyDocuments.ts's raw-vs-disposable split.
 */
import { type APIResponse, type Page } from '@playwright/test';
import { assertOk } from './rbac';

export interface CompanyProfilePayload {
  name: string;
  logo_url?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  contact_email?: string | null;
  website?: string | null;
  currency: string;
  date_format: string;
  financial_year_start_month: number;
  theme_primary_color?: string | null;
  theme_secondary_color?: string | null;
}

/** GET /api/company — raw, doesn't assert. Requires company.view or company.manage. */
export async function getCompanyProfileApi(page: Page): Promise<APIResponse> {
  return page.request.get('/api/company');
}

/**
 * PUT /api/company — raw, doesn't assert, and sends `data` EXACTLY as given
 * with no merge against the current row. `companyRepo.updateCompanyProfile`
 * (server/repositories/company.repository.js) is a full-column UPDATE that
 * substitutes `?? null` for every field not present in the body — NOT a
 * partial/COALESCE update. A permission/validation-negative test that
 * expects this call to be REJECTED can safely pass a minimal payload (no
 * write ever lands). Any test that expects this to SUCCEED against the real,
 * shared tenant row must go through withTemporaryCompanyProfile() below
 * instead of calling this directly, or it will silently null out every
 * column the test didn't think to include.
 */
export async function updateCompanyProfileApi(page: Page, data: Partial<CompanyProfilePayload>): Promise<APIResponse> {
  return page.request.put('/api/company', { data });
}

/**
 * Snapshots the tenant's real company profile (via `page`, which must hold
 * company.manage), PUTs `overrides` merged on top of that full snapshot, runs
 * `use()`, then restores the exact original profile in `finally` — the same
 * capture/mutate/restore-in-finally discipline as helpers/leave.ts's
 * withTemporaryLeaveType(), required here because of updateCompanyProfileApi's
 * full-overwrite behavior documented above. GET's extra fields (id, slug,
 * status, subscription_plan_name, etc. — not part of companyProfileUpdateSchema)
 * are harmless to echo back in the PUT body: no schema in this codebase uses
 * z.object().strict(), so Zod silently strips unknown keys rather than
 * rejecting them (confirmed by reading server/schemas/index.js).
 */
export async function withTemporaryCompanyProfile<T>(
  page: Page,
  overrides: Partial<CompanyProfilePayload>,
  use: () => Promise<T>,
): Promise<T> {
  const getResponse = await getCompanyProfileApi(page);
  assertOk(getResponse);
  const original = await getResponse.json();

  const putResponse = await updateCompanyProfileApi(page, { ...original, ...overrides });
  assertOk(putResponse);
  try {
    return await use();
  } finally {
    const restoreResponse = await updateCompanyProfileApi(page, original);
    assertOk(restoreResponse);
  }
}

/** GET /api/settings — raw, doesn't assert. Carries NO permission guard at all (CP-FN-04/CP-AP-03/CP-SC-02 — confirmed by reading server/routes/settings.routes.js; also proven for other keys by leave-settings.spec.ts's LV-SC-03 and payroll-settings.spec.ts's PR-AP-09). */
export async function getSettingsApi(page: Page): Promise<APIResponse> {
  return page.request.get('/api/settings');
}

/** POST /api/settings/bulk — raw, doesn't assert. `payload` is a plain key/value object; each key is checked against settings.routes.js's KEY_PERMISSION map (any key absent from that 4-entry map bypasses the permission check entirely — CP-NG-08/09/CP-SC-01). */
export async function bulkUpdateSettingsApi(page: Page, payload: Record<string, unknown>): Promise<APIResponse> {
  return page.request.post('/api/settings/bulk', { data: payload });
}

/**
 * Snapshots the tenant's current `attendance_link` value, sets a temporary
 * one via the API, runs `use()`, then restores the original — attendance_link
 * lives in the same shared, tenant-wide `settings` KV row as
 * leave_allocations/payroll_settings/attendance_rules, so it needs the same
 * read-mutate-restore discipline leave-settings.spec.ts already established
 * for leave_allocations (see that file's header comment).
 */
export async function withTemporaryAttendanceLink<T>(page: Page, value: string, use: () => Promise<T>): Promise<T> {
  const getResponse = await getSettingsApi(page);
  assertOk(getResponse);
  const original: string = (await getResponse.json()).attendance_link ?? '';

  const setResponse = await bulkUpdateSettingsApi(page, { attendance_link: value });
  assertOk(setResponse);
  try {
    return await use();
  } finally {
    const restoreResponse = await bulkUpdateSettingsApi(page, { attendance_link: original });
    assertOk(restoreResponse);
  }
}

/**
 * A byte buffer one over SettingsPage.tsx's client-side logo size cap
 * (`file.size > 300 * 1024`, checked in handleLogoUpload before any
 * FileReader/image-decode is attempted) — generated at test-runtime rather
 * than committed, the same choice helpers/companyDocuments.ts's
 * oversizedFileBuffer() makes for its own (much larger) 20MB boundary.
 * Content is arbitrary: the check never inspects file contents, only
 * `file.size`.
 */
export function oversizedLogoBuffer(): Buffer {
  return Buffer.alloc(300 * 1024 + 1);
}

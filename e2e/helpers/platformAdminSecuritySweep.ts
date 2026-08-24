import type { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Final Cross-Cutting Security & Validation Sweep (Phase 9) API helpers.
 * `PUT /companies/:id` (the general profile-update route — name/address/
 * currency/date_format/financial_year/theme) has no existing helper in
 * `helpers/platformAdminCompanies.ts` (Phase 3/4, read-only slice) or
 * `helpers/platformAdminCompanyLifecycle.ts` (Phase 5, status/subscription/
 * reset-password mutations only, never the general profile route) — added
 * here rather than touching either frozen file.
 */
export function updateCompanyProfileRequest(ctx: APIRequestContext, id: string | number, body: object): Promise<APIResponse> {
  return ctx.put(`/api/platform-admin/companies/${id}`, { data: body });
}

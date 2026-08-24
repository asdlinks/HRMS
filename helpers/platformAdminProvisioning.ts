import type { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Company Provisioning (create) API helper — kept in its own file rather than
 * added to the frozen Phase 3 `helpers/platformAdminCompanies.ts` (which is
 * read-only GET helpers for List/Detail), per FRAMEWORK_GUIDELINES.md's
 * "create helpers/<module>.ts" convention and this phase's "do not modify
 * frozen files" constraint.
 */
export function createCompanyRequest(ctx: APIRequestContext, payload: object): Promise<APIResponse> {
  return ctx.post('/api/platform-admin/companies', { data: payload });
}

import type { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Company Management (Lifecycle Mutations, Phase 5) API helpers — mirrors
 * helpers/platformAdminCompanies.ts's shape (Phase 3/4, read-only) for the
 * mutation endpoints: activate/suspend/status/reset-admin-password/
 * subscription. Kept in its own file per FRAMEWORK_GUIDELINES.md's
 * "create helpers/<module>.ts" convention rather than growing either the
 * frozen Phase 3/4 file or Phase 3's provisioning helper.
 */

export function activateCompanyRequest(ctx: APIRequestContext, id: string | number): Promise<APIResponse> {
  return ctx.post(`/api/platform-admin/companies/${id}/activate`);
}

export function suspendCompanyRequest(ctx: APIRequestContext, id: string | number): Promise<APIResponse> {
  return ctx.post(`/api/platform-admin/companies/${id}/suspend`);
}

export function setCompanyStatusRequest(ctx: APIRequestContext, id: string | number, status: string): Promise<APIResponse> {
  return ctx.post(`/api/platform-admin/companies/${id}/status`, { data: { status } });
}

export function resetAdminPasswordRequest(ctx: APIRequestContext, id: string | number): Promise<APIResponse> {
  return ctx.post(`/api/platform-admin/companies/${id}/reset-admin-password`);
}

export function assignSubscriptionRequest(
  ctx: APIRequestContext,
  id: string | number,
  body: Record<string, unknown>
): Promise<APIResponse> {
  return ctx.put(`/api/platform-admin/companies/${id}/subscription`, { data: body });
}

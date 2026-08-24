import type { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Company Management (List/Detail, read-only slice) API helpers — mirrors
 * helpers/platformAdmin.ts's shape (Phase 1) for the /companies endpoints,
 * kept in its own file per FRAMEWORK_GUIDELINES.md's "create helpers/<module>.ts"
 * convention rather than growing the frozen Phase 1 file.
 */

export function listCompaniesRequest(
  ctx: APIRequestContext,
  params: { search?: string; status?: string; page?: number; pageSize?: number } = {}
): Promise<APIResponse> {
  const query: Record<string, string> = {};
  if (params.search !== undefined) query.search = params.search;
  if (params.status !== undefined) query.status = params.status;
  if (params.page !== undefined) query.page = String(params.page);
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize);
  return ctx.get('/api/platform-admin/companies', { params: query });
}

export function getCompanyRequest(ctx: APIRequestContext, id: string | number): Promise<APIResponse> {
  return ctx.get(`/api/platform-admin/companies/${id}`);
}

export function getTenantHealthRequest(ctx: APIRequestContext, id: string | number): Promise<APIResponse> {
  return ctx.get(`/api/platform-admin/companies/${id}/health`);
}

export function getTenantUsageRequest(ctx: APIRequestContext, id: string | number): Promise<APIResponse> {
  return ctx.get(`/api/platform-admin/companies/${id}/usage`);
}

export function getProvisioningHistoryRequest(ctx: APIRequestContext, id: string | number): Promise<APIResponse> {
  return ctx.get(`/api/platform-admin/companies/${id}/provisioning-history`);
}

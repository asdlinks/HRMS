import type { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Subscription Plan CRUD (Phase 6) API helpers — mirrors
 * helpers/platformAdminCompanies.ts's shape for the /subscription-plans
 * endpoints. Kept in its own file per FRAMEWORK_GUIDELINES.md's
 * "create helpers/<module>.ts" convention.
 */

export function listPlansRequest(ctx: APIRequestContext, activeOnly?: boolean): Promise<APIResponse> {
  return ctx.get('/api/platform-admin/subscription-plans', { params: activeOnly ? { activeOnly: 'true' } : undefined });
}

export function getPlanRequest(ctx: APIRequestContext, id: string | number): Promise<APIResponse> {
  return ctx.get(`/api/platform-admin/subscription-plans/${id}`);
}

export function createPlanRequest(ctx: APIRequestContext, body: object): Promise<APIResponse> {
  return ctx.post('/api/platform-admin/subscription-plans', { data: body });
}

export function updatePlanRequest(ctx: APIRequestContext, id: string | number, body: object): Promise<APIResponse> {
  return ctx.put(`/api/platform-admin/subscription-plans/${id}`, { data: body });
}

export function deletePlanRequest(ctx: APIRequestContext, id: string | number): Promise<APIResponse> {
  return ctx.delete(`/api/platform-admin/subscription-plans/${id}`);
}

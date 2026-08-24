import type { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Employee Limit & Module Gating (Phase 7) tenant-side API helpers. Unlike
 * every other Platform Admin helper file, these hit the TENANT `/api/*`
 * surface (`/api/users`, `/api/payroll/components`), not
 * `/api/platform-admin/*` — Phase 7 is about what a subscription plan
 * actually DOES to a tenant, so it needs a real tenant session (obtained via
 * the frozen Phase 5 `resetAdminPasswordRequest` + helpers/tenantAuth.ts's
 * `rawLogin`, the same pattern Phase 5 already established for driving a
 * specific company's admin session).
 */

export function createEmployeeRequest(ctx: APIRequestContext, payload: object, authHeaders: Record<string, string>): Promise<APIResponse> {
  return ctx.post('/api/users', { data: payload, headers: authHeaders });
}

/** GET /api/payroll/components — requires `payroll.components.manage` OR
 * `payroll.structures.manage` (server/routes/payrollComponents.routes.js);
 * used here purely as a real, permission-gated route to probe module-level
 * gating against, not because payroll itself is the point. */
export function getPayrollComponentsRequest(ctx: APIRequestContext, authHeaders: Record<string, string>): Promise<APIResponse> {
  return ctx.get('/api/payroll/components', { headers: authHeaders });
}

export function listUsersRequest(ctx: APIRequestContext, authHeaders: Record<string, string>): Promise<APIResponse> {
  return ctx.get('/api/users', { headers: authHeaders });
}

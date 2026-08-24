import type { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Dashboard & System Health (Phase 8) API helpers — mirrors
 * helpers/platformAdminCompanies.ts's shape (Phase 3/4) for these two
 * read-only, no-mutation endpoints.
 */

export function getDashboardRequest(ctx: APIRequestContext): Promise<APIResponse> {
  return ctx.get('/api/platform-admin/dashboard');
}

export function getSystemHealthRequest(ctx: APIRequestContext): Promise<APIResponse> {
  return ctx.get('/api/platform-admin/system-health');
}

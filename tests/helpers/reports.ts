/**
 * Shared "arrange"/API helpers for the Reports Engine suite — API-level
 * (page.request.*), the same shape as helpers/rbac.ts's getAllRoles() etc.,
 * since most Reports tests need to inspect the catalog/scope/export
 * behavior directly rather than only through the UI.
 */
import { type Page } from '@playwright/test';
import { test } from '../fixtures/auth';
import { assertOk } from './rbac';

/**
 * Skips the current test when `page`'s persona holds NONE of the given
 * reports.* permission codes in the CURRENT tenant. Generalizes rbac.ts's
 * requireRolesManage() for this module: tenant RBAC state for reports.* was
 * confirmed live (Reports Engine stabilization pass) to have drifted from
 * server/services/tenantProvisioning.service.js's documented per-role
 * template — every one of the 5 configured personas held only the legacy,
 * functionally-unused `reports.view` flag and none of the granular
 * `reports.*.view.*`/flat permissions the router actually checks, until that
 * drift was corrected tenant-side via the Roles & Permissions UI/API ahead
 * of this pass. A live re-check (not a static assumption from
 * e2e/.env.e2e.example) keeps this suite correct if it drifts again.
 */
export async function requireAnyReportsPermission(page: Page, codes: string[], reason: string): Promise<void> {
  const response = await page.request.post('/api/auth/refresh');
  assertOk(response);
  const body = await response.json();
  const permissions: string[] = body.permissions ?? [];
  test.skip(!codes.some((c) => permissions.includes(c)), reason);
}

export interface ReportColumn {
  field: string;
  headerName: string;
}

export interface ReportChartConfig {
  type: 'bar' | 'line' | 'pie';
  xField?: string;
  yField?: string;
  nameField?: string;
  valueField?: string;
}

export interface ReportCatalogEntry {
  id: string;
  category: string;
  title: string;
  description?: string;
  filters: string[];
  columns: ReportColumn[];
  chart: ReportChartConfig | null;
  favoritable: boolean;
  stub: boolean;
  defaultSortField?: string;
}

export async function getReportCatalogApi(page: Page): Promise<ReportCatalogEntry[]> {
  const response = await page.request.get('/api/reports/catalog');
  assertOk(response);
  return response.json();
}

/** Raw response (not asserted ok) — callers checking a 403/404/400/etc. need the unwrapped status. */
export function getReportDataApi(page: Page, reportId: string, params: Record<string, string | number> = {}) {
  return page.request.get(`/api/reports/${reportId}/data`, { params: params as Record<string, string> });
}

export function exportReportApi(page: Page, reportId: string, format: string, params: Record<string, string> = {}) {
  return page.request.get(`/api/reports/${reportId}/export`, { params: { ...params, format } });
}

export function getDashboardSummaryApi(page: Page) {
  return page.request.get('/api/reports/dashboard/summary');
}

export async function getFavoritesApi(page: Page): Promise<string[]> {
  const response = await page.request.get('/api/reports/favorites');
  assertOk(response);
  return response.json();
}

export function addFavoriteApi(page: Page, reportId: string) {
  return page.request.post(`/api/reports/favorites/${reportId}`);
}

export function removeFavoriteApi(page: Page, reportId: string) {
  return page.request.delete(`/api/reports/favorites/${reportId}`);
}

export interface SavedReportFilter {
  id: number;
  report_id: string;
  name: string;
  filters: Record<string, unknown>;
  created_at: string;
}

export async function getSavedFiltersApi(page: Page, reportId?: string): Promise<SavedReportFilter[]> {
  const response = await page.request.get('/api/reports/saved-filters', { params: reportId ? { reportId } : {} });
  assertOk(response);
  return response.json();
}

export function saveFilterApi(page: Page, data: { reportId: string; name: string; filters: Record<string, unknown> }) {
  return page.request.post('/api/reports/saved-filters', { data });
}

export function deleteSavedFilterApi(page: Page, id: number) {
  return page.request.delete(`/api/reports/saved-filters/${id}`);
}

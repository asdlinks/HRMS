/**
 * Shared "arrange"/API helpers for the Menu Management suite
 * (docs/MenuManagement_TestCases.csv). No existing helper file touches
 * `/api/menu` — per FRAMEWORK_GUIDELINES.md this gets its own file rather
 * than being bolted onto rbac.ts/companyProfile.ts.
 *
 * Deliberately API-level (page.request.*), same shape as
 * helpers/companyProfile.ts's raw-vs-temporary split.
 */
import { type APIResponse, type Page } from '@playwright/test';
import { test } from '../fixtures/auth';
import { assertOk } from './rbac';

export interface MenuItemRow {
  id: number;
  parent_id: number | null;
  name: string;
  path: string;
  icon: string;
  module: string | null;
  permission: string | null;
  any_permission: string | null; // comma-separated, or null — see menu.repository.js's parseAnyPermission
  sort_order: number;
  is_active: boolean | number;
  is_placeholder: boolean | number;
  is_feature_enabled: boolean | number;
}

/** GET /api/menu — raw, doesn't assert. Carries NO permission guard at all beyond `authenticate` (MM-AP-01/MM-PM-02 — confirmed by reading server/routes/menu.routes.js). */
export async function getMenuItemsApi(page: Page): Promise<APIResponse> {
  return page.request.get('/api/menu');
}

/** GET /api/menu/tree — raw, doesn't assert. Also carries no permission guard beyond `authenticate`; the tree itself is what's permission-filtered. */
export async function getMenuTreeApi(page: Page): Promise<APIResponse> {
  return page.request.get('/api/menu/tree');
}

/**
 * PUT /api/menu — raw, doesn't assert, and sends `items` EXACTLY as given.
 * menu.repository.js's replaceMenuItems is a full DELETE-then-reinsert
 * transaction for the caller's tenant, NOT a partial/merge update — a test
 * that expects this to SUCCEED against the real, shared tenant menu must go
 * through withTemporaryMenu() below instead of calling this directly, or it
 * will permanently replace every other module's nav entry for the whole
 * `testauto` tenant.
 */
export async function replaceMenuItemsApi(page: Page, items: object[]): Promise<APIResponse> {
  return page.request.put('/api/menu', { data: { items } });
}

/**
 * Converts a GET /api/menu row (snake_case, `any_permission` as a
 * comma-string) into the shape PUT /api/menu's menuItemSchema expects
 * (`anyPermission` as an array) — MM-VD-03's round-trip conversion, done
 * here once instead of per-test. Preserves `id`/`parent_id` verbatim so
 * feeding a full, unmodified snapshot back through this produces a true
 * no-op replace (new DB ids get assigned, but content/order is identical).
 */
export function toPutPayload(rows: MenuItemRow[]): object[] {
  return rows.map((r) => ({
    id: r.id,
    parent_id: r.parent_id,
    name: r.name,
    path: r.path,
    icon: r.icon,
    module: r.module,
    permission: r.permission,
    anyPermission: r.any_permission ? r.any_permission.split(',').filter(Boolean) : undefined,
    sort_order: r.sort_order,
    is_active: !!r.is_active,
    is_placeholder: !!r.is_placeholder,
    is_feature_enabled: !!r.is_feature_enabled,
  }));
}

/**
 * Snapshots the tenant's real, full menu (via `page`, which must hold
 * menu.manage), PUTs the result of `mutate(original)` in its place, runs
 * `use()`, then restores the exact original menu in `finally` — the same
 * capture/mutate/restore-in-finally discipline as
 * helpers/companyProfile.ts's withTemporaryCompanyProfile(), required here
 * because PUT /menu is a full tenant-wide wipe-and-reinsert (see
 * replaceMenuItemsApi's doc comment), an even more destructive shared-state
 * mutation than Company Profile's single-row overwrite. Every spec file that
 * calls this wraps its tests in `test.describe.serial()` — concurrent
 * mutation of the SAME tenant's entire nav from parallel workers would race
 * and corrupt every other module's menu, not just this suite's own state.
 */
export async function withTemporaryMenu<T>(
  page: Page,
  mutate: (original: MenuItemRow[]) => object[],
  use: () => Promise<T>,
): Promise<T> {
  const getResponse = await getMenuItemsApi(page);
  assertOk(getResponse);
  const original: MenuItemRow[] = await getResponse.json();

  const putResponse = await replaceMenuItemsApi(page, mutate(original));
  assertOk(putResponse);
  try {
    return await use();
  } finally {
    const restoreResponse = await replaceMenuItemsApi(page, toPutPayload(original));
    assertOk(restoreResponse);
  }
}

export interface MenuTreeNode {
  id: number | string;
  path: string;
  children: MenuTreeNode[];
}

/** Flattens GET /api/menu/tree's nested response into a flat list of every visible path, at any depth. */
export function flattenTreePaths(nodes: MenuTreeNode[]): string[] {
  return nodes.flatMap((n) => [n.path, ...flattenTreePaths(n.children || [])]);
}

/**
 * Skips the current test when `page`'s persona doesn't hold menu.manage in
 * the CURRENT tenant — same "read the live token claim via
 * POST /api/auth/refresh" idiom as helpers/rbac.ts's requireRolesManage(),
 * for the same reason: tenant RBAC state for the configured personas isn't
 * guaranteed to match any documented baseline (FRAMEWORK_TECH_DEBT.md's C3).
 */
export async function requireMenuManage(page: Page): Promise<void> {
  const response = await page.request.post('/api/auth/refresh');
  assertOk(response);
  const body = await response.json();
  test.skip(!body.permissions?.includes('menu.manage'), 'This persona does not hold menu.manage in the current tenant — cannot exercise menu-mutation flows.');
}

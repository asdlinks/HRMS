/**
 * Shared "arrange"/API helpers for the RBAC & Roles suite. No existing
 * helper file touches roles/permissions — per FRAMEWORK_GUIDELINES.md this
 * gets its own file rather than being bolted onto seed.ts/leave.ts.
 *
 * These are deliberately API-level (page.request.*), not UI flows — most
 * RBAC tests need a disposable role/permission-set to exist as fast,
 * reliable *setup* so the test itself can focus on the actual assertion
 * (permission guard, union semantics, cross-tenant isolation, ...), the same
 * shape as helpers/payroll.ts's createPayrollRunApi().
 */
import { type Page } from '@playwright/test';
import { test } from '../fixtures/auth';
import { uniqueRoleName } from '../fixtures/rbac-data';

/**
 * Throws with a clear, diagnosable message instead of letting a 403/404
 * body (`{error: "..."}`, not an array) reach `.find()`/`.length` downstream
 * and fail with a cryptic `TypeError: X.find is not a function` — confirmed
 * live during the first RBAC stabilization run: every one of
 * getAllRoles/getAllPermissions/getRoleIdsForUser crashed this way the
 * moment a persona's assumed roles.view/roles.manage grant turned out not
 * to hold in the current tenant, instead of surfacing the real cause.
 *
 * Exported (Company Documents automation pass) so a second module's
 * "assume this API call succeeded" arrange helpers can reuse the exact same
 * diagnosis instead of a third near-identical copy — see helpers/companyDocuments.ts.
 */
export function assertOk(response: { ok(): boolean; status(): number; url(): string }): void {
  if (!response.ok()) {
    throw new Error(`Expected a successful response from ${response.url()}, got ${response.status()} — check the caller's permissions before assuming this shape.`);
  }
}

/**
 * Skips the current test when `page`'s persona doesn't hold roles.manage in
 * the CURRENT tenant — call this as the first line of any test that creates,
 * edits, or deletes a role/permission-set/user-role-assignment. Confirmed
 * live (RBAC stabilization pass): tenant RBAC state for the configured
 * personas does not always match e2e/.env.e2e.example's documented
 * baseline (the same class of drift FRAMEWORK_TECH_DEBT.md's C3 already
 * flags for shifts.manage/attendance.policy.manage) — sometimes NONE of the
 * 5 personas holds roles.manage at all. Reads the live token claim via
 * POST /api/auth/refresh (side-effect-free — re-signs, mutates nothing)
 * rather than attempting a mutation and inferring from its failure, so it
 * costs no cleanup and can safely run before any other setup in the test.
 */
export async function requireRolesManage(page: Page): Promise<void> {
  const response = await page.request.post('/api/auth/refresh');
  assertOk(response);
  const body = await response.json();
  test.skip(!body.permissions?.includes('roles.manage'), 'This persona does not hold roles.manage in the current tenant — cannot exercise role-mutation flows. See the RBAC Stabilization Report\'s Test Data Issue on tenant RBAC drift.');
}

/**
 * Same shape as requireRolesManage(), for the handful of read-only contract
 * checks that only need roles.view OR roles.manage (roles.routes.js's
 * requireAnyPermission(['roles.view', 'roles.manage'])).
 */
export async function requireRolesViewOrManage(page: Page): Promise<void> {
  const response = await page.request.post('/api/auth/refresh');
  assertOk(response);
  const body = await response.json();
  const permissions: string[] = body.permissions ?? [];
  test.skip(!permissions.includes('roles.view') && !permissions.includes('roles.manage'), 'This persona holds neither roles.view nor roles.manage in the current tenant.');
}

export interface PermissionRow {
  id: number;
  code: string;
  module: string;
  description: string | null;
}

export interface RoleRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  // The mssql driver's BIT-column mapping isn't asserted here as strictly
  // boolean — every call site treats this as a truthy/falsy check
  // (`r.is_system` / `.toBeFalsy()`), never a strict `=== true`.
  is_system: boolean | number;
  user_count: number;
  permissions: string[];
}

/** GET /api/roles/permissions — the full, tenant-agnostic permission catalogue. Assumes the caller already holds roles.view/roles.manage (see requireRolesManage/requireRolesViewOrManage). */
export async function getAllPermissions(page: Page): Promise<PermissionRow[]> {
  const response = await page.request.get('/api/roles/permissions');
  assertOk(response);
  return response.json();
}

/** GET /api/roles — every role in the caller's tenant, each with its permission codes. Assumes the caller already holds roles.view/roles.manage (see requireRolesManage/requireRolesViewOrManage). */
export async function getAllRoles(page: Page): Promise<RoleRow[]> {
  const response = await page.request.get('/api/roles');
  assertOk(response);
  return response.json();
}

/**
 * Creates a disposable, zero-permission role via POST /api/roles.
 * `cloneFromRoleId` mirrors the "Clone permissions from" dialog option.
 */
export async function createRoleApi(
  page: Page,
  overrides: Partial<{ name: string; description: string; cloneFromRoleId: number }> = {}
): Promise<{ id: number; name: string }> {
  const name = overrides.name ?? uniqueRoleName();
  const response = await page.request.post('/api/roles', {
    data: { name, description: overrides.description, cloneFromRoleId: overrides.cloneFromRoleId },
  });
  const body = await response.json();
  return { id: body.id, name };
}

/** PUT /api/roles/:id/permissions — full-replace, matching the app's own semantics. */
export async function setRolePermissionsApi(page: Page, roleId: number, permissionCodes: string[]) {
  return page.request.put(`/api/roles/${roleId}/permissions`, { data: { permissionCodes } });
}

/**
 * Looks up a tenant user's currently-assigned role ids from GET /api/users —
 * the list endpoint's `role_ids` field is a comma-separated string
 * (roleNamesSubquery() in users.repository.js, a FOR XML PATH concatenation,
 * not a JSON array), so this is the one place that string gets parsed back
 * into numbers. Used to capture a persona's own roles before a destructive
 * mutation so the exact original state can be restored afterward.
 */
export async function getRoleIdsForUser(page: Page, userId: number): Promise<number[]> {
  const response = await page.request.get('/api/users');
  assertOk(response);
  const users: Array<{ id: number; role_ids: string | null }> = await response.json();
  const user = users.find((u) => u.id === userId);
  if (!user?.role_ids) return [];
  return user.role_ids.split(',').map(Number);
}

/** PUT /api/users/:id/roles — full-replace, matching the app's own semantics. */
export async function setUserRolesApi(page: Page, userId: number, roleIds: number[]) {
  return page.request.put(`/api/users/${userId}/roles`, { data: { roleIds } });
}

/**
 * Decodes (never verifies — no signing secret available to this suite, nor
 * needed) an access token's payload, for RB-AP-08's "decode the issued JWT
 * and compare its permissions claim" check. `signAccessToken` mints a
 * standard three-segment JWT; the middle segment is the base64url-encoded
 * payload `auth.routes.js` builds from `{userId, tenantId, permissions}`.
 */
export function decodeAccessTokenPermissions(accessToken: string): string[] {
  const payloadSegment = accessToken.split('.')[1];
  const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf-8'));
  return payload.permissions ?? [];
}

import { test, expect } from '../fixtures/auth';
import { RolesPermissionsPanel } from '../pages/RolesPermissionsPanel';
import { Toast } from '../pages/components/Toast';
import { skipUnlessVisible } from '../helpers/guards';
import {
  createRoleApi, setRolePermissionsApi, getAllPermissions, getAllRoles,
  requireRolesManage, requireRolesViewOrManage,
} from '../helpers/rbac';
import { uniqueRoleName, ROLE_NAME_LENGTH_BOUNDARY } from '../fixtures/rbac-data';
import { SQL_INJECTION_PAYLOADS } from '../fixtures/test-data';

/**
 * docs/RBAC_Roles_TestCases.csv — the "Roles & Permissions" Settings tab
 * (client/src/pages/SettingsPage.tsx) and its backing routes
 * (server/routes/roles.routes.js).
 *
 * Automates: RB-FN-01/02/03/04/05/06/13, RB-AP-01/02/03/04/05, RB-NG-01/03/04,
 * RB-UI-01/02/03/04/05/06/07, RB-VD-01/02/04, RB-BD-01/04, RB-SC-09.
 *
 * Deliberately elsewhere (not duplicated here): RB-FN-07/08/09/10/11/14,
 * RB-AP-06/08, RB-BD-05, RB-VD-03, RB-UI-08 — user_roles/login-union
 * concerns live in rbac-user-role-assignment.spec.ts, which also
 * cross-references EM-FN-18/EM-VD-11/EM-NG-11/EM-PM-11 in
 * role-assignment.spec.ts rather than re-testing the identical Manage Roles
 * flow. Cross-cutting security/permission-matrix rows (RB-NG-08/10/11,
 * RB-SC-*, RB-PM-*) live in rbac-security-permissions.spec.ts. Everything
 * else (DB/PF rows, bespoke-persona rows, RB-NG-02/12) is in
 * rbac-not-automatable.spec.ts.
 *
 * RBAC Stabilization pass: tenant RBAC state for the configured personas
 * does not reliably match e2e/.env.e2e.example's documented baseline —
 * confirmed live, `admin` currently holds ZERO permissions in this tenant
 * (not just missing roles.manage). Every mutation test below calls
 * requireRolesManage(adminPage) as its FIRST statement (before any other
 * setup) so a persona lacking roles.manage produces one clear, honest skip
 * instead of a cryptic TypeError from a helper assuming a 403 body is an
 * array. RB-FN-01/02 (read-only contract checks) run against hrDirectoryPage
 * instead of adminPage — hrDirectory is confirmed to hold roles.view, which
 * is all a GET needs (requireAnyPermission(['roles.view','roles.manage'])).
 */

test.describe('RBAC — Roles API contracts', () => {
  test('RB-FN-01 / RB-AP-01: GET /roles/permissions returns the full catalogue, ordered by module then code', { tag: ['@sanity'] }, async ({ hrDirectoryPage }) => {
    // A pure read — needs roles.view OR roles.manage (requireAnyPermission).
    // Run against hrDirectoryPage, not adminPage: confirmed live that admin
    // currently holds neither in this tenant, while hrDirectory holds
    // roles.view — see this file's header note.
    await requireRolesViewOrManage(hrDirectoryPage);
    const response = await hrDirectoryPage.request.get('/api/roles/permissions');
    expect(response.status()).toBe(200);
    const permissions = await response.json();
    expect(Array.isArray(permissions)).toBe(true);
    expect(permissions.length).toBeGreaterThan(0);
    for (const p of permissions) {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('code');
      expect(p).toHaveProperty('module');
      expect(p).toHaveProperty('description');
    }
    const sorted = [...permissions].sort((a, b) => a.module.localeCompare(b.module) || a.code.localeCompare(b.code));
    expect(permissions.map((p: { code: string }) => p.code)).toEqual(sorted.map((p: { code: string }) => p.code));
  });

  test('RB-FN-02 / RB-AP-02: GET /roles returns id, code, name, description, is_system, live user_count, and permissions[] per role', { tag: ['@sanity'] }, async ({ hrDirectoryPage }) => {
    await requireRolesViewOrManage(hrDirectoryPage);
    const roles = await getAllRoles(hrDirectoryPage);
    expect(roles.length).toBeGreaterThan(0);
    for (const r of roles) {
      expect(r).toHaveProperty('id');
      expect(r).toHaveProperty('code');
      expect(r).toHaveProperty('name');
      expect(['boolean', 'number']).toContain(typeof r.is_system);
      expect(typeof r.user_count).toBe('number');
      expect(Array.isArray(r.permissions)).toBe(true);
    }
  });

  test('RB-FN-03 / RB-AP-03: POST /roles with name only derives a slugified code, zero permissions, is_system=0', { tag: ['@smoke'] }, async ({ adminPage }) => {
    await requireRolesManage(adminPage);
    const name = uniqueRoleName('RB-FN-03');
    const response = await adminPage.request.post('/api/roles', { data: { name } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('id');

    const roles = await getAllRoles(adminPage);
    const created = roles.find((r) => r.id === body.id);
    expect(created).toBeTruthy();
    expect(created?.code).toBe(name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 50));
    expect(created?.permissions).toEqual([]);
    expect(created?.is_system).toBeFalsy();
  });

  test('RB-FN-04: POST /roles with cloneFromRoleId copies the source role\'s entire permission set', { tag: ['@regression'] }, async ({ adminPage }) => {
    await requireRolesManage(adminPage);
    const permissions = await getAllPermissions(adminPage);
    const sourceCode = permissions[0].code;
    const source = await createRoleApi(adminPage, { name: uniqueRoleName('RB-FN-04-source') });
    await setRolePermissionsApi(adminPage, source.id, [sourceCode]);

    const cloneResponse = await adminPage.request.post('/api/roles', {
      data: { name: uniqueRoleName('RB-FN-04-clone'), cloneFromRoleId: source.id },
    });
    const { id: cloneId } = await cloneResponse.json();

    const roles = await getAllRoles(adminPage);
    const clone = roles.find((r) => r.id === cloneId);
    expect(clone?.permissions).toEqual([sourceCode]);
  });

  test('RB-FN-05 / RB-AP-04: PUT /:id/permissions fully replaces the prior set atomically, returns {success:true}', { tag: ['@regression'] }, async ({ adminPage }) => {
    await requireRolesManage(adminPage);
    const permissions = await getAllPermissions(adminPage);
    const [codeA, codeB] = [permissions[0].code, permissions[1].code];
    const role = await createRoleApi(adminPage, { name: uniqueRoleName('RB-FN-05') });

    const firstSave = await setRolePermissionsApi(adminPage, role.id, [codeA, codeB]);
    expect(firstSave.status()).toBe(200);
    expect(await firstSave.json()).toEqual({ success: true });
    let roles = await getAllRoles(adminPage);
    expect(roles.find((r) => r.id === role.id)?.permissions.sort()).toEqual([codeA, codeB].sort());

    // A second, smaller submission must fully REPLACE (codeA gone), not merge.
    const secondSave = await setRolePermissionsApi(adminPage, role.id, [codeB]);
    expect(secondSave.status()).toBe(200);
    roles = await getAllRoles(adminPage);
    expect(roles.find((r) => r.id === role.id)?.permissions).toEqual([codeB]);
  });

  test('RB-FN-06 / RB-AP-05: DELETE /:id removes a non-system role, returns {success:true}', { tag: ['@regression'] }, async ({ adminPage }) => {
    await requireRolesManage(adminPage);
    const role = await createRoleApi(adminPage, { name: uniqueRoleName('RB-FN-06') });
    const response = await adminPage.request.delete(`/api/roles/${role.id}`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const roles = await getAllRoles(adminPage);
    expect(roles.find((r) => r.id === role.id)).toBeUndefined();
  });

  test('RB-NG-01 (confirmed gap): a role name that normalizes to an existing role\'s code surfaces as an unhandled 500, not a clean 409', { tag: ['@regression'] }, async ({ adminPage }) => {
    // Two names differing only by case collapse to the identical slugified
    // code (roles.repository.js's createRole: name.trim().toLowerCase()...) —
    // a guaranteed, unambiguous collision, rather than relying on the CSV's
    // own punctuation example (which this suite's own derivation of the same
    // regex does not actually collide on: "Finance Approver!" -> a TRAILING
    // underscore the plain "finance approver" variant never gets).
    await requireRolesManage(adminPage);
    const base = uniqueRoleName('RB-NG-01');
    const first = await adminPage.request.post('/api/roles', { data: { name: base } });
    expect(first.status()).toBe(200);

    const second = await adminPage.request.post('/api/roles', { data: { name: base.toUpperCase() } });
    // Confirmed gap: no isUniqueViolation handling on this route — the raw
    // SQL UNIQUE-constraint error surfaces as a generic 500, not a 409.
    expect(second.status()).toBe(500);
  });

  test('RB-NG-03 (confirmed gap): unknown/misspelled permission codes are silently dropped with a 200, no warning', { tag: ['@regression'] }, async ({ adminPage }) => {
    await requireRolesManage(adminPage);
    const permissions = await getAllPermissions(adminPage);
    const realCode = permissions[0].code;
    const role = await createRoleApi(adminPage, { name: uniqueRoleName('RB-NG-03') });

    const response = await setRolePermissionsApi(adminPage, role.id, [realCode, 'totally-not-a-real-permission']);
    expect(response.status()).toBe(200);

    const roles = await getAllRoles(adminPage);
    const saved = roles.find((r) => r.id === role.id)?.permissions ?? [];
    expect(saved).toContain(realCode);
    expect(saved).not.toContain('totally-not-a-real-permission');
  });

  test('RB-NG-04: DELETE on the system role (is_system=1) is rejected with 400, role is not removed', { tag: ['@regression'] }, async ({ adminPage }) => {
    await requireRolesManage(adminPage);
    const roles = await getAllRoles(adminPage);
    const systemRole = roles.find((r) => r.is_system);
    test.skip(!systemRole, 'No is_system=1 role visible to admin in this tenant.');

    const response = await adminPage.request.delete(`/api/roles/${systemRole!.id}`);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/System roles cannot be deleted/);

    const rolesAfter = await getAllRoles(adminPage);
    expect(rolesAfter.find((r) => r.id === systemRole!.id)).toBeTruthy();
  });

  test('RB-VD-01: roleCreateSchema rejects a missing or empty-string name with 400', { tag: ['@sanity'] }, async ({ adminPage }) => {
    await requireRolesManage(adminPage);
    const missing = await adminPage.request.post('/api/roles', { data: {} });
    expect(missing.status()).toBe(400);

    const empty = await adminPage.request.post('/api/roles', { data: { name: '' } });
    expect(empty.status()).toBe(400);
  });

  test('RB-VD-02: rolePermissionsSchema rejects permissionCodes submitted as a non-array with 400', { tag: ['@sanity'] }, async ({ adminPage }) => {
    await requireRolesManage(adminPage);
    const role = await createRoleApi(adminPage, { name: uniqueRoleName('RB-VD-02') });
    const response = await adminPage.request.put(`/api/roles/${role.id}/permissions`, { data: { permissionCodes: 'not-an-array' } });
    expect(response.status()).toBe(400);
  });

  test('RB-VD-04: cloneFromRoleId as a non-numeric string passes Zod (z.union([z.string(), z.number()])) but fails binding to the sql.Int parameter', { tag: ['@sanity'] }, async ({ adminPage }) => {
    await requireRolesManage(adminPage);
    const response = await adminPage.request.post('/api/roles', {
      data: { name: uniqueRoleName('RB-VD-04'), cloneFromRoleId: 'not-a-number' },
    });
    // roleCreateSchema's cloneFromRoleId type-checks as EITHER a string or a
    // number, so any string (including a non-numeric one) passes Zod
    // validation — the actual rejection, if any, happens one layer down when
    // roles.repository.js binds it to a declared sql.Int parameter. Same
    // driver-level "Validation failed for parameter" shape confirmed live in
    // payroll-security-permissions.spec.ts's PR-SC-05 for the identical
    // int-parameter-with-a-non-numeric-value case.
    if (response.status() === 500) {
      expect((await response.json()).error).toMatch(/Validation failed for parameter/i);
    } else {
      expect(response.status()).toBe(400);
    }
  });

  test('RB-BD-01: role name at exactly the NVARCHAR(100) limit is accepted', { tag: ['@sanity'] }, async ({ adminPage }) => {
    await requireRolesManage(adminPage);
    const atLimit = ROLE_NAME_LENGTH_BOUNDARY[0];
    const response = await adminPage.request.post('/api/roles', { data: { name: atLimit.value } });
    expect(response.status()).toBe(200);
  });

  test('RB-BD-01: role name one character over the NVARCHAR(100) limit is rejected or truncated, never silently accepted verbatim', { tag: ['@sanity'] }, async ({ adminPage }) => {
    // Without this guard, a persona lacking roles.manage gets a 403 here,
    // which the boundary assertion below would misread as "rejected" (403
    // >= 400) — a false pass that never actually exercised the NVARCHAR
    // boundary. Confirmed live in the first stabilization run.
    await requireRolesManage(adminPage);
    const overLimit = ROLE_NAME_LENGTH_BOUNDARY[1];
    const response = await adminPage.request.post('/api/roles', { data: { name: overLimit.value } });
    if (response.ok()) {
      const { id } = await response.json();
      const roles = await getAllRoles(adminPage);
      expect(roles.find((r) => r.id === id)?.name.length).toBeLessThanOrEqual(100);
    } else {
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('RB-BD-04: permissionCodes as an empty array clears all permissions; the full catalogue grants everything matched — both succeed', { tag: ['@regression'] }, async ({ adminPage }) => {
    await requireRolesManage(adminPage);
    const allCodes = (await getAllPermissions(adminPage)).map((p) => p.code);
    const role = await createRoleApi(adminPage, { name: uniqueRoleName('RB-BD-04') });

    const emptyResponse = await setRolePermissionsApi(adminPage, role.id, []);
    expect(emptyResponse.status()).toBe(200);
    let roles = await getAllRoles(adminPage);
    expect(roles.find((r) => r.id === role.id)?.permissions).toEqual([]);

    const fullResponse = await setRolePermissionsApi(adminPage, role.id, allCodes);
    expect(fullResponse.status()).toBe(200);
    roles = await getAllRoles(adminPage);
    expect(roles.find((r) => r.id === role.id)?.permissions.sort()).toEqual([...allCodes].sort());
  });

  for (const payload of SQL_INJECTION_PAYLOADS) {
    test(`RB-SC-09: a SQL-injection-shaped role name ("${payload}") is stored literally via a parameterized query, tenant stays reachable`, { tag: ['@regression'] }, async ({ adminPage }) => {
      await requireRolesManage(adminPage);
      const name = `${payload} ${uniqueRoleName()}`;
      const response = await adminPage.request.post('/api/roles', { data: { name } });
      expect(response.status()).toBe(200);
      const { id } = await response.json();

      const roles = await getAllRoles(adminPage);
      expect(roles.find((r) => r.id === id)?.name).toBe(name);
      // A real injection would have broken every subsequent call on this
      // connection/tenant — confirm the roles table (and tenant) is still
      // fully reachable afterward, same closing check EM-SC-04 uses.
      expect((await adminPage.request.get('/api/roles')).status()).toBe(200);
    });
  }
});

test.describe('RBAC — Roles & Permissions UI', () => {
  test('RB-UI-01: the Roles & Permissions tab is visible only to a persona holding roles.manage', { tag: ['@sanity'] }, async ({ adminPage, usersManageOnlyPage }) => {
    const adminPanel = new RolesPermissionsPanel(adminPage);
    await adminPanel.goto();
    await skipUnlessVisible(adminPanel.navItem, 'admin persona does not hold roles.manage in this tenant either.');
    await expect(adminPanel.navItem).toBeVisible();

    // usersManageOnlyPage holds users.manage ONLY — deliberately missing
    // roles.manage (e2e/.env.e2e.example) — the same persona EM-UI-12 uses
    // to prove the analogous Manage Roles action is absent.
    const restrictedPanel = new RolesPermissionsPanel(usersManageOnlyPage);
    await restrictedPanel.goto();
    await expect(restrictedPanel.navItem).toHaveCount(0);
  });

  test('RB-UI-02 / RB-FN-13 / RB-PM-04 (partial): permission checkboxes are grouped by module in accordions, and users.pii.manage renders under its own "people" group, not beside "users"', { tag: ['@regression'] }, async ({ adminPage }) => {
    const panel = new RolesPermissionsPanel(adminPage);
    await panel.goto();
    // goto() already clicks navItem when visible — gate on the tab's own
    // content (not a second click of the already-clicked nav item) to
    // confirm the Roles panel actually rendered for this persona.
    await skipUnlessVisible(panel.newRoleButton, 'admin persona does not hold roles.manage in this tenant either.');

    const permissions = await getAllPermissions(adminPage);
    const piiPermission = permissions.find((p) => p.code === 'users.pii.manage');
    test.skip(!piiPermission, 'users.pii.manage is not present in this tenant\'s permission catalogue.');
    const anyUsersModulePermission = permissions.find((p) => p.module === 'users');
    test.skip(!anyUsersModulePermission, 'No plain "users" module permission exists to prove separation against.');

    const roles = await getAllRoles(adminPage);
    test.skip(roles.length === 0, 'Tenant has no roles to expand.');
    await panel.expandRole(roles[0].name);

    // RB-FN-13: at least two distinct module groups render as separate accordions sections.
    await expect(panel.moduleHeading(roles[0].name, 'people')).toBeVisible();
    await expect(panel.moduleHeading(roles[0].name, 'users')).toBeVisible();

    // RB-UI-02: the pii checkbox lives in the "people" group, and specifically NOT in "users".
    const piiLabel = piiPermission!.description || piiPermission!.code;
    await expect(panel.permissionGroup(roles[0].name, 'people').getByLabel(piiLabel, { exact: true })).toBeVisible();
    await expect(panel.permissionGroup(roles[0].name, 'users').getByLabel(piiLabel, { exact: true })).toHaveCount(0);
  });

  test('RB-UI-03 / RB-NG-01 (confirmed gap, UI angle): the New Role dialog has no client-side duplicate-name check — submission proceeds and surfaces the server\'s 500', { tag: ['@regression'] }, async ({ adminPage }) => {
    // Guard BEFORE fetching roles — getAllRoles() 403s for a persona lacking
    // roles.manage, which previously crashed here with a cryptic TypeError
    // (roles.length undefined) rather than skipping cleanly.
    await requireRolesManage(adminPage);
    const panel = new RolesPermissionsPanel(adminPage);
    const roles = await getAllRoles(adminPage);
    test.skip(roles.length === 0, 'Tenant has no existing role to collide against.');
    const existing = roles[0];

    await panel.goto();
    await skipUnlessVisible(panel.newRoleButton, 'admin persona does not hold roles.manage in this tenant either.');
    await panel.openNewRoleDialog();
    // Same display name, opposite case — normalizes to the identical code as
    // `existing` (roles.repository.js lowercases before slugifying), matching
    // RB-NG-01's guaranteed-collision derivation.
    await panel.fillNewRole({ name: existing.name.toUpperCase() });
    await panel.submitNewRole();

    // No pre-submit validation blocks this — the dialog stays open and the
    // generic "Failed to create role" error toast fires (handleCreateRole's
    // catch branch, SettingsPage.tsx), proving there is no client-side
    // duplicate check at all.
    await expect(panel.newRoleDialog).toBeVisible();
    await new Toast(adminPage).expectVisible(/Failed to create role/);
  });

  test('RB-UI-04: the Delete Role button is hidden entirely for the system role', { tag: ['@sanity'] }, async ({ adminPage }) => {
    await requireRolesManage(adminPage);
    const roles = await getAllRoles(adminPage);
    const systemRole = roles.find((r) => r.is_system);
    test.skip(!systemRole, 'No is_system=1 role visible to admin in this tenant.');

    const panel = new RolesPermissionsPanel(adminPage);
    await panel.goto();
    await skipUnlessVisible(panel.newRoleButton, 'admin persona does not hold roles.manage in this tenant either.');
    await panel.expandRole(systemRole!.name);

    await expect(panel.deleteRoleButton(systemRole!.name)).toHaveCount(0);
  });

  test('RB-UI-05 / RB-FN-06 (UI angle): the Delete Role confirmation shows only static warning text (no live affected-user preview), and confirming it removes the role\'s accordion', { tag: ['@sanity'] }, async ({ adminPage }) => {
    await requireRolesManage(adminPage);
    const role = await createRoleApi(adminPage, { name: uniqueRoleName('RB-UI-05') });

    const panel = new RolesPermissionsPanel(adminPage);
    await panel.goto();
    await skipUnlessVisible(panel.newRoleButton, 'admin persona does not hold roles.manage in this tenant either.');
    await panel.expandRole(role.name);
    await panel.openDeleteRole(role.name);

    await expect(panel.deleteRoleConfirmDialog.getByText('Users holding this role will lose the permissions it granted.', { exact: true })).toBeVisible();

    await panel.confirmDeleteRole();
    await expect(panel.accordion(role.name)).toHaveCount(0);
  });

  test('RB-UI-06: toggling a permission checkbox without clicking Save Permissions leaves a draft-only change, not persisted', { tag: ['@regression'] }, async ({ adminPage }) => {
    await requireRolesManage(adminPage);
    const permissions = await getAllPermissions(adminPage);
    const target = permissions[0];
    const role = await createRoleApi(adminPage, { name: uniqueRoleName('RB-UI-06') });

    const panel = new RolesPermissionsPanel(adminPage);
    await panel.goto();
    await skipUnlessVisible(panel.newRoleButton, 'admin persona does not hold roles.manage in this tenant either.');
    await panel.expandRole(role.name);

    const label = target.description || target.code;
    await panel.permissionCheckbox(role.name, label).check();
    await expect(panel.permissionCheckbox(role.name, label)).toBeChecked();

    // A raw reload (not panel.goto()) — SettingsPage remounts on its default
    // tab, so navItem needs a fresh, real click here; permission state can't
    // have changed mid-test, so no second skipUnlessVisible guard is needed.
    await adminPage.reload();
    await panel.navItem.click();
    await panel.expandRole(role.name);
    await expect(panel.permissionCheckbox(role.name, label)).not.toBeChecked();

    // Mirror image, same role/permission: this time click Save Permissions —
    // the flash alert appears and the change survives a reload.
    await panel.permissionCheckbox(role.name, label).check();
    await panel.savePermissions(role.name);
    await expect(panel.savedAlert).toBeVisible();

    await adminPage.reload();
    await panel.navItem.click();
    await panel.expandRole(role.name);
    await expect(panel.permissionCheckbox(role.name, label)).toBeChecked();
  });

  test('RB-UI-07 / RB-FN-04 (UI angle): the "Clone permissions from" selector is populated from the current tenant\'s existing roles, and actually cloning through it inherits the source\'s permissions', { tag: ['@sanity'] }, async ({ adminPage }) => {
    await requireRolesManage(adminPage);
    const permissions = await getAllPermissions(adminPage);
    const source = await createRoleApi(adminPage, { name: uniqueRoleName('RB-UI-07-source') });
    await setRolePermissionsApi(adminPage, source.id, [permissions[0].code]);
    const cloneName = uniqueRoleName('RB-UI-07-clone');

    const panel = new RolesPermissionsPanel(adminPage);
    await panel.goto();
    await skipUnlessVisible(panel.newRoleButton, 'admin persona does not hold roles.manage in this tenant either.');
    await panel.openNewRoleDialog();
    await panel.cloneFromRoleSelect.click();
    await expect(adminPage.getByRole('option', { name: source.name, exact: true })).toBeVisible();

    await panel.fillNewRole({ name: cloneName });
    await panel.selectCloneFromRole(source.name);
    await panel.submitNewRole();
    await panel.expectDialogClosed();

    const roles = await getAllRoles(adminPage);
    expect(roles.find((r) => r.name === cloneName)?.permissions).toEqual([permissions[0].code]);
  });
});

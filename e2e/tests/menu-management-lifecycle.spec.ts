import { test, expect } from '../fixtures/auth';
import { MenuManagementPanel } from '../pages/MenuManagementPanel';
import {
  getMenuItemsApi, getMenuTreeApi, replaceMenuItemsApi, toPutPayload, flattenTreePaths,
  type MenuItemRow,
} from '../helpers/menu';
import { uniqueMenuName } from '../fixtures/menu-data';

/**
 * docs/MenuManagement_TestCases.csv — Settings > Menu Management tab's
 * functional round-trip and UI-observable behavior. Automates: MM-FN-03,
 * MM-FN-04, MM-FN-05, MM-FN-06, MM-FN-09, MM-NG-05, MM-VD-02, MM-UI-01,
 * MM-UI-02, MM-UI-03, MM-UI-04, MM-UI-05.
 *
 * Not separately tested: MM-UI-06 (comparing is_active vs is_feature_enabled
 * behavior) is the union of MM-FN-05/MM-FN-06 below (each switch affects
 * GET /tree) and menu-management-permissions-security.spec.ts's MM-SC-01/
 * MM-SC-02 (neither has any server-side route-enforcement effect) — writing
 * it a third time would just restate those. MM-FN-07 (plan-driven gating)
 * and MM-FN-08 (sidebar-refresh timing) are in menu-management-not-automatable.spec.ts.
 *
 * `.serial()`: every mutating test here does a full DELETE-and-reinsert of
 * the tenant's ENTIRE menu (PUT /menu's own semantics — see helpers/menu.ts's
 * replaceMenuItemsApi doc comment), an even more destructive shared-state
 * surface than Company Profile's single-row overwrite. Running these
 * concurrently would corrupt every other module's nav for the whole
 * `testauto` tenant, not just this suite's own state. Same accepted
 * cross-file race tradeoff as company-profile-lifecycle.spec.ts's header
 * comment documents — a genuinely different file mutating the same tenant
 * menu at the literal same instant is not solved by serializing this file
 * alone.
 */
test.describe.serial('Menu Management — Lifecycle', () => {
  test.beforeEach(() => { test.slow(); });

  test('MM-FN-03: a valid, ordered full-replace payload (parents before children, ids preserved) persists correctly', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const newName = uniqueMenuName('FN-03');
    let targetPath = '';
    const original: MenuItemRow[] = await (await getMenuItemsApi(adminPage)).json();
    try {
      const payload = toPutPayload(original) as Array<{ name: string; path: string }>;
      targetPath = original[0].path;
      payload[0].name = newName;
      const putResponse = await replaceMenuItemsApi(adminPage, payload);
      expect(putResponse.status()).toBe(200);

      const after: MenuItemRow[] = await (await getMenuItemsApi(adminPage)).json();
      expect(after.find((r) => r.path === targetPath)?.name).toBe(newName);
    } finally {
      await replaceMenuItemsApi(adminPage, toPutPayload(original));
    }
  });

  test('MM-FN-04: reordering via the up/down arrows rewrites sort_order as index*10 and persists via PUT /menu', { tag: ['@regression'] }, async ({ adminPage }) => {
    const original: MenuItemRow[] = await (await getMenuItemsApi(adminPage)).json();
    const topLevel = original.filter((r) => r.parent_id == null).sort((a, b) => a.sort_order - b.sort_order);
    test.skip(topLevel.length < 2, 'Need at least 2 top-level menu items to prove a reorder swap.');
    const [first, second] = topLevel;

    const panel = new MenuManagementPanel(adminPage);
    try {
      await panel.goto();
      await expect(panel.saveButton).toBeVisible();
      await panel.moveDownButton(first.path).click();
      await panel.save();
      await expect(panel.savedAlert).toBeVisible();

      const after: MenuItemRow[] = await (await getMenuItemsApi(adminPage)).json();
      const afterFirst = after.find((r) => r.path === first.path)!;
      const afterSecond = after.find((r) => r.path === second.path)!;
      expect(afterSecond.sort_order).toBeLessThan(afterFirst.sort_order); // swapped
      expect(afterFirst.sort_order % 10).toBe(0); // rewritten as index*10
    } finally {
      await replaceMenuItemsApi(adminPage, toPutPayload(original));
    }
  });

  test('MM-FN-05: toggling the Visible switch off hides the item from GET /menu/tree once saved', { tag: ['@regression'] }, async ({ adminPage }) => {
    const original: MenuItemRow[] = await (await getMenuItemsApi(adminPage)).json();
    const target = original.find((r) => r.is_active && r.parent_id != null);
    test.skip(!target, 'No currently-visible child row exists in this tenant to hide.');

    const panel = new MenuManagementPanel(adminPage);
    try {
      await panel.goto();
      await panel.visibleSwitch(target!.path).click();
      await panel.save();
      await expect(panel.savedAlert).toBeVisible();

      const tree = await (await getMenuTreeApi(adminPage)).json();
      expect(flattenTreePaths(tree)).not.toContain(target!.path);
    } finally {
      await replaceMenuItemsApi(adminPage, toPutPayload(original));
    }
  });

  test('MM-FN-06: toggling the Feature Enabled switch off hides the item from GET /menu/tree once saved', { tag: ['@regression'] }, async ({ adminPage }) => {
    const original: MenuItemRow[] = await (await getMenuItemsApi(adminPage)).json();
    const target = original.find((r) => r.is_feature_enabled && r.parent_id != null);
    test.skip(!target, 'No currently-feature-enabled child row exists in this tenant to disable.');

    const panel = new MenuManagementPanel(adminPage);
    try {
      await panel.goto();
      await panel.featureEnabledSwitch(target!.path).click();
      await panel.save();
      await expect(panel.savedAlert).toBeVisible();

      const tree = await (await getMenuTreeApi(adminPage)).json();
      expect(flattenTreePaths(tree)).not.toContain(target!.path);
    } finally {
      await replaceMenuItemsApi(adminPage, toPutPayload(original));
    }
  });

  test('MM-FN-09 / MM-NG-05 / MM-VD-02 (confirmed gap): PUT {items: []} wipes the ENTIRE tenant menu — no schema .min(1) rejects it — and GET /tree falls back to the hardcoded DEFAULT_MENU_TREE', { tag: ['@regression'] }, async ({ adminPage }) => {
    const original: MenuItemRow[] = await (await getMenuItemsApi(adminPage)).json();
    try {
      const putResponse = await replaceMenuItemsApi(adminPage, []);
      expect(putResponse.status()).toBe(200);

      const rawAfter = await (await getMenuItemsApi(adminPage)).json();
      expect(rawAfter).toEqual([]);

      const tree = await (await getMenuTreeApi(adminPage)).json();
      // menu.repository.js's DEFAULT_MENU_TREE — the server-side fallback
      // that keeps a tenant from ever rendering a literally empty nav.
      expect(tree.map((n: { path: string }) => n.path)).toEqual(['/dashboard', '/employees', '/attendance', '/reports', '/settings']);
      expect(tree[0].id).toBe('fallback-dashboard');
    } finally {
      const restoreResponse = await replaceMenuItemsApi(adminPage, toPutPayload(original));
      expect(restoreResponse.status()).toBe(200);
    }
  });

  test('MM-UI-01: the Menu Management nav item only renders for a menu.manage holder', { tag: ['@sanity'] }, async ({ adminPage, managerPage }) => {
    const adminPanel = new MenuManagementPanel(adminPage);
    await adminPanel.goto();
    await expect(adminPanel.saveButton).toBeVisible();

    // managerPage holds menu.view but not menu.manage (the tab's own gate) — confirmed live matrix.
    const managerPanel = new MenuManagementPanel(managerPage);
    await managerPage.goto('/settings');
    await expect(managerPanel.navItem).toHaveCount(0);
  });

  test('MM-UI-02 (confirmed exploitable): moving a child above its own parent via the up arrow then Save has no client-side guard — it directly triggers the server-side silent orphan-promotion bug', { tag: ['@regression'] }, async ({ adminPage }) => {
    const original: MenuItemRow[] = await (await getMenuItemsApi(adminPage)).json();
    const sorted = [...original].sort((a, b) => a.sort_order - b.sort_order);
    const child = sorted.find((r, idx) => idx > 0 && r.parent_id != null && sorted[idx - 1].id === r.parent_id);
    test.skip(!child, 'No child row is currently the immediate next sibling after its own parent in sort_order — cannot exercise the up-arrow-crosses-parent scenario.');

    const panel = new MenuManagementPanel(adminPage);
    try {
      await panel.goto();
      await panel.moveUpButton(child!.path).click();
      await panel.save();
      await expect(panel.savedAlert).toBeVisible();

      const after: MenuItemRow[] = await (await getMenuItemsApi(adminPage)).json();
      expect(after.find((r) => r.path === child!.path)?.parent_id).toBeNull();
    } finally {
      await replaceMenuItemsApi(adminPage, toPutPayload(original));
    }
  });

  test('MM-UI-03 (confirmed gap): the Menu Management tab has no way to add a new item or delete an existing one', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const panel = new MenuManagementPanel(adminPage);
    await panel.goto();
    await expect(panel.saveButton).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /^Add/i })).toHaveCount(0);
    await expect(adminPage.getByRole('button', { name: /^Delete/i })).toHaveCount(0);
  });

  test('MM-UI-04 (confirmed gap): permission, anyPermission, icon, module and parent_id are never exposed as editable fields — only Name, Visible and Feature Enabled are', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const panel = new MenuManagementPanel(adminPage);
    await panel.goto();
    await expect(panel.saveButton).toBeVisible();
    await expect(adminPage.getByLabel('Permission', { exact: true })).toHaveCount(0);
    await expect(adminPage.getByLabel('Icon', { exact: true })).toHaveCount(0);
    await expect(adminPage.getByLabel('Module', { exact: true })).toHaveCount(0);
    await expect(adminPage.getByLabel('Parent', { exact: true })).toHaveCount(0);
  });

  test('MM-UI-05: saving the menu shows a message telling the admin to manually reload — confirmed by reading handleSaveMenu, there is no refreshCompanyProfile()-equivalent call that refreshes the admin\'s OWN nav automatically', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const original: MenuItemRow[] = await (await getMenuItemsApi(adminPage)).json();
    const panel = new MenuManagementPanel(adminPage);
    try {
      await panel.goto();
      await panel.save(); // unmodified content — still a valid full-replace round-trip
      await expect(panel.savedAlert).toBeVisible(); // exact text: "Menu updated! Reload the app to see nav changes."
    } finally {
      await replaceMenuItemsApi(adminPage, toPutPayload(original));
    }
  });
});

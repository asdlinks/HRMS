import { expect, type Locator, type Page } from '@playwright/test';
import { itemByName, selectByLabelText } from '../helpers/locators';
import { assertSessionActive } from '../helpers/sessionGuard';

/** Wraps the "Roles & Permissions" tab inside client/src/pages/SettingsPage.tsx (route: /settings). */
export class RolesPermissionsPanel {
  readonly page: Page;
  readonly navItem: Locator;
  readonly newRoleButton: Locator;
  readonly newRoleDialog: Locator;
  readonly newRoleNameField: Locator;
  readonly newRoleDescriptionField: Locator;
  readonly createRoleSubmitButton: Locator;
  readonly deleteRoleConfirmDialog: Locator;
  /**
   * handleSaveRolePermissions() calls a local flash(), not the shared
   * Snackbar/Toast — a persistent inline `<Alert severity="success">`
   * (SettingsPage.tsx's `{message && <Alert severity="success">...}`), the
   * same UI primitive as EmployeesPage.employeeLimitBanner (see
   * FRAMEWORK_TECH_DEBT.md L3 — deliberately NOT folded into Toast).
   * handleCreateRole()/confirmDeleteRole() show no success message at all
   * (see this suite's product-gap note) — this locator only ever resolves
   * for a permissions-save.
   */
  readonly savedAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.navItem = page.getByRole('button', { name: 'Roles & Permissions' });
    this.newRoleButton = page.getByRole('button', { name: 'New Role' });
    this.newRoleDialog = page.getByRole('dialog').filter({ hasText: 'Create New Role' });
    this.newRoleNameField = this.newRoleDialog.getByLabel('Role Name');
    this.newRoleDescriptionField = this.newRoleDialog.getByLabel('Description');
    this.createRoleSubmitButton = this.newRoleDialog.getByRole('button', { name: 'Create Role' });
    this.deleteRoleConfirmDialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /^Delete "/ }) });
    this.savedAlert = page.getByRole('alert').filter({ hasText: /permissions updated!$/ });
  }

  /**
   * Deliberately does NOT assume the nav item exists — gated by
   * roles.manage (SettingsPage.tsx), so a persona lacking it would otherwise
   * hit an unhandled click failure instead of reaching the caller's
   * skipUnlessVisible() guard. Same bounded-wait shape as
   * AttendanceSettingsPanel.goto()/LeaveSettingsPanel.goto().
   */
  async goto() {
    await this.page.goto('/settings');
    assertSessionActive(this.page);
    const visible = await this.navItem.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    if (visible) {
      await this.navItem.click();
    }
  }

  /**
   * The role's whole Accordion container (summary + details), scoped via its
   * own `.MuiAccordion-root` — a container-only CSS-class use (never to
   * identify the actual interactive element, per FRAMEWORK_GUIDELINES.md's
   * locator-priority rules), filtered to the one whose summary contains this
   * role's name. `itemByName()` (not a raw `getByRole('button', {name})`)
   * because the summary's accessible name concatenates the role name with
   * its user-count Chip (and, for the system role, a "System" Chip) — the
   * same shape `itemByName`'s own doc comment describes for Branch/
   * Designation/Shift list rows.
   */
  accordion(roleName: string): Locator {
    return this.page.locator('.MuiAccordion-root').filter({ has: itemByName(this.page, roleName) });
  }

  async expandRole(roleName: string) {
    const summary = itemByName(this.page, roleName);
    const expanded = await summary.getAttribute('aria-expanded');
    if (expanded !== 'true') {
      await summary.click();
    }
  }

  /**
   * Scoped to one role's accordion so the same permission (by its visible
   * label — description if set, else its code, per SettingsPage.tsx's
   * `p.description || p.code`) can't collide with another role's identical
   * checkbox list. Same implicit-label association `EmployeesPage.
   * setRoleChecked()` already relies on for the analogous Manage Roles
   * dialog checkboxes.
   */
  permissionCheckbox(roleName: string, visibleLabel: string): Locator {
    return this.accordion(roleName).getByLabel(visibleLabel, { exact: true });
  }

  /**
   * The module-group caption inside a role's expanded accordion — the raw
   * `permissions.module` DB value (e.g. 'people', 'users'), NOT the
   * CSS-uppercased text a screenshot would show; `sx={{ textTransform:
   * 'uppercase' }}` only changes rendering, not the underlying text node
   * getByText() matches against.
   */
  moduleHeading(roleName: string, moduleCode: string): Locator {
    return this.accordion(roleName).getByText(moduleCode, { exact: true });
  }

  /**
   * The FormGroup of checkboxes for one specific module — SettingsPage.tsx
   * renders `<Box key={module}><Typography>{module}</Typography>
   * <FormGroup row>{perms...}</FormGroup></Box>`, so the module's own
   * FormGroup is its heading's immediate next sibling. Structural fallback
   * justified the same way AttendanceSettingsPanel.requiredForRolesGroup is:
   * no accessible role/label wraps a whole module's checkbox group as one
   * queryable unit. Used to prove RB-UI-02's grouping claim precisely (a
   * permission renders under its OWN module's group, not merely "somewhere
   * on the page").
   */
  permissionGroup(roleName: string, moduleCode: string): Locator {
    return this.moduleHeading(roleName, moduleCode).locator('xpath=following-sibling::*[1]');
  }

  async savePermissions(roleName: string) {
    await this.accordion(roleName).getByRole('button', { name: /^(Save Permissions|Saving…)$/ }).click();
  }

  deleteRoleButton(roleName: string): Locator {
    return this.accordion(roleName).getByRole('button', { name: 'Delete Role' });
  }

  async openDeleteRole(roleName: string) {
    await this.deleteRoleButton(roleName).click();
  }

  async confirmDeleteRole() {
    await this.deleteRoleConfirmDialog.getByRole('button', { name: 'Delete' }).click();
  }

  async openNewRoleDialog() {
    await this.newRoleButton.click();
    await expect(this.newRoleDialog).toBeVisible();
  }

  /** The "Clone permissions from (optional)" Select has no labelId — same gap as EmployeesPage's filter Selects. */
  get cloneFromRoleSelect(): Locator {
    return selectByLabelText(this.newRoleDialog, 'Clone permissions from (optional)', false);
  }

  async selectCloneFromRole(roleName: string) {
    await this.cloneFromRoleSelect.click();
    await this.page.getByRole('option', { name: roleName, exact: true }).click();
  }

  async fillNewRole(fields: { name: string; description?: string }) {
    await this.newRoleNameField.fill(fields.name);
    if (fields.description) await this.newRoleDescriptionField.fill(fields.description);
  }

  async submitNewRole() {
    await this.createRoleSubmitButton.click();
  }

  async expectDialogClosed() {
    await expect(this.newRoleDialog).toHaveCount(0);
  }
}

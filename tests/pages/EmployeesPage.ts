import { expect, type Locator, type Page } from '@playwright/test';
import { rowByCellText, selectByLabelText } from '../helpers/locators';
import { assertSessionActive } from '../helpers/sessionGuard';

export type EmployeeFilter = 'Department' | 'Branch' | 'Designation' | 'Employment Type' | 'Role';

/**
 * Wraps client/src/pages/EmployeesPage.tsx.
 * Row action icon buttons are each wrapped in an MUI Tooltip; Tooltip sets
 * aria-label = the tooltip title on the child by default (describeChild is
 * false), so getByRole('button', { name: <tooltip title> }) resolves them
 * reliably even though they carry no visible text.
 */
export class EmployeesPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly treeViewToggle: Locator;
  readonly tableViewToggle: Locator;
  readonly exportButton: Locator;
  readonly addEmployeeButton: Locator;
  readonly employeeLimitBanner: Locator;
  readonly totalEmployeesStat: Locator;
  readonly departmentsStat: Locator;
  readonly managersStat: Locator;
  readonly newJoinersStat: Locator;
  readonly resetPasswordDialog: Locator;
  readonly manageRolesDialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchInput = page.getByPlaceholder('Search by name…');
    this.treeViewToggle = page.getByRole('button', { name: 'Org Tree' });
    this.tableViewToggle = page.getByRole('button', { name: 'Table View' });
    this.exportButton = page.getByRole('button', { name: /^Export/ });
    this.addEmployeeButton = page.getByRole('button', { name: 'Add New Employee' });
    this.employeeLimitBanner = page.getByRole('alert');
    this.totalEmployeesStat = page.getByText('Total Employees').locator('..');
    this.departmentsStat = page.getByText('Departments', { exact: true }).locator('..');
    this.managersStat = page.getByText('Managers', { exact: true }).locator('..');
    this.newJoinersStat = page.getByText('New Joiners (This Month)').locator('..');
    this.resetPasswordDialog = page.getByRole('dialog').filter({ hasText: 'Reset Password' });
    this.manageRolesDialog = page.getByRole('dialog').filter({ hasText: /Manage Roles —/ });
  }

  async goto() {
    await this.page.goto('/employees');
    assertSessionActive(this.page);
  }

  async search(name: string) {
    await this.searchInput.fill(name);
  }

  /**
   * The filter bar's Selects have no `name` prop (confirmed live: no `id`,
   * no `aria-labelledby` on the combobox at all — MUI only derives that
   * `mui-component-select-<name>` id when a name is actually passed, and
   * EmployeesPage's filter Selects are plain useState, not RHF-controlled).
   * getByLabel doesn't work either, same missing-labelId issue as the
   * create/edit dialog. The one stable anchor is the visible label text
   * itself: it's an immediate sibling of the Select's wrapper div, both
   * children of the same MuiFormControl-root. Scoped to the filter bar's
   * Card (not just `page`) so "Department" doesn't also match the DataGrid's
   * "Department" column header once in table view.
   */
  private get filterBarCard(): Locator {
    return this.page.locator('.MuiCard-root').filter({ has: this.searchInput });
  }

  private filterCombobox(filter: EmployeeFilter): Locator {
    return selectByLabelText(this.filterBarCard, filter);
  }

  async filterBy(filter: EmployeeFilter, optionText: string) {
    await this.filterCombobox(filter).click();
    await this.page.getByRole('option', { name: optionText, exact: true }).click();
  }

  /** Picks the first real (non-"All …") option — use when the tenant's actual lookup values aren't known. */
  async filterByFirstOption(filter: EmployeeFilter): Promise<string> {
    await this.filterCombobox(filter).click();
    const option = this.page.getByRole('option').nth(1);
    await expect(option).toBeVisible();
    const text = (await option.textContent()) ?? '';
    await option.click();
    return text;
  }

  async clearFilter(filter: EmployeeFilter) {
    await this.filterCombobox(filter).click();
    await this.page.getByRole('option').first().click();
  }

  async switchToTableView() {
    await this.tableViewToggle.click();
  }

  async switchToTreeView() {
    await this.treeViewToggle.click();
  }

  async clickExport() {
    await this.exportButton.click();
  }

  /**
   * Confirmed live (Payroll Framework Stabilization pass): this click was the
   * single most common Payroll suite failure — 13 of 23 failures in one run,
   * every one a `TimeoutError: locator.click: Timeout 15000ms exceeded`.
   * Trace analysis showed the button's own locator took 10-14s just to
   * *resolve* (element not yet in the DOM), with zero network activity in
   * that window — a pure client-side render stall, not a network wait — and
   * a failure screenshot caught the tenant's Employees page reporting 365
   * total employees / 184 new this month. There is no cleanup mechanism in
   * this framework (see FRAMEWORK_GUIDELINES.md's Cleanup strategy) and the
   * dataset only grows, so this is expected to keep needing headroom, not a
   * one-time fluke. A generous, LOCAL override here — not a change to the
   * framework's global 15s actionTimeout — keeps the slow case scoped to the
   * one call site that actually needs it, same pattern already established
   * in helpers/payroll.ts's createEmployeeWithSalaryAssignment() for the
   * identical root cause on a different call.
   */
  async clickAddEmployee() {
    await this.addEmployeeButton.click({ timeout: 30_000 });
  }

  /**
   * DataGrid row containing this employee's name — call after switchToTableView().
   * The Employee cell renders an Avatar (fallback text = the name's first
   * letter) next to the name Typography, both inside the same gridcell —
   * confirmed live that its accessible name is the two concatenated with no
   * separator (e.g. "EE2E Test User …"), so exact name matching never hits;
   * substring matching (the default when `exact` is omitted) does.
   */
  row(employeeName: string): Locator {
    return rowByCellText(this.page, employeeName);
  }

  rowAction(employeeName: string, action: 'View Profile' | 'Edit' | 'Manage Roles' | 'Reset Password' | 'Unlock Account' | 'Enable' | 'Disable' | 'Delete Permanently'): Locator {
    return this.row(employeeName).getByRole('button', { name: action });
  }

  /**
   * The Actions column (rightmost, width 260 — client/src/pages/EmployeesPage.tsx)
   * sits past the visible viewport once Department/Designation/Branch/Employment
   * Type/Roles/Status/Joined are all rendered, and MUI DataGrid virtualizes
   * columns outside the scroller's current scroll position out of the DOM
   * entirely (not just visually) — confirmed live: the row's action buttons
   * are absent from the accessibility tree, not merely off-screen, until the
   * grid's own horizontal scroller is scrolled right. Every row-action lookup
   * needs this first; `row()`/text-only assertions never touch this column
   * so they don't.
   */
  async scrollActionsIntoView() {
    await this.page.locator('.MuiDataGrid-root .MuiDataGrid-virtualScroller').first().evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  }

  /**
   * search() alone races the grid's own filter re-render: scrolling
   * immediately after `.fill()` can land on the PRE-filter (or mid-filter)
   * column-virtualization window, which the grid then resets once the
   * filtered data actually arrives — confirmed live: the Actions cell was
   * present in the end-of-test DOM snapshot but never resolved in time for
   * the click, precisely the symptom of scrolling before the filter settles.
   * Waiting for the target row to actually render post-filter avoids that
   * race; every row-action lookup should go through this instead of pairing
   * `search()`/`scrollActionsIntoView()` directly.
   */
  async findRowForAction(employeeName: string): Promise<Locator> {
    await this.search(employeeName);
    const row = this.row(employeeName);
    await expect(row).toBeVisible();
    await this.scrollActionsIntoView();
    return row;
  }

  async openEdit(employeeName: string) {
    const row = await this.findRowForAction(employeeName);
    await row.getByRole('button', { name: 'Edit' }).click();
  }

  async openManageRoles(employeeName: string) {
    const row = await this.findRowForAction(employeeName);
    await row.getByRole('button', { name: 'Manage Roles' }).click();
  }

  async openResetPassword(employeeName: string) {
    const row = await this.findRowForAction(employeeName);
    await row.getByRole('button', { name: 'Reset Password' }).click();
  }

  async openStatusChange(employeeName: string, currentStatus: 'active' | 'disabled') {
    const row = await this.findRowForAction(employeeName);
    await row.getByRole('button', { name: currentStatus === 'disabled' ? 'Enable' : 'Disable' }).click();
  }

  async openDelete(employeeName: string) {
    const row = await this.findRowForAction(employeeName);
    await row.getByRole('button', { name: 'Delete Permanently' }).click();
  }

  async unlockAccount(employeeName: string) {
    const row = await this.findRowForAction(employeeName);
    await row.getByRole('button', { name: 'Unlock Account' }).click();
  }

  async submitResetPassword(newPassword: string) {
    await this.resetPasswordDialog.getByLabel('New Password').fill(newPassword);
    await this.resetPasswordDialog.getByRole('button', { name: 'Reset Password' }).click();
  }

  async setRoleChecked(roleName: string, checked: boolean) {
    await this.manageRolesDialog.getByLabel(roleName, { exact: true }).setChecked(checked);
  }

  async saveRoles() {
    await this.manageRolesDialog.getByRole('button', { name: /^(Save Roles|Saving…)$/ }).click();
  }

  async expectRowAbsent(employeeName: string) {
    await expect(this.row(employeeName)).toHaveCount(0);
  }

  async expectStatChip(employeeName: string, status: 'active' | 'disabled' | 'exited') {
    await expect(this.row(employeeName).getByText(status, { exact: true })).toBeVisible();
  }
}

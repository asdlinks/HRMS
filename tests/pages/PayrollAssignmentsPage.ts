import { expect, type Locator, type Page } from '@playwright/test';
import { itemByName, selectByLabelText } from '../helpers/locators';
import { assertSessionActive } from '../helpers/sessionGuard';

export interface AssignmentFormFields {
  gradeName?: string;
  structureName?: string;
  ctcAnnual?: string;
  effectiveFrom?: string;
}

/** Wraps client/src/pages/PayrollAssignmentsPage.tsx + components/payroll/SalaryAssignmentFormDialog.tsx. */
export class PayrollAssignmentsPage {
  readonly page: Page;
  readonly searchBox: Locator;
  readonly newAssignmentButton: Locator;
  readonly dialog: Locator;
  readonly currentAssignmentCard: Locator;
  readonly historyHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    // AppShell's own global header has an unrelated employee search box with
    // the identical placeholder text — scope to <main> to avoid a strict-mode
    // violation matching both.
    this.searchBox = page.getByRole('main').getByPlaceholder('Search employees…');
    this.newAssignmentButton = page.getByRole('button', { name: 'New Assignment' });
    this.dialog = page.getByRole('dialog').filter({ hasText: 'New Salary Assignment' });
    this.currentAssignmentCard = page.getByText('Current Assignment');
    this.historyHeading = page.getByText('History', { exact: true });
  }

  async goto() {
    await this.page.goto('/payroll/assignments');
    assertSessionActive(this.page);
  }

  /**
   * Confirmed live (Payroll Framework Stabilization pass): PR-UI-02 failed
   * with a `TimeoutError: locator.fill: Timeout 15000ms exceeded` on this
   * exact field — same shared-tenant dataset-growth pattern as
   * EmployeesPage.clickAddEmployee(), just on this page's own employee
   * search instead. Same local, scoped timeout override, same reasoning.
   */
  async search(text: string) {
    await this.searchBox.fill(text, { timeout: 30_000 });
  }

  async selectEmployee(name: string) {
    await itemByName(this.page, name).click();
  }

  async openAdd() {
    await this.newAssignmentButton.click();
  }

  async fill(fields: AssignmentFormFields) {
    if (fields.gradeName !== undefined) {
      await selectByLabelText(this.dialog, 'Salary Grade (optional)').click();
      await this.page.getByRole('option', { name: fields.gradeName, exact: true }).click();
    }
    if (fields.structureName !== undefined) {
      // required FormControl — MUI appends " *" to the accessible label name.
      await selectByLabelText(this.dialog, 'Salary Structure', false).click();
      await this.page.getByRole('option', { name: fields.structureName, exact: true }).click();
    }
    if (fields.ctcAnnual !== undefined) await this.dialog.getByLabel('Annual CTC').fill(fields.ctcAnnual);
    if (fields.effectiveFrom !== undefined) await this.dialog.getByLabel('Effective From').fill(fields.effectiveFrom);
  }

  get submitButton(): Locator {
    return this.dialog.getByRole('button', { name: /^(Create Assignment|Saving…)$/ });
  }

  async submit() {
    await this.submitButton.click();
  }

  async cancel() {
    await this.dialog.getByRole('button', { name: 'Cancel' }).click();
  }

  errorText(message: string | RegExp): Locator {
    return this.dialog.getByText(message);
  }

  /**
   * History rows have no accessible role of their own. Matched via the exact
   * structural relationship confirmed by reading PayrollAssignmentsPage.tsx:
   * the structure-name <Typography> is a direct child of a <Box>, itself a
   * direct child of the row's own <Stack> (`ancestor::*[2]`) — same
   * documented-XPath-fallback convention as PayrollStructuresPage.componentRow().
   */
  historyRow(structureName: string): Locator {
    return this.page.getByText(structureName, { exact: true }).locator('xpath=ancestor::*[2]');
  }

  async historyChip(structureName: string): Promise<string> {
    const chip = this.historyRow(structureName).getByText(/^(Past|Current)$/);
    await expect(chip).toBeVisible();
    return (await chip.textContent()) ?? '';
  }

  async expectNoEmployeeSelected() {
    await expect(this.page.getByText('No employee selected')).toBeVisible();
  }
}

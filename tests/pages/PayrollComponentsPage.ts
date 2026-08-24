import { expect, type Locator, type Page } from '@playwright/test';
import { rowByCellText, selectByLabelText, selectMaxDataGridPageSize } from '../helpers/locators';
import { assertSessionActive } from '../helpers/sessionGuard';

export type ComponentType = 'Earning' | 'Deduction';
export type CalculationType = 'Fixed amount' | '% of CTC' | '% of gross' | '% of another component' | 'Slab table';

export interface ComponentFormFields {
  code?: string;
  name?: string;
  componentType?: ComponentType;
  calculationType?: CalculationType;
  value?: string;
  baseComponentName?: string;
  sortOrder?: string;
  prorateOnLop?: boolean;
  isActive?: boolean;
}

export interface SlabRow {
  min: string;
  max?: string;
  amount?: string;
  rate?: string;
}

/**
 * Wraps client/src/pages/PayrollComponentsPage.tsx (DataGrid) +
 * components/payroll/PayrollComponentFormDialog.tsx + SlabEditor.tsx.
 * Edit/Delete row actions are plain MUI IconButtons with no Tooltip/aria-label
 * (same shape as AttendancePoliciesPage's Edit/Delete — see
 * FRAMEWORK_TECH_DEBT.md's L1) — targeted by fixed render order within the
 * row, not by name.
 */
export class PayrollComponentsPage {
  readonly page: Page;
  readonly newComponentButton: Locator;
  readonly dialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newComponentButton = page.getByRole('button', { name: 'New Component' });
    this.dialog = page.getByRole('dialog').filter({ hasText: /New Salary Component|Edit Salary Component/ });
  }

  async goto() {
    await this.page.goto('/payroll/components');
    assertSessionActive(this.page);
    await selectMaxDataGridPageSize(this.page);
  }

  row(name: string): Locator {
    return rowByCellText(this.page, name, { exact: true });
  }

  /** See EmployeesPage.clickAddEmployee()'s doc comment — same shared-tenant dataset-growth pattern, same local timeout override. */
  async openAdd() {
    await this.newComponentButton.click({ timeout: 30_000 });
  }

  async openEdit(name: string) {
    await this.row(name).getByRole('button').nth(0).click({ timeout: 30_000 });
  }

  async openDelete(name: string) {
    await this.row(name).getByRole('button').nth(1).click({ timeout: 30_000 });
  }

  async fill(fields: ComponentFormFields) {
    if (fields.code !== undefined) await this.dialog.getByLabel('Code').fill(fields.code);
    if (fields.name !== undefined) await this.dialog.getByLabel('Name').fill(fields.name);
    // Type/Calculation/Base component are all `required` FormControls — MUI's
    // InputLabel appends " *" to a required field's accessible name (see
    // FRAMEWORK_GUIDELINES.md's Locator rules on this exact quirk), so these
    // match non-exact rather than the bare label text.
    if (fields.componentType !== undefined) {
      await selectByLabelText(this.dialog, 'Type', false).click();
      await this.page.getByRole('option', { name: fields.componentType, exact: true }).click();
    }
    if (fields.calculationType !== undefined) {
      await selectByLabelText(this.dialog, 'Calculation', false).click();
      await this.page.getByRole('option', { name: fields.calculationType, exact: true }).click();
    }
    if (fields.value !== undefined) await this.dialog.getByLabel(/Monthly amount|Percentage/).fill(fields.value);
    if (fields.baseComponentName !== undefined) {
      await selectByLabelText(this.dialog, 'Base component', false).click();
      await this.page.getByRole('option', { name: new RegExp(fields.baseComponentName) }).click();
    }
    if (fields.sortOrder !== undefined) await this.dialog.getByLabel('Display order').fill(fields.sortOrder);
    if (fields.prorateOnLop !== undefined) await this.dialog.getByLabel('Prorate on LOP').setChecked(fields.prorateOnLop);
    if (fields.isActive !== undefined) await this.dialog.getByLabel('Active').setChecked(fields.isActive);
  }

  async selectSlabBase(label: 'Gross earnings' | 'Monthly CTC' | string) {
    await selectByLabelText(this.dialog, 'Base').click();
    await this.page.getByRole('option', { name: new RegExp(label) }).click();
  }

  async selectBracketType(label: 'Flat amount per bracket' | 'Progressive rate per bracket') {
    await selectByLabelText(this.dialog, 'Bracket type').click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }

  async addSlabBracket() {
    await this.dialog.getByRole('button', { name: 'Add bracket' }).click();
  }

  /** Fills the bracket at `index` — call addSlabBracket() first for every row beyond the first. */
  async fillSlabRow(index: number, row: SlabRow) {
    await this.dialog.getByLabel('Min').nth(index).fill(row.min);
    if (row.max !== undefined) await this.dialog.getByLabel('Max (blank = ∞)').nth(index).fill(row.max);
    if (row.amount !== undefined) await this.dialog.getByLabel('Amount').nth(index).fill(row.amount);
    if (row.rate !== undefined) await this.dialog.getByLabel('Rate %').nth(index).fill(row.rate);
  }

  get submitButton(): Locator {
    return this.dialog.getByRole('button', { name: /^(Create Component|Save Changes|Saving…)$/ });
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

  async expectRowAbsent(name: string) {
    await expect(this.row(name)).toHaveCount(0);
  }
}

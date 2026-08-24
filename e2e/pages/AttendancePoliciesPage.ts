import { expect, type Locator, type Page } from '@playwright/test';
import { rowByCellText } from '../helpers/locators';

export type PolicyType = 'Office Only' | 'Hybrid' | 'Remote' | 'Field Staff';
export type AttendanceMethodLabel =
  | 'Face Recognition (kiosk)' | 'Work From Home' | 'Client Visit' | 'Field Work'
  | 'Manual (self check-in)' | 'Biometric' | 'QR Code' | 'API';

export interface PolicyFormFields {
  name?: string;
  policyType?: PolicyType;
  methods?: AttendanceMethodLabel[];
  geofenceLat?: string;
  geofenceLng?: string;
  geofenceRadius?: string;
  isActive?: boolean;
}

/**
 * Wraps client/src/pages/AttendancePoliciesPage.tsx (DataGrid) +
 * components/attendanceAdmin/AttendancePolicyFormDialog.tsx.
 * The row's Assign icon button has a native `title` attribute (which becomes
 * its accessible name), but Edit/Delete have neither a Tooltip nor a title —
 * they're targeted by their fixed render order within the actions cell
 * (Assign, Edit, Delete) rather than by name.
 */
export class AttendancePoliciesPage {
  readonly page: Page;
  readonly newPolicyButton: Locator;
  readonly formDialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newPolicyButton = page.getByRole('button', { name: 'New Policy' });
    this.formDialog = page.getByRole('dialog').filter({ hasText: /New Attendance Policy|Edit Attendance Policy/ });
  }

  async goto() {
    await this.page.goto('/attendance-policies');
  }

  row(policyName: string): Locator {
    return rowByCellText(this.page, policyName, { exact: true });
  }

  async openAdd() {
    await this.newPolicyButton.click();
  }

  async openEdit(policyName: string) {
    await this.row(policyName).getByRole('button').nth(1).click();
  }

  async openDelete(policyName: string) {
    await this.row(policyName).getByRole('button').nth(2).click();
  }

  async openAssign(policyName: string) {
    await this.row(policyName).getByRole('button', { name: 'Assign to employees' }).click();
  }

  async assignedCount(policyName: string): Promise<string> {
    const cell = this.row(policyName).getByRole('gridcell').nth(3);
    await expect(cell).toBeVisible();
    return (await cell.textContent()) ?? '';
  }

  private selectPolicyType(): Locator {
    return this.formDialog.locator('#mui-component-select-policy_type');
  }

  /** `fields.methods` only checks the listed methods — it never unchecks an already-selected one; pass the full desired set when that matters. */
  async fill(fields: PolicyFormFields) {
    if (fields.name !== undefined) await this.formDialog.getByLabel('Policy name').fill(fields.name);
    if (fields.policyType !== undefined) {
      await this.selectPolicyType().click();
      await this.page.getByRole('option', { name: fields.policyType, exact: true }).click();
    }
    if (fields.methods !== undefined) {
      for (const method of fields.methods) {
        await this.formDialog.getByLabel(method, { exact: true }).check();
      }
    }
    if (fields.geofenceLat !== undefined) await this.formDialog.getByLabel('Center latitude').fill(fields.geofenceLat);
    if (fields.geofenceLng !== undefined) await this.formDialog.getByLabel('Center longitude').fill(fields.geofenceLng);
    if (fields.geofenceRadius !== undefined) await this.formDialog.getByLabel('Radius (meters)').fill(fields.geofenceRadius);
    if (fields.isActive !== undefined) await this.formDialog.getByLabel('Active').setChecked(fields.isActive);
  }

  get submitButton(): Locator {
    return this.formDialog.getByRole('button', { name: /^(Create Policy|Save Changes|Saving…)$/ });
  }

  async submit() {
    await this.submitButton.click();
  }

  async cancel() {
    await this.formDialog.getByRole('button', { name: 'Cancel' }).click();
  }

  errorText(message: string | RegExp): Locator {
    return this.formDialog.getByText(message);
  }

  private assignDialog(policyName: string): Locator {
    return this.page.getByRole('dialog').filter({ hasText: new RegExp(`Assign "${policyName}"`) });
  }

  async openAssignDialogSearch(policyName: string, filterText: string) {
    await this.assignDialog(policyName).getByPlaceholder('Search employees…').fill(filterText);
  }

  async toggleEmployeeInAssignDialog(policyName: string, employeeName: string) {
    await this.assignDialog(policyName).getByText(employeeName, { exact: true }).click();
  }

  async isEmployeeCheckedInAssignDialog(policyName: string, employeeName: string): Promise<boolean> {
    return this.assignDialog(policyName)
      .locator('li')
      .filter({ hasText: employeeName })
      .getByRole('checkbox')
      .isChecked();
  }

  async saveAssignments(policyName: string) {
    await this.assignDialog(policyName).getByRole('button', { name: /^(Save Assignments|Saving…)$/ }).click();
  }

  async cancelAssignDialog(policyName: string) {
    await this.assignDialog(policyName).getByRole('button', { name: 'Cancel' }).click();
  }

  async expectRowAbsent(policyName: string) {
    await expect(this.row(policyName)).toHaveCount(0);
  }
}

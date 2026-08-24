import { expect, type Locator, type Page } from '@playwright/test';
import { escapeRegex } from '../helpers/locators';

export interface EmployeeFormFields {
  name?: string;
  email?: string;
  dateOfBirth?: string;
  branch?: string;
  department?: string;
  designation?: string;
  employeeId?: string;
  employmentType?: string;
  probationPeriod?: string;
  joiningDate?: string;
  role?: 'Employee' | 'Manager' | 'HR';
  manager?: string;
  password?: string;
}

export interface IdentityFields {
  aadhaar?: string;
  pan?: string;
}

export interface BankingFields {
  accountHolderName?: string;
  bankName?: string;
  branch?: string;
  accountNumber?: string;
  ifsc?: string;
  upi?: string;
}

/**
 * Wraps client/src/components/employees/EmployeeFormDialog.tsx for both
 * add ("Register New Employee") and edit ("Edit Employee Details") modes.
 * All MUI Select fields are plain Select/MenuItem (no Autocomplete) — options
 * must be opened, then the MenuItem clicked by its exact visible text.
 */
export class EmployeeFormDialog {
  readonly page: Page;
  readonly root: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly saveIdentityButton: Locator;
  readonly saveBankingButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole('dialog').filter({ hasText: /Register New Employee|Edit Employee Details/ });
    this.submitButton = this.root.getByRole('button', { name: /^(Save Record|Update Record|Saving…)$/ });
    this.cancelButton = this.root.getByRole('button', { name: 'Cancel' });
    this.saveIdentityButton = this.root.getByRole('button', { name: /Save Identity Information/ });
    this.saveBankingButton = this.root.getByRole('button', { name: /Save Banking Information/ });
  }

  async waitForOpen() {
    await expect(this.root).toBeVisible();
  }

  /**
   * MUI Select's own combobox div computes its accessible name from the
   * currently *selected value* text (e.g. "Employee"), not the field label —
   * confirmed against a live run: aria-labelledby on the combobox points at
   * its OWN id, because InputLabel is never wired up via a `labelId` prop.
   * getByLabel()/getByRole('group', ...) can't resolve these at all.
   *
   * What IS stable: react-hook-form's Controller spreads `name` onto each
   * Select, and MUI turns that into a deterministic
   * `id="mui-component-select-<name>"` on the combobox div — confirmed live
   * for every field. This is tied to the RHF field name in
   * EmployeeFormDialog.tsx, not to visible label text.
   */
  private static readonly FIELD_NAMES: Record<string, string> = {
    Branch: 'location_id',
    Department: 'department_id',
    Designation: 'designation_id',
    'Employment Type': 'employment_type_id',
    Role: 'role',
    'Assign Manager': 'manager_id',
  };

  private selectCombobox(label: keyof typeof EmployeeFormDialog.FIELD_NAMES): Locator {
    return this.root.locator(`#mui-component-select-${EmployeeFormDialog.FIELD_NAMES[label]}`);
  }

  private async selectOption(label: 'Branch' | 'Department' | 'Designation' | 'Employment Type' | 'Role', optionText: string) {
    await this.selectCombobox(label).click();
    await this.page.getByRole('option', { name: optionText, exact: true }).click();
  }

  /** MenuItem text for a manager candidate is `${name} (${designation||role})` — never an exact match on name alone. */
  private async selectManagerByName(managerName: string) {
    const escaped = escapeRegex(managerName);
    await this.selectCombobox('Assign Manager').click();
    await this.page.getByRole('option', { name: new RegExp(`^${escaped} \\(`) }).click();
  }

  /**
   * Department and Designation are required (zod min-length 1) but their
   * MenuItem options are tenant-specific lookup data this suite has no way
   * to know in advance — the first entry is always the "Select …"
   * placeholder, so picking index 1 selects whatever real option the tenant
   * actually has. Requires at least one Department/Designation to exist.
   */
  async selectFirstRealOption(label: 'Department' | 'Designation' | 'Branch' | 'Employment Type' | 'Assign Manager') {
    await this.selectCombobox(label).click();
    await this.page.getByRole('option').nth(1).click();
  }

  async fill(fields: EmployeeFormFields) {
    if (fields.name !== undefined) await this.root.getByLabel('Full Name').fill(fields.name);
    if (fields.email !== undefined) await this.root.getByLabel('Email Address').fill(fields.email);
    if (fields.dateOfBirth !== undefined) await this.root.getByLabel('Date of Birth').fill(fields.dateOfBirth);
    if (fields.branch !== undefined) await this.selectOption('Branch', fields.branch);
    if (fields.department !== undefined) await this.selectOption('Department', fields.department);
    if (fields.designation !== undefined) await this.selectOption('Designation', fields.designation);
    if (fields.employeeId !== undefined) await this.root.getByLabel('Employee ID').fill(fields.employeeId);
    if (fields.employmentType !== undefined) await this.selectOption('Employment Type', fields.employmentType);
    if (fields.probationPeriod !== undefined) await this.root.getByLabel('Probation (Months)').fill(fields.probationPeriod);
    if (fields.joiningDate !== undefined) await this.root.getByLabel('Joining Date').fill(fields.joiningDate);
    if (fields.role !== undefined) await this.selectOption('Role', fields.role);
    if (fields.manager !== undefined) await this.selectManagerByName(fields.manager);
    if (fields.password !== undefined) await this.root.getByLabel('Initial Password').fill(fields.password);
  }

  async fillIdentity(fields: IdentityFields) {
    if (fields.aadhaar !== undefined) await this.root.getByLabel('Aadhaar Number').fill(fields.aadhaar);
    if (fields.pan !== undefined) await this.root.getByLabel('PAN Number').fill(fields.pan);
  }

  async fillBanking(fields: BankingFields) {
    if (fields.accountHolderName !== undefined) await this.root.getByLabel('Account Holder Name').fill(fields.accountHolderName);
    if (fields.bankName !== undefined) await this.root.getByLabel('Bank Name').fill(fields.bankName);
    if (fields.branch !== undefined) await this.root.getByLabel('Branch').last().fill(fields.branch);
    if (fields.accountNumber !== undefined) await this.root.getByLabel('Account Number').fill(fields.accountNumber);
    if (fields.ifsc !== undefined) await this.root.getByLabel('IFSC Code').fill(fields.ifsc);
    if (fields.upi !== undefined) await this.root.getByLabel(/UPI ID/).fill(fields.upi);
  }

  /** Picks the first real Department and Designation — both are required fields with no safe default. */
  async selectRequiredLookups() {
    await this.selectFirstRealOption('Department');
    await this.selectFirstRealOption('Designation');
  }

  async submit() {
    await this.submitButton.click();
  }

  async cancel() {
    await this.cancelButton.click();
  }

  async saveIdentitySection() {
    await this.saveIdentityButton.click();
  }

  async saveBankingSection() {
    await this.saveBankingButton.click();
  }

  /** Matches a validation/helper-text message rendered anywhere in the dialog. */
  errorText(message: string | RegExp): Locator {
    return this.root.getByText(message);
  }

  /**
   * Scoped to the section heading, not `getByText` — the dialog also has a
   * "Save Identity/Banking Information" button whose text contains this
   * same substring, which made the unscoped text lookup a strict-mode
   * violation (2 matches) once other blockers stopped masking this code path.
   */
  /**
   * Bounded wait, not an instant `isVisible()` — this is called right after
   * the dialog opens, and an instant check here was the exact race
   * `helpers/guards.ts`'s `skipUnlessVisible` docstring says was "confirmed
   * live" to misreport a permission-gated section as absent a moment before
   * its async render finished.
   */
  async isIdentitySectionVisible(): Promise<boolean> {
    return this.root
      .getByRole('heading', { name: 'Identity Information' })
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true, () => false);
  }

  async isBankingSectionVisible(): Promise<boolean> {
    return this.root
      .getByRole('heading', { name: 'Banking Information' })
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true, () => false);
  }
}

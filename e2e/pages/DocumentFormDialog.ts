import { type Locator, type Page } from '@playwright/test';

export interface DocumentFormFields {
  title?: string;
  category?: string;
  description?: string;
  effectiveDate?: string;
  expiryDate?: string;
  /** Defaults to true (the form's own initial state) — set false before calling selectRoles/selectDepartments/selectBranches. */
  allEmployees?: boolean;
}

/**
 * Wraps client/src/components/companyDocuments/DocumentFormDialog.tsx — the
 * Upload/Edit Document dialog opened from CompanyDocumentsPage.tsx's
 * AdminDocumentsView. A single module-owned dialog, so it lives in
 * e2e/pages/ (not pages/components/, which is reserved for widgets shared
 * across multiple modules — AppShellPopup/ConfirmDialog/Toast).
 */
export class DocumentFormDialog {
  readonly page: Page;
  readonly root: Locator;
  readonly titleField: Locator;
  readonly categoryField: Locator;
  readonly descriptionField: Locator;
  readonly effectiveDateField: Locator;
  readonly expiryDateField: Locator;
  readonly allEmployeesSwitch: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole('dialog').filter({ hasText: /Upload Document|Edit Document/ });
    // NOT exact:true — DocumentFormDialog.tsx renders these as MUI TextFields
    // with `required`, which appends a visible/accessible " *" to the label
    // (confirmed live: the rendered accessible name is "Title *", not
    // "Title"). exact:true demands a full match and silently times out
    // instead of matching, the same non-exact convention EmployeeFormDialog.ts
    // already uses for its own required fields (e.g. getByLabel('Full Name')).
    this.titleField = this.root.getByLabel('Title');
    this.categoryField = this.root.getByLabel('Category');
    this.descriptionField = this.root.getByLabel('Description');
    this.effectiveDateField = this.root.getByLabel('Effective Date');
    this.expiryDateField = this.root.getByLabel('Expiry Date (optional)');
    this.allEmployeesSwitch = this.root.getByLabel('Share with All Employees');
    this.submitButton = this.root.getByRole('button', { name: /^(Publish|Save Changes|Saving…)$/ });
    this.cancelButton = this.root.getByRole('button', { name: 'Cancel' });
  }

  async waitForOpen() {
    await this.root.waitFor({ state: 'visible' });
  }

  async expectClosed() {
    await this.root.waitFor({ state: 'hidden' });
  }

  /** The hidden <input type="file"> behind the "Choose file to upload" label — setInputFiles() targets it directly. Only rendered when creating (not editing). */
  get fileInput(): Locator {
    return this.root.locator('input[type="file"]');
  }

  async setFile(filePath: string) {
    await this.fileInput.setInputFiles(filePath);
  }

  async fill(fields: DocumentFormFields) {
    if (fields.title !== undefined) await this.titleField.fill(fields.title);
    if (fields.category !== undefined) {
      await this.categoryField.click();
      await this.page.getByRole('option', { name: fields.category, exact: true }).click();
    }
    if (fields.description !== undefined) await this.descriptionField.fill(fields.description);
    if (fields.effectiveDate !== undefined) await this.effectiveDateField.fill(fields.effectiveDate);
    if (fields.expiryDate !== undefined) await this.expiryDateField.fill(fields.expiryDate);
    if (fields.allEmployees !== undefined) await this.allEmployeesSwitch.setChecked(fields.allEmployees);
  }

  /** MUI Autocomplete's option list renders asynchronously after the click that opens it — bounded-wait on the first option before selecting, same idiom as LeavesPage.flexiHolidayOptionCount()'s reference implementation (FRAMEWORK_GUIDELINES.md's Waiting Strategy). */
  private async selectAutocompleteOption(label: string, optionName: string) {
    await this.root.getByLabel(label, { exact: true }).click();
    const option = this.page.getByRole('option', { name: optionName, exact: true });
    await option.first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    await option.click();
  }

  async selectRole(roleName: string) {
    await this.selectAutocompleteOption('Selected Roles', roleName);
  }

  async selectDepartment(departmentName: string) {
    await this.selectAutocompleteOption('Selected Departments', departmentName);
  }

  async selectBranch(branchName: string) {
    await this.selectAutocompleteOption('Selected Branches', branchName);
  }

  async submit() {
    await this.submitButton.click();
  }

  async cancel() {
    await this.cancelButton.click();
  }

  /** The dialog's own persistent inline error Alert — NOT routed through pages/components/Toast.ts, per that component's own doc comment: this is a different UI primitive (a form-level Alert that stays until the next submit attempt), same category as LeaveCancellationPage.inlineAlert/EmployeesPage.employeeLimitBanner. */
  errorText(message: string | RegExp): Locator {
    return this.root.getByText(message);
  }
}

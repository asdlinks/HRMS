import { type Locator, type Page } from '@playwright/test';
import { selectByLabelText } from '../helpers/locators';

/** Wraps client/src/platform-admin/pages/CompanyCreatePage.tsx. */
export class PlatformAdminCompanyCreatePage {
  readonly page: Page;
  readonly companyNameInput: Locator;
  readonly slugInput: Locator;
  readonly phoneInput: Locator;
  readonly subscriptionPlanSelect: Locator;
  readonly statusSelect: Locator;
  readonly adminNameInput: Locator;
  readonly adminEmailInput: Locator;
  readonly roleTemplateSelect: Locator;
  readonly createButton: Locator;
  readonly cancelButton: Locator;

  readonly nameError: Locator;
  readonly slugError: Locator;
  readonly phoneError: Locator;
  readonly adminNameError: Locator;
  readonly adminEmailError: Locator;

  readonly resultAdminEmail: Locator;
  readonly resultPassword: Locator;
  readonly copyCredentialsButton: Locator;
  readonly viewCompanyButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.companyNameInput = page.getByLabel('Company Name');
    this.slugInput = page.getByLabel('Company Code (slug)');
    this.phoneInput = page.getByLabel('Company Contact Number');
    // Non-exact: this FormControl alone carries `required`, so MUI appends a
    // " *" to its InputLabel's accessible text ("Subscription Plan *") — see
    // FRAMEWORK_GUIDELINES.md's Locator Rules note on this exact footgun
    // (LeavesPage.ts's startDateField). Confirmed live: an exact match here
    // silently never resolves, timing out on the first click rather than
    // erroring clearly.
    this.subscriptionPlanSelect = selectByLabelText(page, 'Subscription Plan', false);
    this.statusSelect = selectByLabelText(page, 'Company Status');
    this.adminNameInput = page.getByLabel('Administrator Name');
    this.adminEmailInput = page.getByLabel('Administrator Email');
    this.roleTemplateSelect = selectByLabelText(page, 'Role Template');
    this.createButton = page.getByRole('button', { name: /Create Company|Provisioning/ });
    this.cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });

    this.nameError = page.getByText('Company name is required', { exact: true });
    this.slugError = page.getByText('Lowercase letters, numbers and hyphens only', { exact: true });
    this.phoneError = page.getByText('Company contact number is required', { exact: true });
    this.adminNameError = page.getByText('Administrator name is required', { exact: true });
    this.adminEmailError = page.getByText('Enter a valid email address', { exact: true });

    // XPath sibling traversal (documented structural fallback — see
    // FRAMEWORK_GUIDELINES.md's Locator Rules): "Administrator Email" and
    // "One-Time Password" are both plain label/value Typography PAIRS as
    // direct siblings of EACH OTHER inside the same Paper (no data-testid/
    // aria linkage) — `.locator('..')` from either label resolves to the
    // SAME shared parent, so a `.locator('p').nth(1)` scoped from there
    // would match the wrong pair's value. Anchoring to each label's own
    // immediate next sibling avoids that cross-contamination.
    this.resultAdminEmail = page.getByText('Administrator Email', { exact: true }).locator('xpath=following-sibling::p[1]');
    this.resultPassword = page.getByText('One-Time Password', { exact: true }).locator('xpath=following-sibling::p[1]');
    this.copyCredentialsButton = page.getByRole('button', { name: /Copy Credentials|Copied/ });
    this.viewCompanyButton = page.getByRole('button', { name: 'View Company' });
  }

  async goto() {
    await this.page.goto('/platform-admin/companies/new');
  }

  async selectPlan(labelSubstring: string) {
    await this.subscriptionPlanSelect.click();
    await this.page.getByRole('option', { name: new RegExp(labelSubstring) }).click();
  }

  async selectStatus(label: 'Trial' | 'Active') {
    await this.statusSelect.click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }

  async fillRequired(fields: { name: string; slug: string; phone: string; adminName: string; adminEmail: string }) {
    await this.companyNameInput.fill(fields.name);
    await this.slugInput.fill(fields.slug);
    await this.phoneInput.fill(fields.phone);
    await this.adminNameInput.fill(fields.adminName);
    await this.adminEmailInput.fill(fields.adminEmail);
  }

  async submit() {
    await this.createButton.click();
  }
}

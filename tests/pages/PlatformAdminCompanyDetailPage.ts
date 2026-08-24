import { type Locator, type Page } from '@playwright/test';

/** Wraps client/src/platform-admin/pages/CompanyDetailPage.tsx (read-only
 * surfaces only — Profile view, Tenant Health, Usage, Provisioning History;
 * this phase does not exercise Save/Suspend/Reactivate/Reset/Assign Plan). */
export class PlatformAdminCompanyDetailPage {
  readonly page: Page;
  readonly profileTab: Locator;
  readonly healthTab: Locator;
  readonly usageTab: Locator;
  readonly historyTab: Locator;

  readonly companyNameInput: Locator;
  readonly currencyInput: Locator;
  readonly dateFormatInput: Locator;

  /** "Employee Usage"/"Storage Usage" are plain sibling Typography pairs with
   * no data-testid/aria linkage (CompanyDetailPage.tsx) — scoped to each
   * label's own parent Grid item, the smallest container that holds both the
   * label and its value/chip, since there's no better accessible anchor. */
  readonly employeeUsageSection: Locator;
  readonly storageUsageSection: Locator;
  readonly approachingLimitChipText: string;

  readonly setupCompletionPercent: Locator;

  constructor(page: Page) {
    this.page = page;
    this.profileTab = page.getByRole('tab', { name: 'Profile' });
    this.healthTab = page.getByRole('tab', { name: 'Tenant Health' });
    this.usageTab = page.getByRole('tab', { name: 'Usage' });
    this.historyTab = page.getByRole('tab', { name: /Provisioning History/ });

    this.companyNameInput = page.getByLabel('Company Name');
    this.currencyInput = page.getByLabel('Currency');
    this.dateFormatInput = page.getByLabel('Date Format');

    this.employeeUsageSection = page.getByText('Employee Usage', { exact: true }).locator('..');
    this.storageUsageSection = page.getByText('Storage Usage', { exact: true }).locator('..');
    this.approachingLimitChipText = 'Approaching limit';

    // "Setup Completion" heading's sibling percentage value (Tenant Health tab).
    this.setupCompletionPercent = page.getByText('Setup Completion', { exact: true }).locator('..').getByText('%');
  }

  async goto(id: number | string) {
    await this.page.goto(`/platform-admin/companies/${id}`);
  }

  healthLabel(label: string): Locator {
    return this.page.getByText(label, { exact: true });
  }

  /** MUI Accordion's summary is built on ButtonBase, giving each provisioning-
   * history entry a `role="button"` with `aria-expanded` — the nth collapsed
   * entry, in render order (newest first, per the API's own ordering). */
  provisioningLogEntry(index = 0): Locator {
    return this.page.getByRole('button', { expanded: false }).nth(index);
  }
}

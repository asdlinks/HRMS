import { type Locator, type Page } from '@playwright/test';
import { rowByCellText } from '../helpers/locators';

/** Wraps client/src/platform-admin/pages/CompanyListPage.tsx. */
export class PlatformAdminCompanyListPage {
  readonly page: Page;
  readonly searchInput: Locator;
  /**
   * The status filter TextField renders with `select` but no `label`/
   * `placeholder`/`aria-label` (CompanyListPage.tsx) — no accessible name
   * exists to key off at all, so this is targeted purely positionally as
   * the page's first combobox (confirmed live: the DataGrid's own
   * page-size combobox, the only other candidate, sits below it in DOM
   * order). See this phase's report for the accessibility gap this reflects.
   */
  readonly statusFilter: Locator;
  readonly newCompanyButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchInput = page.getByPlaceholder('Search by name or company code');
    this.statusFilter = page.getByRole('combobox').first();
    this.newCompanyButton = page.getByRole('button', { name: 'New Company' });
  }

  async goto() {
    await this.page.goto('/platform-admin/companies');
  }

  async search(text: string) {
    await this.searchInput.fill(text);
  }

  async filterByStatus(label: string) {
    await this.statusFilter.click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }

  row(cellText: string): Locator {
    return rowByCellText(this.page, cellText);
  }

  async openCompany(cellText: string) {
    await this.row(cellText).click();
  }
}

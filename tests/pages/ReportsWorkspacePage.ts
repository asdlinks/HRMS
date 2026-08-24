import { type Locator, type Page } from '@playwright/test';
import { assertSessionActive } from '../helpers/sessionGuard';
import { escapeRegex } from '../helpers/locators';

export type ReportCategory = 'employee' | 'attendance' | 'leave' | 'payroll' | 'organization' | 'compliance' | 'audit';

const CATEGORY_PATH: Record<ReportCategory, string> = {
  employee: 'employees',
  attendance: 'attendance',
  leave: 'leave',
  payroll: 'payroll',
  organization: 'organization',
  compliance: 'compliance',
  audit: 'audit',
};

/** Wraps client/src/pages/reports/AnalyticsWorkspace.tsx — one route per category (`/reports/<category>`), the chip strip + KPI strip around the embedded ReportPanel (see pages/ReportPanel.ts for the panel itself). */
export class ReportsWorkspacePage {
  readonly page: Page;
  readonly searchBox: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchBox = page.getByPlaceholder('Search reports in this workspace…');
    this.emptyState = page.getByText('No reports available');
  }

  /** `query` is an optional raw query string starting with `?`, e.g. `?report=employee-master&departmentId=3`. */
  async goto(category: ReportCategory, query = '') {
    await this.page.goto(`/reports/${CATEGORY_PATH[category]}${query}`);
    assertSessionActive(this.page);
  }

  reportChip(title: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(escapeRegex(title)) });
  }

  async selectReport(title: string) {
    await this.reportChip(title).click();
  }

  statCard(label: string): Locator {
    return this.page.getByText(label, { exact: true });
  }
}

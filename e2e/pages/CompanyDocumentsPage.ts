import { expect, type Locator, type Page } from '@playwright/test';
import { rowByCellText, selectMaxDataGridPageSize } from '../helpers/locators';
import { assertSessionActive } from '../helpers/sessionGuard';
import { Toast } from './components/Toast';

/**
 * Wraps client/src/pages/CompanyDocumentsPage.tsx — a single route
 * (/company-documents) that branches internally into AdminDocumentsView
 * (company-documents.manage holders) or EmployeeDocumentsView (everyone
 * else), the same permission-branch shape the API route itself uses
 * (hasManage() in companyDocuments.routes.js). One page object for both,
 * per FRAMEWORK_GUIDELINES.md ("one page object per real UI unit" — this is
 * one route, not two) — isAdminView()/isEmployeeView() let a spec confirm
 * which branch rendered before using the admin-only members below.
 */
export class CompanyDocumentsPage {
  readonly page: Page;
  readonly uploadButton: Locator;
  readonly activeTab: Locator;
  readonly archivedTab: Locator;
  readonly categoryFilter: Locator;
  readonly quickFilterInput: Locator;

  constructor(page: Page) {
    this.page = page;
    // Admin-only controls — absent entirely (not just disabled) for a
    // non-manage persona, per CompanyDocumentsPage.tsx's canManage branch.
    this.uploadButton = page.getByRole('button', { name: 'Upload Document' });
    this.activeTab = page.getByRole('tab', { name: 'Active' });
    this.archivedTab = page.getByRole('tab', { name: 'Archived' });
    // TextField select wires its own labelId — a plain getByLabel resolves
    // it directly, unlike the labelId-less MUI Selects selectByLabelText()
    // exists for (PayrollSettingsPage.ts's "Financial year starts", etc.).
    this.categoryFilter = page.getByLabel('Category', { exact: true });
    // DataTable.tsx's `withToolbar` renders MUI's stock GridToolbar with
    // `showQuickFilter: true` — a client-side quick filter that runs BEFORE
    // pagination (confirmed via MUI X DataGrid's own filtering pipeline), so
    // it finds a matching row regardless of which page it would otherwise
    // land on. Matched by placeholder rather than the literal "Search…"
    // string (real ellipsis character, not three dots) to stay robust to
    // that detail.
    this.quickFilterInput = page.getByPlaceholder(/search/i);
  }

  async goto() {
    await this.page.goto('/company-documents');
    assertSessionActive(this.page);
    // Both AdminDocumentsView and EmployeeDocumentsView render through the
    // same shared DataTable (10-row default page). Confirmed live: this
    // tenant has accumulated 70+ disposable documents from repeated suite
    // runs (this framework has no test-data-deletion mechanism — see
    // FRAMEWORK_GUIDELINES.md's Cleanup strategy), so a just-created
    // document routinely lands past page 1 — the same risk
    // helpers/locators.ts's selectMaxDataGridPageSize() doc comment
    // describes and every other DataGrid-backed page object already guards
    // against (e.g. PayrollRunsPage.goto()). This page object never adopted
    // it originally; that gap is what's fixed here.
    await selectMaxDataGridPageSize(this.page);
  }

  /** Bounded-wait check, same idiom as helpers/guards.ts's skipUnlessVisible — confirms the manage branch rendered before a test uses any admin-only member. */
  async isAdminView(): Promise<boolean> {
    return this.uploadButton.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  }

  async isEmployeeView(): Promise<boolean> {
    const admin = await this.isAdminView();
    if (admin) return false;
    // The category filter is common to both views — waiting on it (rather
    // than an instant, non-retrying check) avoids racing the page's own
    // fetch-then-render pass, the same class of race skipUnlessVisible /
    // AttendanceSettingsPanel.goto() already guard against.
    return this.categoryFilter.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  }

  async openUpload() {
    await this.uploadButton.click();
  }

  async filterByCategory(category: string) {
    await this.categoryFilter.click();
    await this.page.getByRole('option', { name: category, exact: true }).click();
  }

  async clearCategoryFilter() {
    await this.categoryFilter.click();
    await this.page.getByRole('option', { name: 'All Categories', exact: true }).click();
  }

  async showArchived() {
    await this.archivedTab.click();
  }

  async showActive() {
    await this.activeTab.click();
  }

  /** A DataGrid row by its Title column — exact match, since uniqueDocumentTitle()'s trailing numeric suffix can otherwise substring-collide between two disposable documents (the same class of risk helpers/locators.ts's itemByName() guards against). */
  row(title: string): Locator {
    return rowByCellText(this.page, title, { exact: true });
  }

  /**
   * Types into the toolbar's quick-filter box to surface a specific row
   * regardless of pagination. Needed because this tenant has accumulated
   * 70+ disposable documents across repeated suite runs (no
   * test-data-deletion mechanism exists — FRAMEWORK_GUIDELINES.md's Cleanup
   * strategy) — confirmed live to already exceed even the 50-row max page
   * size selectMaxDataGridPageSize() switches to in goto(), which was the
   * first fix attempted here and wasn't sufficient on its own. Prefer this
   * over relying on page size alone for any row-existence check, since the
   * accumulated count only grows over time and 50 will eventually stop
   * being enough too.
   */
  async search(text: string) {
    await this.quickFilterInput.fill(text);
  }

  async clearSearch() {
    await this.quickFilterInput.fill('');
  }

  async expectRowAbsent(title: string) {
    await expect(this.row(title)).toHaveCount(0);
  }

  // ---- Admin-only row actions (title-attribute-named IconButtons — every one of these carries a distinct native `title`, unlike AttendancePoliciesPage's positional Edit/Delete) ----

  previewButton(title: string): Locator {
    return this.row(title).getByRole('button', { name: 'Preview' });
  }

  downloadButton(title: string): Locator {
    return this.row(title).getByRole('button', { name: 'Download' });
  }

  /** The hidden file input behind the "Upload new version" IconButton — setInputFiles() targets it directly, no click needed first. */
  versionUploadInput(title: string): Locator {
    return this.row(title).locator('input[type="file"]');
  }

  editButton(title: string): Locator {
    return this.row(title).getByRole('button', { name: 'Edit' });
  }

  versionHistoryButton(title: string): Locator {
    return this.row(title).getByRole('button', { name: 'Version history' });
  }

  archiveButton(title: string): Locator {
    return this.row(title).getByRole('button', { name: 'Archive' });
  }

  restoreButton(title: string): Locator {
    return this.row(title).getByRole('button', { name: 'Restore' });
  }

  deleteButton(title: string): Locator {
    return this.row(title).getByRole('button', { name: 'Delete' });
  }

  toast(message: string | RegExp) {
    return new Toast(this.page).expectVisible(message);
  }
}

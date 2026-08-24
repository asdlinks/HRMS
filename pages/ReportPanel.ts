import { type Locator, type Page } from '@playwright/test';
import { selectByLabelText } from '../helpers/locators';

/**
 * Wraps client/src/components/reports/ReportPanel.tsx — the filter bar,
 * optional chart, data table, export menu, favorite toggle and save-filter
 * dialog rendered for whichever report is currently selected inside an
 * AnalyticsWorkspace tab (see ReportsWorkspacePage.ts for the chip strip
 * that selects a report). Not a standalone route — always navigated to via
 * ReportsWorkspacePage.goto(category, `?report=<id>`) or by clicking a chip.
 */
export class ReportPanel {
  readonly page: Page;
  readonly favoriteButton: Locator;
  readonly exportButton: Locator;
  readonly saveFilterButton: Locator;
  readonly resetButton: Locator;
  readonly searchField: Locator;
  readonly dateFromField: Locator;
  readonly dateToField: Locator;
  readonly comingSoon: Locator;
  readonly noRecordsMessage: Locator;
  readonly saveDialog: Locator;
  readonly saveDialogNameField: Locator;
  readonly saveDialogSaveButton: Locator;
  readonly saveDialogCancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.favoriteButton = page.getByTitle('Toggle favorite');
    // .first(): DataTable's own `withToolbar` GridToolbar (MUI DataGrid) adds
    // a SECOND, unrelated "Export" button inside `.MuiDataGrid-toolbarContainer`
    // — confirmed live. ReportPanel's own custom Export button (the one that
    // opens the CSV/Excel/PDF/Print menu this page object drives) always
    // renders earlier in the DOM, above the Card containing the DataGrid.
    this.exportButton = page.getByRole('button', { name: 'Export', exact: true }).first();
    this.saveFilterButton = page.getByRole('button', { name: 'Save filter' });
    this.resetButton = page.getByRole('button', { name: 'Reset' });
    // .first(): same DataGrid-toolbar collision as exportButton above — when
    // the grid has rows (not the EmptyState branch), its GridToolbar quick
    // filter is ALSO labeled "Search" (aria-label="Search" on its wrapper
    // div). Confirmed live as a data-dependent flake: a report whose current
    // result set happens to be empty shows only ReportFilterBar's own Search
    // field, one with rows shows both. ReportFilterBar's field always renders
    // first in the DOM (above the Card containing the DataGrid).
    this.searchField = page.getByLabel('Search', { exact: true }).first();
    this.dateFromField = page.getByLabel('From', { exact: true });
    this.dateToField = page.getByLabel('To', { exact: true });
    this.comingSoon = page.getByText('Coming Soon');
    this.noRecordsMessage = page.getByText('No records match these filters');
    this.saveDialog = page.getByRole('dialog');
    this.saveDialogNameField = this.saveDialog.getByLabel('Filter name');
    this.saveDialogSaveButton = this.saveDialog.getByRole('button', { name: 'Save', exact: true });
    this.saveDialogCancelButton = this.saveDialog.getByRole('button', { name: 'Cancel' });
  }

  /** A registry-declared dimension dropdown (Branch/Department/Designation/Employment Type/Shift/Work Mode/Manager/Status) — see ReportFilterBar.tsx. Not every report shows every one; check `filterKeys` via the catalog first. */
  dimensionFilter(label: string): Locator {
    return selectByLabelText(this.page, label);
  }

  async selectDimension(label: string, optionName: string) {
    await this.dimensionFilter(label).click();
    await this.page.getByRole('option', { name: optionName, exact: true }).click();
  }

  async toggleFavorite() {
    await this.favoriteButton.click();
  }

  async openExportMenu() {
    await this.exportButton.click();
  }

  async exportAs(format: 'CSV' | 'Excel' | 'PDF' | 'Print') {
    await this.openExportMenu();
    await this.page.getByRole('menuitem', { name: format }).click();
  }

  async openSaveFilterDialog() {
    await this.saveFilterButton.click();
  }

  async saveFilterAs(name: string) {
    await this.openSaveFilterDialog();
    await this.saveDialogNameField.fill(name);
    await this.saveDialogSaveButton.click();
  }

  /** A DataGrid row (1-indexed data rows — index 0 is the header row, same convention as rowByCellText's callers elsewhere). */
  row(index: number): Locator {
    return this.page.getByRole('row').nth(index);
  }
}

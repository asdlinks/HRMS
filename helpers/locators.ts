import type { Locator, Page } from '@playwright/test';

/**
 * Shared, framework-agnostic locator-building idioms used by 3+ module page
 * objects independently before this file existed (each with its own copy,
 * one missing this exact escape and producing a live bug — see git history
 * of BranchTab.ts/DepartmentsPage.ts/LookupTab.ts). New module page objects
 * should import from here rather than re-deriving any of these.
 */

/** Escapes regex metacharacters so a name/label can be safely interpolated into a `new RegExp(...)`. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A clickable list row/item identified by its visible name, where the
 * control's accessible name is the row's own concatenated text (name plus
 * whatever secondary text/icons sit alongside it) rather than an exact,
 * isolated label. Used by the Branches/Designations/Employment Types/Shifts
 * list-style CRUD pages. Always escapes `name` — the un-escaped version of
 * this idiom throws (or silently mismatches) the moment a name contains a
 * regex metacharacter like `.` or `(`.
 *
 * The trailing `(?!\d)` guards against a real, confirmed-live collision:
 * `uniqueSuffix()`-based names (fixtures/test-data.ts) are a long run of
 * digits, and two created moments apart in the same test routinely share a
 * long leading-digit prefix (timestamps are monotonically increasing). An
 * unanchored substring match would then match the SHORTER name's pattern
 * *inside* the longer name's text too — confirmed to silently select the
 * wrong row in payroll-salary-structures.spec.ts's PR-FN-04. Requiring the
 * next character not be a digit rules that out without requiring a full
 * end-anchor, which would break names that legitimately have trailing
 * concatenated text (a secondary line, an icon's accessible name).
 */
export function itemByName(page: Page, name: string): Locator {
  return page.getByRole('button', { name: new RegExp(`${escapeRegex(name)}(?!\\d)`) }).filter({ hasText: name });
}

/**
 * Targets a plain MUI `<Select>` that has no `labelId`/`name` wired up (so
 * `getByLabel`/`getByRole('group', ...)` can't resolve it) via the one
 * stable anchor that exists: the visible `InputLabel` text is a DOM sibling
 * of the Select's own wrapper. Scope `container` tightly (e.g. a dialog root
 * or a specific Card) whenever the same label text could also appear
 * elsewhere on the page (a column header, another field) — see
 * EmployeesPage.ts's `filterGroup` for why the unscoped version isn't safe
 * everywhere.
 */
export function selectByLabelText(container: Locator | Page, label: string, exact = true): Locator {
  return container.getByText(label, { exact }).locator('..').getByRole('combobox');
}

/**
 * The sole, unnamed icon button inside a row/container — MUI often renders a
 * delete/remove IconButton with no Tooltip and no aria-label, leaving
 * "the only button in this row" as the sole way to target it. Centralizes
 * that one justification instead of restating it per page object.
 */
export function soleButtonIn(row: Locator): Locator {
  return row.getByRole('button');
}

/**
 * A DataGrid row whose named column's gridcell matches `text`. Centralizes
 * the `getByRole('row').filter({ has: getByRole('gridcell') })` idiom used
 * ad hoc across module page objects, several with inconsistent `exact`
 * defaults. Default is non-exact (substring) — the common case, since some
 * grids concatenate an avatar-fallback letter or other decoration into the
 * cell's accessible name (see EmployeesPage.ts's `row()` doc comment); pass
 * `exact: true` for grids that don't.
 */
export function rowByCellText(page: Page, text: string, opts: { exact?: boolean } = {}): Locator {
  return page.getByRole('row').filter({ has: page.getByRole('gridcell', { name: text, exact: opts.exact ?? false }) });
}

/**
 * DataTable's DataGrid defaults to a 10-row page with no default sort
 * applied, so a just-created row can land on any page depending on how many
 * rows the tenant has already accumulated — this framework has no
 * test-data-deletion mechanism (see FRAMEWORK_GUIDELINES.md's Cleanup
 * strategy), so that count only ever grows. Selecting the largest available
 * page size (DataTable's own `pageSizeOptions` tops out at 50) after
 * navigating to any DataGrid-backed page keeps a test from needing to guess
 * which page a new row landed on. A no-op if the grid has too few rows to
 * show pagination controls at all.
 */
/**
 * Sets a native `<input type="color">`'s value directly and dispatches the
 * native `input`/`change` events React's controlled-input onChange listens
 * for. Playwright's `locator.fill()` does not support this input type (it's
 * one of the handful of special input types Playwright refuses to fill), and
 * a real `.click()` would open the browser's native OS color-picker dialog,
 * which Playwright cannot drive. Using the prototype's own value setter
 * (rather than `el.value = value`) bypasses React's internal "last known
 * value" tracker, which otherwise silently swallows a directly-assigned
 * value's subsequent `input` event as a no-op — first page object needing a
 * color input (SettingsPage.tsx's Company Profile branding fields), no
 * existing framework idiom covers this yet.
 */
export async function setColorInputValue(locator: Locator, hex: string): Promise<void> {
  await locator.evaluate((el: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, hex);
}

export async function selectMaxDataGridPageSize(page: Page): Promise<void> {
  const rowsPerPage = page.locator('.MuiTablePagination-root [role="combobox"]');
  const hasPagination = await rowsPerPage.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  if (!hasPagination) return;
  await rowsPerPage.click();
  await page.getByRole('option', { name: '50' }).click();
}

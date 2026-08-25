import { test, expect } from './fixtures/auth';

test.describe('Attendance search, presentation, and export', () => {
  test('Search, filter, customize, and export attendance', { tag: ['@regression'] }, async ({ adminPage }) => {
    await adminPage.goto('/attendance');

    const search = adminPage.getByRole('textbox', { name: /search/i });
    await expect(search).toBeVisible();

    const rows = adminPage.getByRole('row');
    await expect(rows.first()).toBeVisible();
    const initialRowCount = await rows.count();

    await search.fill('zzzz-no-attendance-match');
    await expect(search).toHaveValue('zzzz-no-attendance-match');
    await expect(adminPage.getByText(/no .*attendance|no records|no results/i)).toBeVisible();

    await search.fill('');
    await expect(search).toHaveValue('');
    await expect(rows.first()).toBeVisible();

    const filterButton = adminPage.getByRole('button', { name: /filter/i });
    await expect(filterButton).toBeVisible();
    await filterButton.click();
    const filterMenu = adminPage.getByRole('menu').or(adminPage.getByRole('dialog'));
    await expect(filterMenu).toBeVisible();
    const filterOption = filterMenu.getByRole('menuitem').first().or(filterMenu.getByRole('option').first());
    await expect(filterOption).toBeVisible();
    await filterOption.click();
    await expect(rows.first().or(adminPage.getByText(/no .*attendance|no records|no results/i))).toBeVisible();

    const columnsButton = adminPage.getByRole('button', { name: /columns/i });
    await expect(columnsButton).toBeVisible();
    await columnsButton.click();
    const columnsMenu = adminPage.getByRole('menu').or(adminPage.getByRole('dialog'));
    await expect(columnsMenu).toBeVisible();
    const columnToggle = columnsMenu.getByRole('checkbox').first();
    await expect(columnToggle).toBeVisible();
    const columnWasChecked = await columnToggle.isChecked();
    await columnToggle.click();
    await expect(columnToggle).toBeChecked({ checked: !columnWasChecked });

    const densityButton = adminPage.getByRole('button', { name: /density/i });
    await expect(densityButton).toBeVisible();
    await densityButton.click();
    const densityMenu = adminPage.getByRole('menu').or(adminPage.getByRole('dialog'));
    await expect(densityMenu).toBeVisible();
    const densityOption = densityMenu.getByRole('menuitem').first().or(densityMenu.getByRole('option').first());
    await expect(densityOption).toBeVisible();
    await densityOption.click();

    const exportButton = adminPage.getByRole('button', { name: /^Export$/i }).or(adminPage.getByRole('button', { name: /^Export\b/i }));
    await expect(exportButton).toBeVisible();
    const downloadPromise = adminPage.waitForEvent('download');
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/attendance.*\.(csv|xlsx?)$/i);
    expect(initialRowCount).toBeGreaterThan(0);
  });
});

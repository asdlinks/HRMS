import { test, expect } from '../fixtures/auth';
import { CompanyProfilePanel } from '../pages/CompanyProfilePanel';
import { AttendanceLinkPanel } from '../pages/AttendanceLinkPanel';
import { getCompanyProfileApi, updateCompanyProfileApi } from '../helpers/companyProfile';
import { uniqueCompanyName } from '../fixtures/companyProfile-data';
import { VALID_LOGO_PATH } from '../fixtures/test-assets';
import { uniqueSuffix } from '../fixtures/test-data';

/**
 * docs/CompanyProfileSettings_TestCases.csv — Settings > Company Profile tab
 * UI round-trip, plus the sibling General Config tab's Attendance Link field
 * (its Leave Allocations section is already fully owned by
 * leave-settings.spec.ts / pages/LeaveSettingsPanel.ts — not duplicated
 * here). Automates: CP-FN-01, CP-FN-02, CP-FN-03, CP-FN-08, CP-FN-09,
 * CP-FN-10 (Attendance Link half only), CP-UI-01, CP-UI-03, CP-UI-04,
 * CP-UI-07.
 *
 * `adminPage` is used throughout — as of 2026-08-07 it holds the
 * `super_admin` role (`company.manage` + `general.settings.manage`) in the
 * `testauto` tenant (see project memory on the admin-persona-zero-roles fix).
 * Every mutating test here restores the tenant's real company profile / the
 * attendance_link value in `finally`, since both are shared, tenant-wide
 * singleton state, not disposable per-test records (see
 * helpers/companyProfile.ts's doc comments on why PUT /company is a
 * full-column overwrite).
 *
 * `.serial()`: every test in this file mutates the same tenant-wide
 * `/api/company` row and/or the shared `settings.attendance_link` key —
 * running them concurrently (the default under playwright.config.ts's
 * fullyParallel: true) risks one test's snapshot/restore clobbering
 * another's, the same class of race leave-probation.spec.ts's header
 * comment documents for settings.leave_allocations. Serializing this FILE
 * does not prevent a genuinely different file (company-profile-validation.spec.ts,
 * company-profile-api-contracts.spec.ts) from mutating the same row at the
 * literal same instant — that cross-file risk is accepted, not solved, the
 * same tradeoff leave-probation.spec.ts/leave-settings.spec.ts already make.
 */
test.describe.serial('Company Profile Settings — Lifecycle', () => {
  test.beforeEach(() => { test.slow(); });

  test('CP-FN-01 / CP-FN-02 / CP-FN-03 / CP-FN-09: editing every Company Profile field via the real form round-trips through GET/PUT /company', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const getResponse = await getCompanyProfileApi(adminPage);
    expect(getResponse.ok()).toBeTruthy();
    const original = await getResponse.json();

    const panel = new CompanyProfilePanel(adminPage);
    const newName = uniqueCompanyName('CP-FN-01');
    try {
      await panel.goto();
      await expect(panel.saveButton).toBeVisible();
      await panel.fill({
        name: newName,
        website: 'https://example.test',
        contactEmail: 'e2e-contact@example.test',
        phone: '+1-555-0100',
        addressLine1: '1 E2E Test Way',
        city: 'Testville',
        state: 'TS',
        country: 'Testland',
        postalCode: '00000',
        currency: 'USD',
        dateFormat: 'YYYY-MM-DD',
        financialYearStartMonth: 'January',
        themePrimaryColor: '#123456',
        themeSecondaryColor: '#654321',
      });
      await panel.save();
      await panel.expectSaved();

      const after = await (await getCompanyProfileApi(adminPage)).json();
      expect(after.name).toBe(newName);
      expect(after.website).toBe('https://example.test');
      expect(after.contact_email).toBe('e2e-contact@example.test');
      expect(after.currency).toBe('USD');
      expect(after.date_format).toBe('YYYY-MM-DD');
      expect(after.financial_year_start_month).toBe(1);
      expect(after.theme_primary_color).toBe('#123456');
      expect(after.theme_secondary_color).toBe('#654321');
    } finally {
      const restoreResponse = await updateCompanyProfileApi(adminPage, original);
      expect(restoreResponse.ok()).toBeTruthy();
    }
  });

  test('CP-UI-01: the Company Profile nav item only renders for a company.manage holder', { tag: ['@sanity'] }, async ({ adminPage, managerPage }) => {
    const adminPanel = new CompanyProfilePanel(adminPage);
    await adminPanel.goto();
    await expect(adminPanel.saveButton).toBeVisible();

    // managerPage holds company.view but not company.manage (the tab's own gate) — confirmed live matrix.
    const managerPanel = new CompanyProfilePanel(managerPage);
    await managerPage.goto('/settings');
    await expect(managerPanel.navItem).toHaveCount(0);
  });

  test('CP-UI-03: Currency / Date Format / Financial Year Starts dropdowns only ever offer the fixed client-side option lists', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const panel = new CompanyProfilePanel(adminPage);
    await panel.goto();

    expect(await panel.dropdownOptionLabels('Currency')).toEqual(['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED']);
    expect(await panel.dropdownOptionLabels('Date Format')).toEqual(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']);
    expect(await panel.dropdownOptionLabels('Financial Year Starts')).toEqual([
      'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
    ]);
  });

  test('CP-UI-04: the native color-picker inputs only ever hold a valid 6-digit hex value', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const panel = new CompanyProfilePanel(adminPage);
    await panel.goto();

    expect(await panel.primaryColorInput.inputValue()).toMatch(/^#[0-9a-f]{6}$/i);
    await panel.fill({ themePrimaryColor: '#00ff00' });
    expect(await panel.primaryColorInput.inputValue()).toBe('#00ff00');
  });

  test('CP-UI-07 (confirmed gap): a very pale primary theme color still renders white button text — contrastText is hardcoded, not computed from lightness', { tag: ['@regression'] }, async ({ adminPage }) => {
    const getResponse = await getCompanyProfileApi(adminPage);
    const original = await getResponse.json();
    const panel = new CompanyProfilePanel(adminPage);
    try {
      await panel.goto();
      await panel.fill({ themePrimaryColor: '#fefefe' }); // near-white — the palest a 6-digit hex can meaningfully be
      await panel.save();
      await panel.expectSaved();

      // The theme rebuilds "on next session load" (CP-FN-03) — a fresh
      // navigation re-runs AuthContext's profile fetch and ThemeModeProvider.
      await adminPage.goto('/settings');
      await expect(panel.saveButton).toBeVisible();
      const color = await panel.saveButton.evaluate((el) => getComputedStyle(el).color);
      expect(color).toBe('rgb(255, 255, 255)'); // confirmed gap: white text regardless of how pale the background is
    } finally {
      await updateCompanyProfileApi(adminPage, original);
    }
  });

  test('CP-FN-09: uploading a small valid image round-trips as the company logo', { tag: ['@regression'] }, async ({ adminPage }) => {
    const getResponse = await getCompanyProfileApi(adminPage);
    const original = await getResponse.json();
    const panel = new CompanyProfilePanel(adminPage);
    try {
      await panel.goto();
      await panel.uploadLogo(VALID_LOGO_PATH);
      await expect(panel.logoImage).toHaveAttribute('src', /^data:/);
      await panel.save();
      await panel.expectSaved();

      const after = await (await getCompanyProfileApi(adminPage)).json();
      expect(after.logo_url).toContain('data:');
    } finally {
      await updateCompanyProfileApi(adminPage, original);
    }
  });

  test('CP-FN-08 / CP-FN-10: saving the Attendance Link field via the General Config tab persists it through GET/POST /settings', { tag: ['@smoke'] }, async ({ adminPage }) => {
    // Shares the "Save Configuration" button with Leave Allocations
    // (leave-settings.spec.ts / LeaveSettingsPanel.ts) — this test only
    // edits the Attendance Link field, so it harmlessly resubmits whatever
    // Leave Allocation rows are currently loaded, unchanged.
    const link = `https://example.test/checkin/${uniqueSuffix()}`;
    const panel = new AttendanceLinkPanel(adminPage);
    await panel.goto();
    const original = await panel.attendanceLinkField.inputValue();
    try {
      await panel.fill(link);
      await panel.save();
      await panel.expectSaved();

      const response = await adminPage.request.get('/api/settings');
      expect((await response.json()).attendance_link).toBe(link);
    } finally {
      await panel.goto();
      await panel.fill(original);
      await panel.save();
      await panel.expectSaved();
    }
  });
});

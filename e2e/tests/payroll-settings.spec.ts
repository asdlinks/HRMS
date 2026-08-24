import { test, expect } from '../fixtures/auth';
import { PayrollSettingsPage } from '../pages/PayrollSettingsPage';
import { Toast } from '../pages/components/Toast';
import { withTemporaryPayrollSettings } from '../helpers/payroll';

/**
 * docs/Payroll_SalaryGrades_TestCases.csv — Payroll Settings rows.
 * Automates: PR-FN-22, PR-NG-21, PR-VD-09, PR-VD-10, PR-UI-09, PR-AP-09,
 * PR-PM-07.
 *
 * Mutates the shared, tenant-wide `payroll_settings` blob — every test uses
 * withTemporaryPayrollSettings()'s temporary-add-then-restore pattern (see
 * helpers/leave.ts's withTemporaryLeaveType() for the established
 * precedent) inside this file's own test.describe.serial() block.
 */
test.describe.serial('Payroll — Settings', () => {
  // Each test here chains several UI/API arrange steps against a real remote
  // dev server with a large, shared, ever-growing tenant dataset — the default
  // 30s Playwright test timeout is comfortably enough for a single-page CRUD
  // check but not for these multi-step flows. test.slow() (3x multiplier) is
  // Playwright's own idiom for exactly this, applied file-wide via beforeEach
  // rather than hand-picking which individual tests are 'heavy enough'.
  test.beforeEach(() => { test.slow(); });

  test('PR-FN-22: viewing and updating payroll settings persists the JSON blob and reflects it back on GET', { tag: ['@smoke'] }, async ({ adminPage }) => {
    await withTemporaryPayrollSettings(adminPage, {}, async () => {
      const settings = new PayrollSettingsPage(adminPage);
      await settings.goto();
      await settings.fill({ payCycleDay: '5', standardMonthlyHours: '200', otRateMultiplier: '1.75', roundingRule: 'Nearest 0.5' });
      await settings.save();
      await new Toast(adminPage).expectVisible('Payroll settings saved');

      const after = await (await adminPage.request.get('/api/settings')).json();
      expect(after.payroll_settings.pay_cycle_day).toBe(5);
      expect(after.payroll_settings.standard_monthly_hours).toBe(200);
      expect(after.payroll_settings.rounding_rule).toBe('nearest_0.5');
    });
  });

  test('PR-NG-21: POST /settings/bulk for payroll_settings without payroll.settings.manage is rejected with the exact permission message', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const response = await hrDirectoryPage.request.post('/api/settings/bulk', { data: { payroll_settings: { pay_cycle_day: 1 } } });
    expect(response.status()).toBe(403);
    expect((await response.json()).error).toBe('Missing permission to update "payroll_settings"');
  });

  test('PR-VD-09 (confirmed gap): payroll_settings with wrong field types is accepted verbatim — settingsBulkSchema performs zero shape/type/range validation', { tag: ['@regression'] }, async ({ adminPage }) => {
    await withTemporaryPayrollSettings(adminPage, {}, async () => {
      const response = await adminPage.request.post('/api/settings/bulk', {
        data: { payroll_settings: { ot_rate_multiplier: 'not-a-number', standard_monthly_hours: -50 } },
      });
      expect(response.ok()).toBeTruthy();

      const after = await (await adminPage.request.get('/api/settings')).json();
      expect(after.payroll_settings.ot_rate_multiplier).toBe('not-a-number');
      expect(after.payroll_settings.standard_monthly_hours).toBe(-50);
    });
  });

  test('PR-VD-10: an unrecognized rounding_rule silently falls through to the default rounding branch — no error, no warning', { tag: ['@regression'] }, async ({ adminPage }) => {
    await withTemporaryPayrollSettings(adminPage, { rounding_rule: 'round_to_nearest_prime' }, async () => {
      const after = await (await adminPage.request.get('/api/settings')).json();
      expect(after.payroll_settings.rounding_rule).toBe('round_to_nearest_prime'); // stored as-is, no validation error anywhere
    });
  });

  test('PR-UI-09: settings fields render but are disabled for a viewer lacking payroll.settings.manage', { tag: ['@sanity'] }, async ({ hrDirectoryPage }) => {
    const settings = new PayrollSettingsPage(hrDirectoryPage);
    await settings.goto();

    await expect(hrDirectoryPage.getByLabel('Pay cycle day')).toBeDisabled();
    await expect(hrDirectoryPage.getByLabel('Standard monthly hours')).toBeDisabled();
    await expect(settings.saveButton).toHaveCount(0);
  });

  test('PR-AP-09 / PR-PM-07: GET /settings has no permission gate at all, while POST /settings/bulk requires payroll.settings.manage for the payroll_settings key', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    const getResponse = await employeeSelfPage.request.get('/api/settings');
    expect(getResponse.ok()).toBeTruthy();
    expect(getResponse.status()).not.toBe(403);

    const postResponse = await employeeSelfPage.request.post('/api/settings/bulk', { data: { payroll_settings: { pay_cycle_day: 1 } } });
    expect(postResponse.status()).toBe(403);
  });
});

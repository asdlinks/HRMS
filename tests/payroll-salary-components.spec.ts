import { test, expect } from '../fixtures/auth';
import { PayrollComponentsPage } from '../pages/PayrollComponentsPage';
import { PayrollStructuresPage } from '../pages/PayrollStructuresPage';
import { Toast } from '../pages/components/Toast';
import { uniqueComponentCode, uniqueComponentName } from '../fixtures/payroll-data';
import { createSalaryComponent, createSalaryStructure } from '../helpers/payroll';

/**
 * docs/Payroll_SalaryGrades_TestCases.csv — Salary Components rows.
 * Automates: PR-FN-01, PR-FN-02, PR-NG-01 (component half), PR-NG-22,
 * PR-VD-01, PR-PM-05, PR-SC-06.
 * Deliberately NOT here (see payroll-not-automatable.spec.ts / other spec
 * files' own header comments): PR-DB-01/02/14 (raw DB access), PR-NG-23
 * (needs a full run-process cycle — see payroll-runs-lifecycle.spec.ts).
 */
test.describe('Payroll — Salary Components', () => {
  // Each test here chains several UI/API arrange steps against a real remote
  // dev server with a large, shared, ever-growing tenant dataset — the default
  // 30s Playwright test timeout is comfortably enough for a single-page CRUD
  // check but not for these multi-step flows. test.slow() (3x multiplier) is
  // Playwright's own idiom for exactly this, applied file-wide via beforeEach
  // rather than hand-picking which individual tests are 'heavy enough'.
  test.beforeEach(() => { test.slow(); });

  const CALC_TYPES: { calculationType: Parameters<PayrollComponentsPage['fill']>[0]['calculationType']; label: string; needsBase?: boolean }[] = [
    { calculationType: 'Fixed amount', label: 'Fixed amount' },
    { calculationType: '% of CTC', label: '% of CTC' },
    { calculationType: '% of gross', label: '% of gross' },
    { calculationType: '% of another component', label: '% of component', needsBase: true },
    { calculationType: 'Slab table', label: 'Slab table' },
  ];

  test('PR-FN-01: create a component of each calculation_type', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const components = new PayrollComponentsPage(adminPage);
    const base = await createSalaryComponent(adminPage, { calculationType: 'Fixed amount', value: '500' });

    for (const { calculationType, label, needsBase } of CALC_TYPES) {
      const code = uniqueComponentCode();
      const name = uniqueComponentName();
      await components.goto();
      await components.openAdd();
      // Slab table renders <SlabEditor> instead of a "value" field — passing one would target a nonexistent field.
      const extraFields = needsBase ? { baseComponentName: base.name } : calculationType === 'Slab table' ? {} : { value: '10' };
      await components.fill({ code, name, componentType: 'Earning', calculationType, ...extraFields });
      if (calculationType === 'Slab table') {
        await components.selectSlabBase('Gross earnings');
        await components.addSlabBracket();
        await components.fillSlabRow(0, { min: '0', max: '50000', amount: '1000' });
      }
      await components.submit();
      await new Toast(adminPage).expectVisible('Component created');
      await components.goto();
      const row = components.row(name);
      await expect(row).toBeVisible();
      await expect(row.filter({ hasText: label })).toBeVisible();
    }
  });

  test('PR-FN-02: update saves changes; delete hard-deletes when unreferenced, deactivates when referenced', { tag: ['@smoke', '@regression'] }, async ({ adminPage }) => {
    const components = new PayrollComponentsPage(adminPage);

    const unreferenced = await createSalaryComponent(adminPage);
    const updatedName = uniqueComponentName();
    await components.goto();
    await components.openEdit(unreferenced.name);
    await components.fill({ name: updatedName });
    await components.submit();
    await new Toast(adminPage).expectVisible('Component updated');

    await components.goto();
    await components.openDelete(updatedName);
    await adminPage.getByRole('button', { name: 'Delete', exact: true }).click();
    await new Toast(adminPage).expectVisible('Component deleted');
    await components.expectRowAbsent(updatedName);

    // Reference the second component via a structure so its delete deactivates instead.
    const referenced = await createSalaryComponent(adminPage);
    const structure = await createSalaryStructure(adminPage);
    const structures = new PayrollStructuresPage(adminPage);
    await structures.goto();
    await structures.selectStructure(structure.name);
    await structures.toggleComponent(referenced.name);
    await structures.saveComponents();
    await new Toast(adminPage).expectVisible('Structure components saved');

    await components.goto();
    await components.openDelete(referenced.name);
    await adminPage.getByRole('button', { name: 'Delete', exact: true }).click();
    await new Toast(adminPage).expectVisible('Component is in use — deactivated instead of deleted');
  });

  test('PR-NG-01: creating a component with a code already used in the tenant is rejected with a 409-style message', { tag: ['@regression'] }, async ({ adminPage }) => {
    const components = new PayrollComponentsPage(adminPage);
    const existing = await createSalaryComponent(adminPage);

    await components.goto();
    await components.openAdd();
    await components.fill({ code: existing.code, name: uniqueComponentName(), componentType: 'Earning', calculationType: 'Fixed amount', value: '1' });
    await components.submit();

    // PayrollComponentsPage.tsx's handleSubmit surfaces a server error via a page-level snackbar, not inline dialog text.
    await new Toast(adminPage).expectVisible(new RegExp(`A component with code "${existing.code}" already exists`));
  });

  test('PR-VD-01: an invalid component_type or calculation_type outside its enum is rejected with 400', { tag: ['@regression'] }, async ({ adminPage }) => {
    const badType = await adminPage.request.post('/api/payroll/components', {
      data: { code: uniqueComponentCode(), name: uniqueComponentName(), component_type: 'income', calculation_type: 'fixed' },
    });
    expect(badType.status()).toBe(400);

    const badCalc = await adminPage.request.post('/api/payroll/components', {
      data: { code: uniqueComponentCode(), name: uniqueComponentName(), component_type: 'earning', calculation_type: 'percent_of_everything' },
    });
    expect(badCalc.status()).toBe(400);
  });

  test('PR-NG-22 (confirmed gap): a percent_of_component component with no base_component_id is not caught by Zod', { tag: ['@regression'] }, async ({ adminPage }) => {
    const response = await adminPage.request.post('/api/payroll/components', {
      data: { code: uniqueComponentCode(), name: uniqueComponentName(), component_type: 'earning', calculation_type: 'percent_of_component' },
    });
    // Not a 400 (payrollComponentSchema has no cross-field requirement) —
    // only CK_salary_components_base_required (a raw DB CHECK) rejects this,
    // surfacing as an unhandled error rather than a friendly validation message.
    expect(response.status()).not.toBe(400);
    expect(response.ok()).toBeFalsy();
  });

  test('PR-SC-06: a malformed/hostile JSON config on a slab component is safely parsed, with no server crash', { tag: ['@regression'] }, async ({ adminPage }) => {
    const hostileConfig = { base: 'gross', bracket_type: 'flat', slabs: [{ min: 0, max: null, amount: '__proto__', rate: 0 }], ['__proto__']: { polluted: true } };
    const response = await adminPage.request.post('/api/payroll/components', {
      data: { code: uniqueComponentCode(), name: uniqueComponentName(), component_type: 'earning', calculation_type: 'slab', config: hostileConfig },
    });
    // Either accepted as opaque JSON or rejected — either is safe. What matters is the server stays up.
    expect([200, 400, 500]).toContain(response.status());

    const healthCheck = await adminPage.request.get('/api/payroll/components');
    expect(healthCheck.ok()).toBeTruthy();
  });

  test('PR-PM-05: payroll.components.manage and payroll.structures.manage are distinct permission codes', { tag: ['@regression'] }, async ({ adminPage }) => {
    const permissions = await (await adminPage.request.get('/api/roles/permissions')).json();
    const codes = permissions.map((p: { code: string }) => p.code);
    expect(codes).toContain('payroll.components.manage');
    expect(codes).toContain('payroll.structures.manage');
  });

  test('PR-PM-05 (negative): a caller holding neither payroll.components.manage nor payroll.structures.manage is rejected on GET and POST', { tag: ['@regression'] }, async ({ hrDirectoryPage }) => {
    const getResponse = await hrDirectoryPage.request.get('/api/payroll/components');
    expect(getResponse.status()).toBe(403);

    const postResponse = await hrDirectoryPage.request.post('/api/payroll/components', {
      data: { code: uniqueComponentCode(), name: uniqueComponentName(), component_type: 'earning', calculation_type: 'fixed', value: 1 },
    });
    expect(postResponse.status()).toBe(403);
  });
});

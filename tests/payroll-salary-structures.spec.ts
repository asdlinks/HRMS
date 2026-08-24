import { test, expect } from '../fixtures/auth';
import { PayrollStructuresPage } from '../pages/PayrollStructuresPage';
import { Toast } from '../pages/components/Toast';
import { uniqueStructureName, uniqueComponentCode, uniqueComponentName } from '../fixtures/payroll-data';
import { createSalaryComponent, createSalaryStructure, createEmployeeWithSalaryAssignment } from '../helpers/payroll';

/**
 * docs/Payroll_SalaryGrades_TestCases.csv — Salary Structures rows.
 * Automates: PR-FN-03, PR-FN-04, PR-NG-01 (structure half), PR-NG-03,
 * PR-VD-02, PR-VD-03, PR-AP-01, PR-AP-02.
 */
test.describe('Payroll — Salary Structures', () => {
  // Each test here chains several UI/API arrange steps against a real remote
  // dev server with a large, shared, ever-growing tenant dataset — the default
  // 30s Playwright test timeout is comfortably enough for a single-page CRUD
  // check but not for these multi-step flows. test.slow() (3x multiplier) is
  // Playwright's own idiom for exactly this, applied file-wide via beforeEach
  // rather than hand-picking which individual tests are 'heavy enough'.
  test.beforeEach(() => { test.slow(); });

  test('PR-FN-03: create/update/delete a salary structure', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const structures = new PayrollStructuresPage(adminPage);
    const created = await createSalaryStructure(adminPage);

    await structures.goto();
    await structures.selectStructure(created.name);
    await structures.openEditSelected();
    const updatedName = uniqueStructureName();
    await structures.fill({ name: updatedName });
    await structures.submit();
    await new Toast(adminPage).expectVisible('Structure updated');

    await structures.goto();
    await structures.openDelete(updatedName);
    await adminPage.getByRole('button', { name: 'Delete', exact: true }).click();
    await new Toast(adminPage).expectVisible('Structure deleted');
    await structures.expectRowAbsent(updatedName);
  });

  test('PR-FN-04: PUT /structures/:id/components replaces the full component list atomically', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const structures = new PayrollStructuresPage(adminPage);
    const compA = await createSalaryComponent(adminPage, { componentType: 'Earning', calculationType: 'Fixed amount', value: '2000' });
    const compB = await createSalaryComponent(adminPage, { componentType: 'Deduction', calculationType: 'Fixed amount', value: '300' });
    const structure = await createSalaryStructure(adminPage);

    await structures.goto();
    await structures.selectStructure(structure.name);
    await structures.toggleComponent(compA.name);
    await structures.setOverride(compA.name, '2500');
    await structures.toggleComponent(compB.name);
    await structures.saveComponents();
    await new Toast(adminPage).expectVisible('Structure components saved');

    const structuresList = await (await adminPage.request.get('/api/payroll/structures')).json();
    const structureId = structuresList.find((s: { name: string }) => s.name === structure.name)?.id;
    expect(structureId).toBeTruthy();
    const items = await (await adminPage.request.get(`/api/payroll/structures/${structureId}/components`)).json();
    expect(items.map((i: { code: string }) => i.code).sort()).toEqual([compA.code, compB.code].sort());
    const overridden = items.find((i: { code: string }) => i.code === compA.code);
    expect(Number(overridden.override_value)).toBe(2500);

    // Replacing again with a subset drops the previously-attached component —
    // confirms "full replace", not merge. Issued directly (this half of the
    // test is about the PUT contract, not the UI round-trip — already
    // exercised above) since a second live UI toggle/select cycle races the
    // page's own re-fetch-on-select effect for no added coverage.
    const componentsList = await (await adminPage.request.get('/api/payroll/components')).json();
    const compAId = componentsList.find((c: { code: string }) => c.code === compA.code)?.id;
    await adminPage.request.put(`/api/payroll/structures/${structureId}/components`, { data: { items: [{ component_id: compAId, sort_order: 0 }] } });
    const itemsAfter = await (await adminPage.request.get(`/api/payroll/structures/${structureId}/components`)).json();
    expect(itemsAfter.map((i: { code: string }) => i.code)).toEqual([compA.code]);
  });

  test('PR-NG-01: creating a structure with a name already used in the tenant is rejected with a 409-style message', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structures = new PayrollStructuresPage(adminPage);
    const existing = await createSalaryStructure(adminPage);

    await structures.goto();
    await structures.openAdd();
    await structures.fill({ name: existing.name });
    await structures.submit();

    // PayrollStructuresPage.tsx's handleSubmit surfaces a server error via a page-level snackbar, not inline dialog text.
    await new Toast(adminPage).expectVisible(new RegExp(`A structure named "${existing.name}" already exists`));
  });

  test('PR-NG-03: deleting a structure referenced by an employee salary assignment is rejected with 409', { tag: ['@regression'] }, async ({ adminPage }) => {
    const structures = new PayrollStructuresPage(adminPage);
    const structure = await createSalaryStructure(adminPage);
    await createEmployeeWithSalaryAssignment(adminPage, { structureName: structure.name, ctcAnnual: '600000', effectiveFrom: '2025-01-01' });

    await structures.goto();
    await structures.openDelete(structure.name);
    await adminPage.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(adminPage.getByText('This structure is assigned to one or more employees and cannot be deleted')).toBeVisible();
    await expect(structures.listItem(structure.name)).toBeVisible();
  });

  test('PR-VD-02: creating a structure without a name is rejected with 400', { tag: ['@regression'] }, async ({ adminPage }) => {
    const response = await adminPage.request.post('/api/payroll/structures', { data: { description: 'no name provided' } });
    expect(response.status()).toBe(400);
  });

  test('PR-VD-03 (confirmed gap): a duplicate component_id within one structureComponentsReplaceSchema items array is not deduped', { tag: ['@regression'] }, async ({ adminPage }) => {
    const component = await createSalaryComponent(adminPage);
    const structure = await createSalaryStructure(adminPage);
    const structures = await (await adminPage.request.get('/api/payroll/structures')).json();
    const structureId = structures.find((s: { name: string }) => s.name === structure.name)?.id;
    const components = await (await adminPage.request.get('/api/payroll/components')).json();
    const componentId = components.find((c: { code: string }) => c.code === component.code)?.id;

    const response = await adminPage.request.put(`/api/payroll/structures/${structureId}/components`, {
      data: { items: [{ component_id: componentId, sort_order: 0 }, { component_id: componentId, sort_order: 1 }] },
    });
    // structureComponentsReplaceSchema performs no dedup — the raw
    // UQ_salary_structure_components UNIQUE violation is the only floor,
    // surfacing as an unhandled error rather than a friendly 400.
    expect(response.ok()).toBeFalsy();
  });

  test('PR-AP-01: components and structures full CRUD contract', { tag: ['@regression'] }, async ({ adminPage }) => {
    const compCode = uniqueComponentCode();
    const compName = uniqueComponentName();
    const createComp = await adminPage.request.post('/api/payroll/components', {
      data: { code: compCode, name: compName, component_type: 'earning', calculation_type: 'fixed', value: 100 },
    });
    expect(createComp.status()).toBe(200);
    const compId = (await createComp.json()).id;
    expect(typeof compId).toBe('number');

    const patchComp = await adminPage.request.patch(`/api/payroll/components/${compId}`, {
      data: { code: compCode, name: `${compName} v2`, component_type: 'earning', calculation_type: 'fixed', value: 150 },
    });
    expect(await patchComp.json()).toEqual({ success: true });

    const structureName = uniqueStructureName();
    const createStruct = await adminPage.request.post('/api/payroll/structures', { data: { name: structureName } });
    expect(createStruct.status()).toBe(200);
    const structId = (await createStruct.json()).id;

    const patchStruct = await adminPage.request.patch(`/api/payroll/structures/${structId}`, { data: { name: `${structureName} v2` } });
    expect(await patchStruct.json()).toEqual({ success: true });

    const deleteStruct = await adminPage.request.delete(`/api/payroll/structures/${structId}`);
    expect(await deleteStruct.json()).toEqual({ success: true });

    const deleteComp = await adminPage.request.delete(`/api/payroll/components/${compId}`);
    expect(await deleteComp.json()).toEqual({ success: true, deactivated: false });
  });

  test('PR-AP-02: GET/PUT /structures/:id/components round-trips a full replace', { tag: ['@regression'] }, async ({ adminPage }) => {
    const component = await createSalaryComponent(adminPage);
    const structure = await createSalaryStructure(adminPage);
    const structures = await (await adminPage.request.get('/api/payroll/structures')).json();
    const structureId = structures.find((s: { name: string }) => s.name === structure.name)?.id;
    const components = await (await adminPage.request.get('/api/payroll/components')).json();
    const componentId = components.find((c: { code: string }) => c.code === component.code)?.id;

    const putResponse = await adminPage.request.put(`/api/payroll/structures/${structureId}/components`, {
      data: { items: [{ component_id: componentId, override_value: 999, sort_order: 0 }] },
    });
    expect(await putResponse.json()).toEqual({ success: true });

    const getResponse = await adminPage.request.get(`/api/payroll/structures/${structureId}/components`);
    const items = await getResponse.json();
    expect(items).toHaveLength(1);
    expect(Number(items[0].override_value)).toBe(999);
  });
});

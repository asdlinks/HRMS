import { test, expect } from '../fixtures/auth';
import { HolidayCalendarPage } from '../pages/HolidayCalendarPage';
import { HolidayConfigPanel } from '../pages/HolidayConfigPanel';
import { Toast } from '../pages/components/Toast';
import { uniqueHolidayName, uniqueFutureNonSundayDate, nearFutureNonSundayDate, KNOWN_KOCHI_LOCATION_ID } from '../fixtures/holidays-data';
import { getHolidaysApi, createHoliday, createLocation } from '../helpers/holidays';

/**
 * docs/Holidays_TestCases.csv — core CRUD + UI round-trip across both admin
 * surfaces (client/src/pages/HolidayCalendarPage.tsx and SettingsPage.tsx's
 * "Holiday Config" tab). Automates: HL-FN-01, HL-FN-02, HL-FN-03, HL-FN-06,
 * HL-FN-07, HL-FN-08, HL-FN-09, HL-FN-10, HL-FN-11, HL-UI-01, HL-UI-02,
 * HL-UI-03, HL-UI-04, HL-UI-05, HL-UI-06, HL-UI-07, HL-UI-08.
 *
 * Permission/negative/security rows live in holidays-permissions-security.spec.ts;
 * validation/boundary rows in holidays-validation.spec.ts; raw contract
 * checks in holidays-api-contracts.spec.ts. `adminPage` holds holidays.manage
 * in the `testauto` tenant (Organization Administrator role — confirmed
 * live); holidays are disposable records like shifts/branches (created with
 * a uniqueSuffix()-based name, never deleted — FRAMEWORK_GUIDELINES.md's
 * Cleanup strategy) except where a test's own point is exercising DELETE.
 *
 * test.slow() on every test here — confirmed live (2026-08-14) that under
 * this suite's default parallel worker count, this shared dev tenant's
 * response latency for HolidayCalendarPage/Holiday Config tab loads climbs
 * high enough to threaten the default 30s test timeout even with individual
 * assertions already carrying their own 15-30s overrides; same rationale as
 * company-profile-lifecycle.spec.ts's identical `test.beforeEach(() => {
 * test.slow(); })`.
 */
test.describe('Holidays — Lifecycle', () => {
  test.beforeEach(() => { test.slow(); });

  test('HL-FN-01: creating a company-wide holiday ("Common (All Locations)") via the real form inserts a row with location_id=NULL', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const page = new HolidayCalendarPage(adminPage);
    const name = uniqueHolidayName('HL-FN-01');
    const date = uniqueFutureNonSundayDate();

    await page.goto();
    await page.openAdd();
    await page.fill({ name, date, location: '' });
    await page.submit();
    await new Toast(adminPage).expectVisible('Holiday added successfully!');

    const rows = await (await getHolidaysApi(adminPage)).json();
    const created = rows.find((r: { name: string; date: string }) => r.name === name);
    expect(created).toBeTruthy();
    expect(created.location_id).toBeNull();
  });

  test('HL-FN-02: creating a holiday scoped to a single location via the real form inserts a row with that location_id', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const page = new HolidayCalendarPage(adminPage);
    const location = await createLocation(adminPage);
    const name = uniqueHolidayName('HL-FN-02');
    const date = uniqueFutureNonSundayDate();

    await page.goto();
    await page.openAdd();
    await page.fill({ name, date, location: location.name });
    await page.submit();
    await new Toast(adminPage).expectVisible('Holiday added successfully!');

    const rows = await (await getHolidaysApi(adminPage)).json();
    const created = rows.find((r: { name: string; date: string }) => r.name === name);
    expect(created).toBeTruthy();
    expect(created.location_id).toBe(location.id);
  });

  test('HL-UI-02: the HolidayCalendarPage Add form is single-select only — no multi-location checkboxes and no Flexi Holiday option', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const page = new HolidayCalendarPage(adminPage);
    await page.goto();
    await page.openAdd();

    expect(await page.isFlexiToggleVisible()).toBe(false);
    // The Location field is a single MUI <Select> (one combobox), not a
    // FormGroup of independent checkboxes like SettingsPage's Holiday Config tab.
    await expect(page.dialog.getByRole('checkbox')).toHaveCount(0);
  });

  test('HL-FN-06 / HL-UI-08: deleting a single-location holiday removes it, and no Edit affordance exists anywhere on this page', { tag: ['@regression'] }, async ({ adminPage }) => {
    const page = new HolidayCalendarPage(adminPage);
    const name = uniqueHolidayName('HL-FN-06');
    await createHoliday(adminPage, { name });

    await page.goto();
    // 15s, not the default 5s — matches Toast.expectVisible()'s own established
    // override for this shared, occasionally-slow dev tenant (see
    // FRAMEWORK_GUIDELINES.md's Cleanup strategy addendum on scoped local overrides).
    await expect(page.holidayCard(name)).toBeVisible({ timeout: 15_000 });

    // HL-UI-08: clicking the card body (not the delete IconButton) opens nothing.
    await page.holidayCard(name).getByText(name).click();
    await expect(page.dialog).toHaveCount(0);

    await page.openDelete(name);
    const confirm = page.confirmDeleteDialog(name);
    await confirm.expectVisible();
    await confirm.confirm('Remove');
    await new Toast(adminPage).expectVisible('Holiday removed');
    await page.expectCardAbsent(name);
  });

  test('HL-UI-07: the delete confirmation dialog explicitly warns it removes the holiday for every location it was scheduled against', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const page = new HolidayCalendarPage(adminPage);
    const name = uniqueHolidayName('HL-UI-07');
    await createHoliday(adminPage, { name });

    await page.goto();
    await page.openDelete(name);
    await expect(page.page.getByText('This removes the holiday for every location it was scheduled against.')).toBeVisible();
    await page.confirmDeleteDialog(name).cancel();
  });

  test('HL-UI-01: the Add button and Location filter render only for a holidays.manage holder', { tag: ['@sanity'] }, async ({ adminPage, employeeSelfPage }) => {
    const adminCalendar = new HolidayCalendarPage(adminPage);
    await adminCalendar.goto();
    // 15s, not the default 5s — shared-tenant-under-parallel-load rationale (see this file's header comment).
    await expect(adminCalendar.addButton).toBeVisible({ timeout: 15_000 });

    // employeeSelfPage holds holidays.view only (confirmed live matrix) — the whole actions block (filter + Add) is gated on canManageHolidays.
    const employeeCalendar = new HolidayCalendarPage(employeeSelfPage);
    await employeeCalendar.goto();
    await expect(employeeCalendar.addButton).toHaveCount(0);
  });

  test('HL-FN-09: HolidayCalendarPage defaults to the viewer\'s own location, not "All Locations"', { tag: ['@regression'] }, async ({ adminPage, employeeSelfPage }) => {
    // employeeSelfPage's location_id is 35 ("Kochi") — confirmed live. A
    // second, freshly created location proves the default view is genuinely
    // scoped to Kochi, not accidentally showing every location anyway.
    const otherLocation = await createLocation(adminPage);
    const kochiHoliday = uniqueHolidayName('HL-FN-09-kochi');
    const otherHoliday = uniqueHolidayName('HL-FN-09-other');
    await createHoliday(adminPage, { name: kochiHoliday, location_id: KNOWN_KOCHI_LOCATION_ID });
    await createHoliday(adminPage, { name: otherHoliday, location_id: otherLocation.id });

    const page = new HolidayCalendarPage(employeeSelfPage);
    await page.goto();
    // 15s, not the default 5s — this shared dev tenant is occasionally slower under this suite's default parallel worker count (see HL-FN-06's identical override elsewhere in this file).
    await expect(page.holidayCard(kochiHoliday)).toBeVisible({ timeout: 15_000 });
    await expect(page.holidayCard(otherHoliday)).toHaveCount(0);
  });

  test('HL-FN-03 / HL-AP-02: POST with a location_ids array spanning multiple locations inserts one row per location, sharing the same name+date', { tag: ['@regression'] }, async ({ adminPage }) => {
    const locationA = await createLocation(adminPage);
    const locationB = await createLocation(adminPage);
    const name = uniqueHolidayName('HL-FN-03');
    const date = uniqueFutureNonSundayDate();

    const response = await adminPage.request.post('/api/holidays', { data: { name, date, location_ids: [locationA.id, locationB.id] } });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toEqual({ success: true, count: 2 });

    const rows = await (await getHolidaysApi(adminPage)).json();
    const matching = rows.filter((r: { name: string; date: string }) => r.name === name);
    expect(matching.map((r: { location_id: number }) => r.location_id).sort()).toEqual([locationA.id, locationB.id].sort());
  });

  test('HL-FN-07: deleting a grouped multi-location holiday from the UI fires one DELETE per underlying row and removes every one', { tag: ['@regression'] }, async ({ adminPage }) => {
    const locationA = await createLocation(adminPage);
    const locationB = await createLocation(adminPage);
    const name = uniqueHolidayName('HL-FN-07');
    const date = uniqueFutureNonSundayDate();
    const postResponse = await adminPage.request.post('/api/holidays', { data: { name, date, location_ids: [locationA.id, locationB.id] } });
    expect(postResponse.ok()).toBeTruthy();

    const page = new HolidayCalendarPage(adminPage);
    await page.goto();
    // Both rows share one grouped card (HolidayCalendarPage.tsx's groupedHolidays reducer) — deleting it once must clear both underlying ids.
    await page.openDelete(name);
    await page.confirmDeleteDialog(name).confirm('Remove');
    await new Toast(adminPage).expectVisible('Holiday removed');
    await page.expectCardAbsent(name);

    const rows = await (await getHolidaysApi(adminPage)).json();
    expect(rows.filter((r: { name: string }) => r.name === name)).toHaveLength(0);
  });

  test('HL-FN-08 / HL-UI-04: the Settings > Holiday Config "Flexi" toggle routes the same Add form to POST /flexi-holidays instead of /holidays', { tag: ['@regression'] }, async ({ adminPage }) => {
    const panel = new HolidayConfigPanel(adminPage);
    const name = uniqueHolidayName('HL-FN-08');
    const date = uniqueFutureNonSundayDate();

    await panel.goto();
    await panel.fill({ name, date, isFlexi: true });
    await panel.submit();
    await panel.expectSaved();

    const flexiRows = await (await getHolidaysApi(adminPage, 'flexi_holidays')).json();
    expect(flexiRows.some((r: { name: string }) => r.name === name)).toBe(true);
    const regularRows = await (await getHolidaysApi(adminPage)).json();
    expect(regularRows.some((r: { name: string }) => r.name === name)).toBe(false);
  });

  test('HL-FN-10 / HL-UI-03: Settings > Holiday Config multi-location checkboxes and the "Common (All Locations)" checkbox both function correctly', { tag: ['@regression'] }, async ({ adminPage }) => {
    const location = await createLocation(adminPage);
    const panel = new HolidayConfigPanel(adminPage);
    const name = uniqueHolidayName('HL-FN-10');
    const date = uniqueFutureNonSundayDate();

    await panel.goto();
    // "Common (All Locations)" is checked by default (location_ids starts []) — checking a specific location must clear it.
    // 30s, not the default 5s — confirmed live this can exceed even a 15s override under this suite's default parallel worker count (see this file's header comment).
    await expect(panel.allLocationsCheckbox).toBeChecked({ timeout: 30_000 });
    await panel.fill({ name, date, locations: [location.name] });
    await expect(panel.allLocationsCheckbox).not.toBeChecked();
    await panel.submit();
    await panel.expectSaved();

    const rows = await (await getHolidaysApi(adminPage)).json();
    const created = rows.find((r: { name: string }) => r.name === name);
    expect(created.location_id).toBe(location.id);
  });

  test('HL-UI-05: the Year filter is client-side only — switching years re-filters already-fetched data without a fresh GET /holidays', { tag: ['@sanity'] }, async ({ adminPage }) => {
    const panel = new HolidayConfigPanel(adminPage);
    // goto() itself already waits for the tab's initial fetchHolidaysAndLocations() (fired on mount) to settle, so it isn't misattributed to the selectYear() calls below.
    await panel.goto();

    let holidaysRequestCount = 0;
    adminPage.on('request', (req) => {
      if (req.url().includes('/api/holidays') && req.method() === 'GET') holidaysRequestCount += 1;
    });
    await panel.selectYear(2027);
    await panel.selectYear(2025);
    expect(holidaysRequestCount).toBe(0);
  });

  test('HL-FN-11 / HL-UI-06: the dashboard\'s "Upcoming Holidays" widget shows the next holidays, deduped by name+date across multi-location rows', { tag: ['@sanity'] }, async ({ adminPage, employeeSelfPage }) => {
    const locationA = await createLocation(adminPage);
    const locationB = await createLocation(adminPage);
    const name = uniqueHolidayName('HL-FN-11');
    // Near-term, not the usual 30-329-day-out uniqueFutureNonSundayDate() —
    // the dashboard widget only ever shows the 5 SOONEST holidays; see
    // nearFutureNonSundayDate()'s own doc comment.
    const date = nearFutureNonSundayDate();
    const postResponse = await adminPage.request.post('/api/holidays', { data: { name, date, location_ids: [KNOWN_KOCHI_LOCATION_ID, locationA.id, locationB.id] } });
    expect(postResponse.ok()).toBeTruthy();

    // employeeSelfPage's own location (35/Kochi) is one of the 3 rows created above, so it's visible to them.
    await employeeSelfPage.goto('/');
    const card = employeeSelfPage.getByText('Upcoming Holidays').locator('../..');
    // employeeSelfPage is a heavily-reused fixed persona with a large real
    // leave/attendance history (FRAMEWORK_GUIDELINES.md's Cleanup strategy
    // flags exactly this class of accumulated-state exhaustion risk) —
    // EmployeeDashboard.tsx's own Promise.all (leaves/holidays/settings/users)
    // confirmed live to sometimes take well over 15s to settle for this
    // specific persona. 30s override, same shared-tenant rationale as other
    // scoped overrides in this suite.
    await expect(card).toBeVisible({ timeout: 30_000 });
    // Deduped: the 3 underlying rows for this name+date render as exactly one entry.
    await expect(card.getByText(name)).toHaveCount(1);
  });
});

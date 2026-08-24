import { test, expect } from '../fixtures/auth';
import { SQL_INJECTION_PAYLOADS } from '../fixtures/test-data';
import { uniqueHolidayName, uniqueFutureNonSundayDate, HOLIDAY_NAME_LENGTH_BOUNDARY } from '../fixtures/holidays-data';
import { addHolidayApi, getHolidaysApi, createLocation, createHoliday } from '../helpers/holidays';

/**
 * docs/Holidays_TestCases.csv — schema/DB-layer validation and boundary
 * rows. Automates: HL-VD-01, HL-VD-03, HL-NG-04, HL-NG-05 (also frames
 * HL-VD-02, its schema-layer duplicate per the CSV's own cross-reference),
 * HL-NG-06 (also covers HL-DB-02's identical claim at the API layer — no
 * separate raw-DB-insert test exists, see holidays-not-automatable.spec.ts),
 * HL-BD-01, HL-BD-02, HL-SC-04. `adminPage` holds holidays.manage
 * (confirmed live matrix — see holidays-lifecycle.spec.ts's header comment).
 */
test.describe('Holidays — Validation', () => {
  test('HL-VD-01: POST /api/holidays without name or date is rejected 400', { tag: ['@regression'] }, async ({ adminPage }) => {
    const missingName = await addHolidayApi(adminPage, { name: '', date: uniqueFutureNonSundayDate() });
    expect(missingName.status()).toBe(400);

    const missingDate = await addHolidayApi(adminPage, { name: uniqueHolidayName(), date: '' });
    expect(missingDate.status()).toBe(400);
  });

  test('HL-VD-03: submitting location_ids as a non-array value is rejected 400', { tag: ['@regression'] }, async ({ adminPage }) => {
    const response = await adminPage.request.post('/api/holidays', {
      data: { name: uniqueHolidayName(), date: uniqueFutureNonSundayDate(), location_ids: 'not-an-array' },
    });
    expect(response.status()).toBe(400);
  });

  test('HL-NG-04 (confirmed gap): a location_id that doesn\'t exist for the tenant surfaces as a raw FK-violation 500, not a clean 400', { tag: ['@regression'] }, async ({ adminPage }) => {
    const response = await addHolidayApi(adminPage, { name: uniqueHolidayName(), date: uniqueFutureNonSundayDate(), location_id: 999999999 });
    expect(response.status()).toBe(500); // no app-layer existence check exists — this documents the gap, not a passing contract.
  });

  test('HL-NG-05 / HL-VD-02 (confirmed gap): a malformed date string passes Zod\'s min(1)-only check and fails only at the SQL Date-binding layer, as a raw 500', { tag: ['@regression'] }, async ({ adminPage }) => {
    const response = await addHolidayApi(adminPage, { name: uniqueHolidayName(), date: 'not-a-date' });
    expect(response.status()).toBe(500);
  });

  test('HL-NG-06 / HL-DB-02 (CRITICAL, confirmed gap): submitting the exact same holiday (name+date+location) twice succeeds both times — no unique constraint or app-layer duplicate check exists', { tag: ['@regression'] }, async ({ adminPage }) => {
    const name = uniqueHolidayName('HL-NG-06');
    const date = uniqueFutureNonSundayDate();

    const first = await addHolidayApi(adminPage, { name, date, location_id: null });
    expect(first.ok()).toBeTruthy();
    const second = await addHolidayApi(adminPage, { name, date, location_id: null });
    expect(second.ok()).toBeTruthy(); // confirmed gap: no rejection, no dedup — both inserts land.

    const rows = await (await getHolidaysApi(adminPage)).json();
    expect(rows.filter((r: { name: string; date: string }) => r.name === name && r.date.slice(0, 10) === date)).toHaveLength(2);
  });

  test.describe('HL-BD-01: holidays.name is NVARCHAR(255) — accepted at the limit, fails only at the DB layer one character over', () => {
    for (const { value, shouldPass, label } of HOLIDAY_NAME_LENGTH_BOUNDARY) {
      test(`name ${label}`, { tag: ['@regression'] }, async ({ adminPage }) => {
        const response = await addHolidayApi(adminPage, { name: value, date: uniqueFutureNonSundayDate() });
        if (shouldPass) {
          expect(response.ok()).toBeTruthy();
        } else {
          expect(response.status()).toBe(500); // schema only checks .min(1) — no max length mirrors the DB column, so this fails only as a raw SQL truncation error.
        }
      });
    }
  });

  test('HL-BD-02 (confirmed over-inclusive display bug): a viewer whose own location_id is NULL (admin) sees every location\'s holidays by default, with no explicit "All Locations" choice ever made', { tag: ['@regression'] }, async ({ adminPage }) => {
    // adminPage's location_id is NULL (confirmed live) — `user.location_id ?? ''`
    // collapses to the exact same '' value an explicit "All Locations" pick
    // would produce, so `getHolidays(selectedLocationId || undefined)` sends
    // no locationId param at all on first render, and holidays.repository.js's
    // list() returns every row, tenant-wide, unfiltered — see HL-FN-05's
    // near-identical server-side claim in holidays-api-contracts.spec.ts.
    const locationA = await createLocation(adminPage);
    const locationB = await createLocation(adminPage);
    const holidayA = await createHoliday(adminPage, { location_id: locationA.id });
    const holidayB = await createHoliday(adminPage, { location_id: locationB.id });

    await adminPage.goto('/holidays');
    // 15s, not the default 5s — matches Toast.expectVisible()'s own established override for this shared, occasionally-slow dev tenant.
    await expect(adminPage.getByText(holidayA.name)).toBeVisible({ timeout: 15_000 });
    await expect(adminPage.getByText(holidayB.name)).toBeVisible();
    // The Location filter's underlying value is '' (confirmed by reading
    // HolidayCalendarPage.tsx's `user.location_id ?? ''`) — MUI's <Select>
    // has no `displayEmpty` prop set here, so it renders blank for an
    // empty-string value rather than literally showing the matching
    // MenuItem's "Common (All Locations)"/"All Locations" label text; the two
    // cross-location holiday assertions above are the observable proof of
    // the unfiltered fetch this row documents, not the (non-rendered) label.
  });

  test('HL-SC-04: SQL injection payloads in the holiday name field are safely parameterized, never executed', { tag: ['@regression'] }, async ({ adminPage }) => {
    for (const payload of SQL_INJECTION_PAYLOADS) {
      const response = await addHolidayApi(adminPage, { name: payload, date: uniqueFutureNonSundayDate() });
      expect(response.ok()).toBeTruthy();
    }
    const rows = await (await getHolidaysApi(adminPage)).json();
    for (const payload of SQL_INJECTION_PAYLOADS) {
      expect(rows.some((r: { name: string }) => r.name === payload)).toBe(true); // stored as literal text, never executed.
    }
  });
});

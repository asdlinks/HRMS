/**
 * Shared "arrange"/API helpers for the Holidays suite
 * (docs/Holidays_TestCases.csv). No existing helper file touches
 * /holidays, /flexi-holidays, or /locations — per FRAMEWORK_GUIDELINES.md
 * this gets its own file rather than being bolted onto seed.ts/leave.ts.
 *
 * Deliberately API-level (page.request.*), same shape as
 * helpers/companyProfile.ts's raw-vs-disposable split — most Holidays tests
 * need a disposable holiday/location to exist as fast, reliable *setup* so
 * the test itself can focus on the actual assertion (permission guard,
 * cross-location scoping bug, validation gap, ...).
 *
 * Holidays are disposable records (like shifts/branches/departments) — per
 * FRAMEWORK_GUIDELINES.md's Cleanup strategy, created with a
 * uniqueSuffix()-based name and never deleted, EXCEPT where a test's own
 * point is exercising the DELETE endpoint itself.
 */
import { type APIResponse, type Page } from '@playwright/test';
import { assertOk } from './rbac';
import { uniqueHolidayName, uniqueFutureNonSundayDate, uniqueLocationName } from '../fixtures/holidays-data';
import { uniqueEmployee } from '../fixtures/test-data';

export type HolidayTable = 'holidays' | 'flexi_holidays';

function basePath(table: HolidayTable): string {
  return table === 'holidays' ? '/api/holidays' : '/api/flexi-holidays';
}

export interface HolidayRow {
  id: number;
  name: string;
  date: string;
  location_id: number | null;
  location_name?: string | null;
}

/** GET /api/holidays or /api/flexi-holidays — raw, doesn't assert. Requires holidays.view or holidays.manage. */
export async function getHolidaysApi(page: Page, table: HolidayTable = 'holidays', locationId?: number | string): Promise<APIResponse> {
  return page.request.get(basePath(table), { params: locationId !== undefined ? { locationId } : {} });
}

/**
 * POST /api/holidays or /api/flexi-holidays — raw, doesn't assert.
 * `location_ids` (plural) is the multi-location shape the real Settings UI
 * sends; `location_id` (singular) is the shape HolidayCalendarPage's
 * single-select Add form sends. holidays.routes.js's POST handler accepts
 * either — see createHolidayRouter's `location_id, location_ids` destructure.
 */
export async function addHolidayApi(
  page: Page,
  data: { name: string; date: string; location_id?: number | string | null; location_ids?: Array<number | string> },
  table: HolidayTable = 'holidays',
): Promise<APIResponse> {
  return page.request.post(basePath(table), { data });
}

/** DELETE /api/holidays/:id or /api/flexi-holidays/:id — raw, doesn't assert. */
export async function deleteHolidayApi(page: Page, id: number | string, table: HolidayTable = 'holidays'): Promise<APIResponse> {
  return page.request.delete(`${basePath(table)}/${id}`);
}

/**
 * Creates a disposable holiday (default: company-wide, `location_id: null`)
 * via the API and returns its identity, including the server-assigned id
 * (read back via a subsequent GET, since POST only returns `{success, count}`
 * — see HL-AP-02). Assumes `page`'s persona holds holidays.manage.
 */
export async function createHoliday(
  page: Page,
  overrides: Partial<{ name: string; date: string; location_id: number | string | null; table: HolidayTable }> = {},
): Promise<HolidayRow> {
  const table = overrides.table ?? 'holidays';
  const name = overrides.name ?? uniqueHolidayName();
  const date = overrides.date ?? uniqueFutureNonSundayDate();
  const location_id = overrides.location_id ?? null;

  const postResponse = await addHolidayApi(page, { name, date, location_id }, table);
  assertOk(postResponse);

  const listResponse = await getHolidaysApi(page, table);
  assertOk(listResponse);
  const rows: HolidayRow[] = await listResponse.json();
  const created = rows.find((r) => r.name === name && r.date.slice(0, 10) === date);
  if (!created) throw new Error(`createHoliday(): couldn't find the just-created ${table} row "${name}" on ${date} via GET ${basePath(table)}`);
  return created;
}

export interface LocationRow {
  id: number;
  name: string;
}

/** POST /api/locations — raw, doesn't assert. Assumes `page`'s persona holds locations.manage. */
export async function addLocationApi(page: Page, name: string): Promise<APIResponse> {
  return page.request.post('/api/locations', { data: { name } });
}

/** DELETE /api/locations/:id — raw, doesn't assert. */
export async function deleteLocationApi(page: Page, id: number | string): Promise<APIResponse> {
  return page.request.delete(`/api/locations/${id}`);
}

/**
 * Creates a disposable location dedicated to one test's own location-scoping
 * assertion (e.g. HL-SC-01's "a holiday scoped ONLY to Location B") — kept
 * separate from Employee Master's BranchTab.ts/OrganizationStructurePage.ts
 * (same underlying `locations` table, different UI surface) since these
 * tests only need the API identity, not the Branches tab's UI round-trip,
 * which Employee Master's own frozen suite already owns.
 */
export async function createLocation(page: Page, overrides: Partial<{ name: string }> = {}): Promise<LocationRow> {
  const name = overrides.name ?? uniqueLocationName();
  const response = await addLocationApi(page, name);
  assertOk(response);
  const body = await response.json();
  return { id: body.id, name: body.name ?? name };
}

/**
 * Creates a disposable employee directly via POST /api/users, reusing
 * uniqueEmployee() (fixtures/test-data.ts) for the identity but bypassing
 * EmployeesPage/EmployeeFormDialog's UI flow entirely — needed here (rather
 * than seed.ts's createEmployee(), which drives that UI) for two reasons:
 * (1) userCreateSchema (server/schemas/index.js) accepts `location_id`
 * directly, letting the HL-SC-01/02/03 scenarios put an employee at a
 * specific Location A/B or at no location at all, a field seed.ts's version
 * doesn't expose and EmployeeFormDialog.ts has no `branch` support without
 * going through its Department/Designation-selecting UI; (2) confirmed live
 * (2026-08-14): the Employees page's UI flow hits the ALREADY-registered
 * EM-004 product defect (GET /api/users timing out/rendering slowly once
 * this shared dev tenant's employee count grows — docs/HRMS_PRODUCT_DEFECT_REGISTER.md)
 * badly enough that EmployeeFormDialog's Branch/Department dropdowns
 * intermittently never populate in time, unrelated to anything this module
 * is actually testing. Going straight to the API sidesteps that instability
 * — legitimate here since these tests exist to prove the Leave module's
 * cross-location holiday bug, not to re-test Employee creation UI (already
 * owned by the frozen Employee Master suite). role: 'Employee' is
 * auto-resolved to a real role id server-side (users.routes.js) — no
 * separate PUT /users/:id/roles call needed.
 */
export async function createEmployeeAtLocation(page: Page, locationId?: number | string) {
  const emp = uniqueEmployee();
  const response = await page.request.post('/api/users', {
    data: {
      name: emp.name,
      email: emp.email,
      password: emp.password,
      role: 'Employee',
      date_of_birth: emp.dateOfBirth,
      employee_id: emp.employeeId,
      joining_date: emp.joiningDate,
      location_id: locationId ?? null,
    },
  });
  assertOk(response);
  const body = await response.json();
  return { ...emp, id: body.id };
}

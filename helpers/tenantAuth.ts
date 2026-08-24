import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { TENANT_CODE } from '../fixtures/personas';
import { KioskDevicesPage } from '../pages/KioskDevicesPage';
import { uniqueSuffix } from '../fixtures/test-data';

/**
 * Raw, unauthenticated request builders for docs/TenantAuth_TestCases.csv.
 * This is the one module in the suite that is SUPPOSED to call
 * /api/auth/* directly — every other spec file must keep using the
 * adminPage/managerPage/... fixtures instead (see fixtures/auth.ts's own
 * header comment and e2e/FRAMEWORK_GUIDELINES.md's "Never call
 * /api/auth/login... directly in a test" rule, written for every module
 * except this one).
 *
 * Every function here takes a plain APIRequestContext (e.g. from
 * `(await browser.newContext()).request`, or a throwaway
 * `request.newContext()`) rather than a persona page, since the whole point
 * is to exercise login/refresh/logout/kiosk auth as an anonymous caller. A
 * field set to `undefined` in the data/overrides object is dropped by
 * JSON.stringify before it reaches the wire — the standard way these
 * builders express "field omitted entirely", not "field sent empty".
 */

export function rawLogin(request: APIRequestContext, data: Partial<{ tenantCode: string; email: string; password: string }> = {}) {
  return request.post('/api/auth/login', { data: { tenantCode: TENANT_CODE, ...data } });
}

export function rawRefresh(request: APIRequestContext, cookieOverride?: string) {
  return request.post('/api/auth/refresh', cookieOverride ? { headers: { Cookie: cookieOverride } } : undefined);
}

export function rawLogout(request: APIRequestContext, cookieOverride?: string) {
  return request.post('/api/auth/logout', cookieOverride ? { headers: { Cookie: cookieOverride } } : undefined);
}

export function rawChangePassword(request: APIRequestContext, accessToken: string, data: { currentPassword?: string; newPassword?: string }) {
  return request.post('/api/auth/change-password', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data,
  });
}

export function rawKioskLogin(request: APIRequestContext, data: Partial<{ tenantCode: string; deviceName: string; deviceKey: string }> = {}) {
  return request.post('/api/auth/kiosk-login', { data: { tenantCode: TENANT_CODE, ...data } });
}

export function rawKioskRefresh(request: APIRequestContext, cookieOverride?: string) {
  return request.post('/api/auth/kiosk-refresh', cookieOverride ? { headers: { Cookie: cookieOverride } } : undefined);
}

/**
 * Registers a throwaway kiosk device via KioskDevicesPage (Attendance
 * module, frozen — used here read-only, never modified) and captures the
 * plaintext device key from its one-time reveal dialog before dismissing
 * it. The dialog has no accessible name for the key text itself, so it's
 * read via the Copy button's parent Box — see DeviceKeyRevealDialog.tsx.
 */
export async function registerDeviceAndCaptureKey(adminPage: Page) {
  const kiosk = new KioskDevicesPage(adminPage);
  const deviceName = `E2E Kiosk ${uniqueSuffix()}`;
  await kiosk.goto();
  await kiosk.openRegister();
  await kiosk.fillRegisterForm({ deviceName });
  await kiosk.submitRegister();
  await expect(kiosk.keyRevealDialog).toBeVisible();
  const deviceKey = await kiosk.keyRevealDialog.getByRole('button', { name: 'Copy' }).locator('..').locator('p').first().textContent();
  await kiosk.closeKeyReveal();
  return { deviceName, deviceKey: (deviceKey ?? '').trim() };
}

/**
 * Opens the TopNav profile menu and clicks Logout. The trigger IconButton
 * has no accessible name of its own (just an Avatar, no Tooltip — unlike the
 * row-action buttons e2e/README.md documents elsewhere), so it's matched
 * structurally by the Avatar it wraps rather than by name.
 */
export async function logoutViaUi(page: Page) {
  await page.locator('button').filter({ has: page.locator('.MuiAvatar-root') }).click();
  await page.getByRole('menuitem', { name: 'Logout' }).click();
}

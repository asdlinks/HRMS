import api, { setAccessToken } from './client';
import type { KioskSession } from '../types';

// POST /api/auth/kiosk-login — device pairing. The deviceKey is the one-time
// secret HR shows once in the HRMS "Kiosk Devices" admin page; it is used here
// exactly once and NEVER persisted anywhere in this app.
export async function kioskLogin(tenantCode: string, deviceName: string, deviceKey: string): Promise<KioskSession> {
  const { data } = await api.post<KioskSession>('/auth/kiosk-login', { tenantCode, deviceName, deviceKey });
  setAccessToken(data.accessToken);
  return data;
}

// POST /api/auth/kiosk-refresh — reads the httpOnly device refresh cookie,
// rotates it, returns a fresh 5-minute access token. Used both on cold start
// (to resume a stored device session without re-pairing) and by the proactive
// refresh timer.
export async function kioskRefresh(): Promise<KioskSession> {
  const { data } = await api.post<KioskSession>('/auth/kiosk-refresh');
  setAccessToken(data.accessToken);
  return data;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { kioskLogin, kioskRefresh } from '../api/auth';
import { setSessionHandlers, setAccessToken, getAccessToken } from '../api/client';
import { config } from '../config';
import { tokenExpiryMs } from '../jwt';
import type { DeviceIdentity, DeviceInfo } from '../types';

const IDENTITY_KEY = 'kiosk.identity';

function loadIdentity(): DeviceIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as DeviceIdentity) : null;
  } catch {
    return null;
  }
}

function saveIdentity(id: DeviceIdentity): void {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(id));
}

export type SessionStatus = 'bootstrapping' | 'registered' | 'unregistered';

// Owns the whole device-auth lifecycle:
//   - cold start: try kiosk-refresh against the stored httpOnly cookie so a
//     mounted kiosk resumes without re-pairing
//   - registration: kiosk-login with the one-time deviceKey
//   - proactive refresh timer, scheduled off the (very short, 5m) token exp
//   - wiring the axios reactive-refresh handlers so a 401 mid-scan self-heals
export function useKioskSession() {
  const [status, setStatus] = useState<SessionStatus>('bootstrapping');
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [identity, setIdentity] = useState<DeviceIdentity | null>(loadIdentity());
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const timerRef = useRef<number | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const exp = tokenExpiryMs(getAccessToken());
    setTokenExpiresAt(exp);
    if (!exp) return;
    const delay = Math.max(5_000, exp - Date.now() - config.tokenRefreshSkewMs);
    timerRef.current = window.setTimeout(async () => {
      try {
        const s = await kioskRefresh();
        setDevice(s.device);
        scheduleRefresh();
      } catch {
        // The reactive 401 interceptor will get another chance on the next
        // real API call; if the cookie is truly dead, onExpired fires there.
        scheduleRefresh();
      }
    }, delay);
  }, []);

  const applySession = useCallback(
    (dev: DeviceInfo, tenantCode?: string) => {
      setDevice(dev);
      const prior = loadIdentity();
      const merged: DeviceIdentity = {
        id: dev.id,
        deviceName: dev.deviceName,
        tenantId: dev.tenantId,
        tenantCode: tenantCode ?? prior?.tenantCode ?? '',
      };
      saveIdentity(merged);
      setIdentity(merged);
      setStatus('registered');
      scheduleRefresh();
    },
    [scheduleRefresh],
  );

  // Register axios session handlers ONCE.
  useEffect(() => {
    setSessionHandlers({
      onRefreshed: (s) => {
        const dev = (s as { device: DeviceInfo }).device;
        if (dev) setDevice(dev);
        setTokenExpiresAt(tokenExpiryMs(getAccessToken()));
      },
      onExpired: () => {
        setAccessToken(null);
        setStatus('unregistered');
        setTokenExpiresAt(null);
        if (timerRef.current) window.clearTimeout(timerRef.current);
      },
    });
  }, []);

  // Cold-start bootstrap.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await kioskRefresh();
        if (cancelled) return;
        applySession(s.device);
      } catch {
        if (cancelled) return;
        setStatus('unregistered');
      }
    })();
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [applySession]);

  const login = useCallback(
    async (tenantCode: string, deviceName: string, deviceKey: string) => {
      setLoggingIn(true);
      setError(null);
      try {
        const s = await kioskLogin(tenantCode.trim(), deviceName.trim(), deviceKey);
        applySession(s.device, tenantCode.trim());
      } catch (err) {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not pair this device. Check the company code, device name and device key.';
        setError(msg);
        throw err;
      } finally {
        setLoggingIn(false);
      }
    },
    [applySession],
  );

  return { status, device, identity, tokenExpiresAt, error, loggingIn, login };
}

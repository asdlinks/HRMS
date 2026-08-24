import { useState, type FormEvent } from 'react';
import type { DeviceIdentity } from '../types';

// The screen shown when no device session can be resumed. It pairs the device
// once with the one-time deviceKey HR generated in the HRMS admin UI. This is
// the ONLY form in the whole app — there is deliberately no employee login.
export function RegistrationScreen({
  identity,
  error,
  loggingIn,
  onRegister,
}: {
  identity: DeviceIdentity | null;
  error: string | null;
  loggingIn: boolean;
  onRegister: (tenantCode: string, deviceName: string, deviceKey: string) => void;
}) {
  const [tenantCode, setTenantCode] = useState(identity?.tenantCode ?? '');
  const [deviceName, setDeviceName] = useState(identity?.deviceName ?? '');
  const [deviceKey, setDeviceKey] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!tenantCode.trim() || !deviceName.trim() || !deviceKey.trim()) return;
    onRegister(tenantCode, deviceName, deviceKey);
  };

  return (
    <div className="screen registration">
      <form className="reg-card" onSubmit={submit}>
        <h1>Device Registration</h1>
        <p className="reg-sub">
          Pair this kiosk with your company. Your HR administrator creates the device in the HRMS
          &ldquo;Kiosk Devices&rdquo; page and shows a one-time <strong>device key</strong> &mdash; enter it once below.
        </p>

        {identity && (
          <div className="reg-known">
            Previously registered as <strong>{identity.deviceName}</strong>
            {identity.tenantCode ? ` (${identity.tenantCode})` : ''}. Re-enter the device key to re-pair.
          </div>
        )}

        <label>
          Company code
          <input value={tenantCode} onChange={(e) => setTenantCode(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        <label>
          Device name
          <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        <label>
          Device key
          <input
            type="password"
            value={deviceKey}
            onChange={(e) => setDeviceKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="One-time key from HR"
          />
        </label>

        {error && <div className="reg-error">{error}</div>}

        <button type="submit" disabled={loggingIn}>
          {loggingIn ? 'Pairing…' : 'Pair device'}
        </button>
        <p className="reg-note">The device key is never stored on this device — only the resulting secure session is kept.</p>
      </form>
    </div>
  );
}

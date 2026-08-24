// Decode a JWT's `exp` (seconds since epoch) into an ms timestamp WITHOUT
// verifying the signature — we only need it to schedule a proactive refresh and
// to show a countdown on the diagnostics screen. The server is the sole
// authority on validity.
export function tokenExpiryMs(token: string | null): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Decodes a JWT's payload segment WITHOUT verifying its signature — no
 * server-side signing secret is needed or embedded here. A JWT's payload is
 * base64url-encoded, not encrypted, so this is a structural read only (used
 * by PA-PM-04 to confirm a platform-admin token's claim shape), never a
 * substitute for real signature verification.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error(`Not a JWT (expected 3 dot-separated parts, got ${parts.length}).`);
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
}

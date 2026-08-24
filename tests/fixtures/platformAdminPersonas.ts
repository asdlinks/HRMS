import fs from 'fs';

/**
 * Platform Admin's four dedicated, disposable accounts — an entirely
 * separate principal type from the tenant PersonaKey in ./personas.ts (see
 * that file's own doc comment; this one deliberately does not extend or
 * import it). Every platform admin is equally privileged (PA-PM-03 — no
 * internal permission tiers), so these four exist to isolate *risk*
 * (lockout, password mutation, forced-inactive), not permission scope — see
 * e2e/.env.e2e.example for what each one is used for and why it's separate.
 */
export type PlatformAdminPersonaKey =
  | 'platformAdmin'
  | 'platformAdminLockout'
  | 'platformAdminInactive'
  | 'platformAdminChangePassword';

export interface PlatformAdminPersonaCreds {
  email: string;
  password: string;
}

function readPersona(envPrefix: string): PlatformAdminPersonaCreds | null {
  const email = process.env[`${envPrefix}_EMAIL`];
  const password = process.env[`${envPrefix}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password };
}

/**
 * Every persona is optional. A persona left unconfigured in e2e/.env.e2e
 * (see e2e/.env.e2e.example) makes every spec that depends on it skip with
 * an explanatory message, rather than fail — same convention as the tenant
 * suite's PERSONAS (fixtures/personas.ts).
 */
export const PLATFORM_ADMIN_PERSONAS: Record<PlatformAdminPersonaKey, PlatformAdminPersonaCreds | null> = {
  platformAdmin: readPersona('E2E_PLATFORM_ADMIN'),
  platformAdminLockout: readPersona('E2E_PLATFORM_ADMIN_LOCKOUT'),
  platformAdminInactive: readPersona('E2E_PLATFORM_ADMIN_INACTIVE'),
  platformAdminChangePassword: readPersona('E2E_PLATFORM_ADMIN_CHANGE_PASSWORD'),
};

/** Written by PlatformAdminAuthenticationManager from the login response body. */
export function platformAdminPersonaUserFile(persona: PlatformAdminPersonaKey): string {
  return `e2e/.auth/${persona}.user.json`;
}

export interface PlatformAdminPersonaUserInfo {
  id: number;
  name: string;
  email: string;
}

export function readPlatformAdminPersonaUser(persona: PlatformAdminPersonaKey): PlatformAdminPersonaUserInfo | null {
  const file = platformAdminPersonaUserFile(persona);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

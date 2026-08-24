import fs from 'fs';

export type PersonaKey = 'admin' | 'manager' | 'hrDirectory' | 'usersManageOnly' | 'employeeSelf';

export interface PersonaCreds {
  email: string;
  password: string;
}

function readPersona(envPrefix: string): PersonaCreds | null {
  const email = process.env[`${envPrefix}_EMAIL`];
  const password = process.env[`${envPrefix}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password };
}

export const TENANT_CODE = process.env.E2E_TENANT_CODE || '';

/**
 * Every persona is optional. A persona left unconfigured in e2e/.env.e2e
 * (see e2e/.env.e2e.example) makes every spec that depends on it skip with
 * an explanatory message, rather than fail — see authFixture in fixtures/auth.ts.
 */
export const PERSONAS: Record<PersonaKey, PersonaCreds | null> = {
  admin: readPersona('E2E_ADMIN'),
  manager: readPersona('E2E_MANAGER'),
  hrDirectory: readPersona('E2E_HR_DIRECTORY'),
  usersManageOnly: readPersona('E2E_USERS_MANAGE_ONLY'),
  employeeSelf: readPersona('E2E_EMPLOYEE_SELF'),
};

/** Name (not credentials) of a pre-locked employee — see e2e/.env.e2e.example. */
export const LOCKED_ACCOUNT_NAME = process.env.E2E_LOCKED_ACCOUNT_NAME || null;

/** Written by fixtures/auth.ts from the POST /api/auth/login response body. */
export function personaUserFile(persona: PersonaKey): string {
  return `.auth/${persona}.user.json`;
}

export interface PersonaUserInfo {
  id: number;
  name: string;
  email: string;
}

export function readPersonaUser(persona: PersonaKey): PersonaUserInfo | null {
  const file = personaUserFile(persona);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

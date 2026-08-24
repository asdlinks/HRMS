/**
 * Data-driven fixtures for the RBAC & Roles suite — mirrors attendance-data.ts's/
 * leave-data.ts's uniqueX() pattern, kept in its own file per
 * FRAMEWORK_GUIDELINES.md (a new module's own generators don't belong bolted
 * onto test-data.ts, which is Employee Master-specific despite its name).
 */
import { uniqueSuffix } from './test-data';

export function uniqueRoleName(prefix = 'E2E Role'): string {
  return `${prefix} ${uniqueSuffix()}`;
}

// RB-BD-01 — roles.name is NVARCHAR(100); at-limit accepted, over-limit
// rejected/truncated depending on DB behavior (see roles.repository.js's
// createRole, which passes the raw value through with no app-side length
// check of its own before the DB column boundary).
export const ROLE_NAME_LENGTH_BOUNDARY = [
  { value: 'A'.repeat(100), shouldPass: true, label: '100 characters (at the NVARCHAR limit)' },
  { value: 'A'.repeat(101), shouldPass: false, label: '101 characters (one over the limit)' },
];

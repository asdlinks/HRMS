import { uniqueSuffix } from './test-data';

/**
 * Company Provisioning test data — every generator is built on
 * `uniqueSuffix()` per this suite's own uniqueness convention (see
 * FRAMEWORK_GUIDELINES.md's "Random data generation"). Provisioning creates
 * a real, permanent tenant with no delete API, so this phase deliberately
 * creates as few as possible — see platform-admin-company-provisioning.spec.ts's
 * own header comment for exactly which tests create one.
 */

/** Confirmed live (Phase 3/4 discovery) — "Starter" is the smallest, cheapest
 * active plan (max_employees: 10, storage_limit_mb: 1024), the least
 * resource-shaped choice for a disposable test tenant. */
export const STARTER_PLAN_ID = 1;

/** Confirmed live (Phase 3 discovery) — "Startup Test" (id 4) is seeded
 * is_active=false and never appears in the Create Company UI's own dropdown
 * (which fetches `listSubscriptionPlans(true)`, active-only) — used only for
 * PA-NG-11's raw-API "inactive plan" case. */
export const INACTIVE_PLAN_ID = 4;

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/** A collision-safe slug, well within the 2-50 char valid range. */
export function uniqueSlug(prefix = 'pa-prov'): string {
  return `${prefix}-${digitsOnly(uniqueSuffix())}`.toLowerCase().slice(0, 50);
}

/** A slug of exactly `length` characters (2-50), still matching
 * `^[a-z0-9][a-z0-9-]{1,49}$` — pads with 'a' if the unique base is shorter
 * than requested. */
export function slugOfExactLength(length: number): string {
  const base = `pa${digitsOnly(uniqueSuffix())}`;
  if (base.length >= length) return base.slice(0, length);
  return base + 'a'.repeat(length - base.length);
}

/** A company name of exactly `length` characters — pads with 'A' if the
 * unique base is shorter than requested. */
export function nameOfExactLength(length: number): string {
  const base = `PA Provisioning Test ${uniqueSuffix()} `;
  if (base.length >= length) return base.slice(0, length);
  return base + 'A'.repeat(length - base.length);
}

export function uniqueCompanyName(): string {
  return `PA Provisioning ${uniqueSuffix()}`;
}

export function uniqueAdminEmail(): string {
  return `pa.prov.admin.${uniqueSuffix()}@example.test`;
}

export interface CreateCompanyPayload {
  name: string;
  slug: string;
  phone: string;
  adminName: string;
  adminEmail: string;
  subscription_plan_id: number;
  roleTemplate?: 'simple' | 'enterprise';
  status?: 'trial' | 'active';
  billing_email?: string;
  timezone?: string;
}

/** A minimal, always-schema-valid payload — every field can be overridden to
 * probe one specific validation rule while leaving the rest valid. */
export function validCreateCompanyPayload(overrides: Partial<CreateCompanyPayload> = {}): CreateCompanyPayload {
  return {
    name: uniqueCompanyName(),
    slug: uniqueSlug(),
    phone: '9990001234',
    adminName: 'PA Provisioning Admin',
    adminEmail: uniqueAdminEmail(),
    subscription_plan_id: STARTER_PLAN_ID,
    ...overrides,
  };
}

import { uniqueSuffix } from './test-data';

/**
 * Subscription Plan CRUD (Phase 6) test data. There is no DELETE endpoint
 * (`server/repositories/subscriptionPlans.repository.js`'s own comment:
 * "No delete — tenants may already reference a plan; soft-disable via
 * is_active instead") — same "real, permanent, undeletable resource" shape
 * as Phase 3's company provisioning, so every generator here is built on
 * `uniqueSuffix()` and this phase creates as few plans as possible (see
 * platform-admin-subscription-plans.spec.ts's own header for exactly which
 * tests create one).
 *
 * A live inventory check ahead of writing these tests
 * (GET /api/platform-admin/subscription-plans +
 * GET /api/platform-admin/companies) found exactly 4 real, pre-existing
 * plans, all already relied on elsewhere in this suite — none touched by
 * this phase:
 *   - id 1 "Starter" (active, enabled_modules [], in use by 8 tenants) —
 *     STARTER_PLAN_ID in fixtures/platformAdminProvisioningData.ts.
 *   - id 2 "Professional" (active, [payroll,reports], in use by 1 tenant —
 *     company 14 "spot", Phase 5's TRIAL_COMPANY_ID) —
 *     PROFESSIONAL_PLAN_ID in fixtures/platformAdminCompanyLifecycleData.ts.
 *   - id 3 "Enterprise" (active, all 5 gateable modules, in use by 5
 *     tenants) — ENTERPRISE_PLAN_ID in the same file.
 *   - id 4 "Startup Test" (is_active=false, unused by any tenant) —
 *     INACTIVE_PLAN_ID in fixtures/platformAdminProvisioningData.ts, relied
 *     on by both Phase 3 and Phase 5's own negative tests as a stable
 *     "known inactive plan" fixture — never renamed/reactivated here.
 */

// server/utils/planModules.js's GATEABLE_MODULES — duplicated (not
// imported, same reason helpers/platformAdmin.ts duplicates the
// refresh-cookie constants: this is a Node/Express file, not reachable from
// the Playwright TS project).
export const GATEABLE_MODULES = ['payroll', 'reports', 'recruitment', 'performance', 'assets'];

export function uniquePlanName(prefix = 'PA Plan'): string {
  return `${prefix} ${uniqueSuffix()}`;
}

/** A plan name of exactly `length` characters (subscriptionPlanSchema's
 * `name: z.string().min(1).max(100)`) — pads with 'A' if the unique base is
 * shorter than requested. */
export function planNameOfExactLength(length: number): string {
  const base = `PA Plan ${uniqueSuffix()} `;
  if (base.length >= length) return base.slice(0, length);
  return base + 'A'.repeat(length - base.length);
}

export interface CreatePlanPayload {
  name: string;
  max_employees?: number | null;
  storage_limit_mb?: number | null;
  support_level?: string | null;
  trial_days?: number | null;
  enabled_modules?: string[];
  monthly_price?: number | null;
  annual_price?: number | null;
  is_active?: boolean;
}

/** A minimal, always-schema-valid payload — every field can be overridden
 * to probe one specific validation rule while leaving the rest valid. */
export function validCreatePlanPayload(overrides: Partial<CreatePlanPayload> = {}): CreatePlanPayload {
  return {
    name: uniquePlanName(),
    max_employees: 15,
    storage_limit_mb: 2048,
    support_level: 'Basic',
    trial_days: 14,
    enabled_modules: ['payroll'],
    monthly_price: null,
    annual_price: null,
    is_active: true,
    ...overrides,
  };
}

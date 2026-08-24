import { INACTIVE_PLAN_ID, STARTER_PLAN_ID } from './platformAdminProvisioningData';

/**
 * Company Management (Lifecycle Mutations, Phase 5) test data — mirrors
 * platformAdminProvisioningData.ts's "confirmed live" convention rather than
 * inventing new plan ids: STARTER_PLAN_ID/INACTIVE_PLAN_ID are re-exported
 * from that file (single source of truth), PROFESSIONAL_PLAN_ID/
 * ENTERPRISE_PLAN_ID added here since this phase is the first to need them.
 *
 * A live inventory check ahead of writing these tests (platform-admin
 * /companies + /subscription-plans, read via the real API) found:
 *   - id 1 "Starter" / id 2 "Professional" / id 3 "Enterprise" — all
 *     is_active=true, enabled_modules [] / [payroll,reports] /
 *     [payroll,reports,recruitment,performance,assets] respectively.
 *   - id 4 "Startup Test" — is_active=false, already established as
 *     INACTIVE_PLAN_ID by Phase 3's provisioning tests.
 */
export { STARTER_PLAN_ID, INACTIVE_PLAN_ID };
export const PROFESSIONAL_PLAN_ID = 2;
export const ENTERPRISE_PLAN_ID = 3;

/**
 * Real, pre-existing companies this phase mutates — chosen from the same
 * live inventory check to avoid provisioning anything new (task constraint:
 * "Do NOT provision new companies unless absolutely required").
 *
 * TRIAL_COMPANY_ID (14, "spot"/Spotit) already carries this exact role in
 * platform-admin-companies-list-detail.spec.ts (frozen, read-only there) —
 * reused here for its natural trial-status starting point, which several
 * CSV rows (PA-FN-10/12) require. Status/plan snapshotted and restored by
 * every test that mutates it (see the spec file's own try/finally blocks).
 *
 * ACTIVE_SPARE_COMPANY_ID (19, "mywetech-demo") is a real, active,
 * Enterprise-plan company NOT referenced by any other frozen spec file —
 * confirmed via a full-suite grep ahead of writing these tests — chosen
 * specifically so this phase's suspend/reactivate cycle (which needs a
 * genuinely ACTIVE starting company, unlike id 14's trial or id 15's
 * already-suspended state) can't collide with another module's fixture.
 *
 * NO_ADMIN_COMPANY_ID (3, "mywe"/Mywe Technologies) has a real, live
 * primary_admin_user_id of NULL (confirmed via the same inventory check) —
 * an already-existing natural fit for PA-NG-12 (reset-admin-password on a
 * company with no linked administrator), needing no setup at all. Read-only
 * here: the row this test hits 404s before any write occurs.
 */
export const TRIAL_COMPANY_ID = 14;
export const TRIAL_COMPANY_SLUG = 'spot';
export const TRIAL_COMPANY_ORIGINAL_PLAN_ID = PROFESSIONAL_PLAN_ID;

export const ACTIVE_SPARE_COMPANY_ID = 19;
export const ACTIVE_SPARE_COMPANY_SLUG = 'mywetech-demo';

export const NO_ADMIN_COMPANY_ID = 3;

/** A company id guaranteed never to exist — same convention as Phase 3/4's
 * 999999 (see platform-admin-companies-list-detail.spec.ts's PA-NG-09). */
export const NONEXISTENT_COMPANY_ID = 999999;

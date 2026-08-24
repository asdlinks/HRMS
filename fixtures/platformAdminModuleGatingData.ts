import { uniqueEmployee, uniqueSuffix } from './test-data';

/**
 * Employee Limit & Module Gating (Phase 7) test data.
 *
 * A live inventory check ahead of writing these tests found company id 20
 * "golden-lotus-demo" (Enterprise plan, 13 employees, primary_admin_user_id
 * 1083) is real, pre-existing, and NOT depended on for an exact employee
 * count or subscription plan by any frozen spec — Phase 3/4's
 * `platform-admin-companies-list-detail.spec.ts` only asserts
 * `typeof body.employeeCount === 'number'` for it, never a value, and its
 * `PA-FN-07` profile check only asserts `subscription_plan_name: 'Enterprise'`,
 * which this phase's own try/finally restores. Reused rather than
 * provisioning a new company — this phase is the first to actually mutate
 * its plan/employee count (Phase 3/4 only ever read it).
 */
export const GATED_COMPANY_ID = 20;
export const GATED_COMPANY_SLUG = 'golden-lotus-demo';

export function uniqueGatingPlanName(): string {
  return `PA Gating Plan ${uniqueSuffix()}`;
}

/** Builds a schema-valid POST /api/users body (userCreateSchema) from
 * fixtures/test-data.ts's own `uniqueEmployee()` — reused rather than a
 * second name/email generator, per FRAMEWORK_GUIDELINES.md's
 * `uniqueSuffix()` convention. */
export function rawEmployeePayload(overrides: Partial<{ role: string }> = {}) {
  const emp = uniqueEmployee();
  return {
    name: emp.name,
    email: emp.email,
    password: emp.password,
    role: 'employee',
    employee_id: emp.employeeId,
    joining_date: emp.joiningDate,
    date_of_birth: emp.dateOfBirth,
    ...overrides,
  };
}

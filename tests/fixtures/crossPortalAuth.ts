import { mergeTests } from '@playwright/test';
import { test as tenantTest } from './auth';
import { test as platformAdminTest } from './platformAdminAuth';

/**
 * Cross-Portal Principal Isolation (docs/PlatformAdmin_TestCases.csv's
 * PA-NG-17/18/19, PA-SC-01/02/13, PA-PM-01..04) is the one Platform Admin
 * slice that genuinely needs BOTH a tenant persona (adminPage/
 * employeeSelfPage/...) and a platform-admin persona (platformAdminPage) in
 * the same test — proving a token from one system is rejected by the other.
 * fixtures/auth.ts (tenant) and fixtures/platformAdminAuth.ts (Platform
 * Admin) are both frozen and each deliberately self-contained; this file
 * only combines their fixtures via Playwright's own mergeTests() — it adds
 * no new fixture logic and modifies neither.
 */
export const test = mergeTests(tenantTest, platformAdminTest);
export { expect } from '@playwright/test';

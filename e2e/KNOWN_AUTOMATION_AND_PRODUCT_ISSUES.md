# Known Automation and Product Issues

Tracks open issues surfaced by the Playwright e2e suite: flaky/unstable automation
(our tests) separately from real product defects the tests caught.

## Automation

| ID | Description | Status |
|----|--------------|--------|
| EM-09 | Remaining flaky locator | Open |
| PA-10 | Platform Admin Provisioning: an early "SQL injection in company name" test wrongly assumed injection-shaped strings would fail `createCompanySchema` validation — `name` has no format restriction beyond length, so all 3 payloads succeeded and each created a real, permanent tenant (no delete API). Run twice before being caught via a live company-count check, leaving 6 unplanned tenants (ids 21-23, 27-29 on `dev.mywetechnologies.com`) that cannot be removed. | Fixed (test deleted — see platform-admin-company-provisioning.spec.ts's own corrective-note comment); unplanned tenants themselves are permanent and unremediable |
| PA-11 | Platform Admin Lifecycle Mutations: a single-request "warmup" check for `requireActiveTenant`'s per-tenant status cache (`server/middleware/authorize.js`, 30s TTL — see product defect PA-006) failed with a false 403 when the same spec file was rerun immediately after a prior run's own suspend/reactivate cycle — the prior run's stale 'suspended' cache entry hadn't expired yet even though the DB was already back to 'active'. | Fixed (`platform-admin-company-lifecycle.spec.ts`'s warmup step polls for 200 via `expect.poll`, bounded 40s, instead of asserting a single request) |

## Product

| ID | Description | Root Cause | Owner | Severity |
|----|--------------|------------|-------|----------|
| LV-P0-001 | Leave request fails | `is_half_day` datatype mismatch | Backend | Critical |
| AT-017 | Attendance filter issue | — | — | Medium |

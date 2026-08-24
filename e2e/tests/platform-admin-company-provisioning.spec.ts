/**
 * Platform Admin — Company Provisioning (create). Automates: PA-FN-08,
 * PA-NG-10/11, PA-VD-03/04/05/06/07/08, PA-BD-06/07, PA-UI-06/07/08,
 * PA-AP-07, PA-SC-09/16, plus one authorization check on POST /companies
 * (not previously exercised — Phase 2/3 only hit GET routes with a tenant
 * token).
 *
 * CORRECTIVE NOTE (read before adding a new test to this file): an earlier
 * version of this file also had a "PA-SC-08 (reuse)" test that posted each
 * SQL_INJECTION_PAYLOADS string as the company `name`, on the mistaken
 * assumption those payloads would fail validation. `name` has no format
 * restriction beyond length, so all three succeeded and each created a real,
 * permanent tenant — with no delete API, and having been run twice (once in
 * this phase's first pass, once in an initial repeatability attempt) before
 * being caught via a live company-count check, this created 6 unplanned
 * tenants that cannot be removed. The test has been deleted, not fixed —
 * XSS_PAYLOAD's own creation below (PA-SC-09) already proves the same
 * "no injection reaches an unhandled 500" property for the name field
 * without needing a second, redundant tenant-creating test, and Phase 1's
 * PA-SC-08 already covers the login-field half of this CSV row. Do not
 * re-add a company-name SQL-injection test without first confirming it
 * won't create a tenant (e.g. pair the payload with an already-invalid
 * field so validation rejects it first).
 *
 * IMPORTANT — provisioning creates a real, permanent tenant with NO delete
 * API (see server/services/tenantProvisioning.service.js). Excluding the
 * mistake above (now corrected), this file creates exactly TWO tenants,
 * each carrying multiple CSV rows to avoid any unnecessary creation:
 *   - Tenant A (created via the real UI form): PA-FN-08 (valid creation),
 *     PA-BD-06/PA-BD-07's "accepted" boundary cases (slug at exactly 50
 *     chars, name at exactly 255 chars — folded into this one creation
 *     rather than a separate tenant per boundary), PA-UI-08 (credentials
 *     panel), PA-AP-07 (response contract, captured via page.waitForResponse
 *     on the same submission), and its own provisioning history. Its slug is
 *     then reused (never a second real creation) for PA-NG-10's duplicate-
 *     slug 409 case.
 *   - Tenant B (created via a raw API call): PA-SC-09 (XSS in company
 *     name/adminName) and PA-SC-16 (mass-assignment via extra payload
 *     fields) combined into one creation.
 * Every other row here (VD-*, BD-06/07's REJECT cases, NG-11, UI-06/07, the
 * authorization check) is a validation/auth failure that never reaches the
 * transaction — confirmed zero tenant created for each, either by reading
 * `tenantProvisioning.service.js` (the active-plan check runs BEFORE the
 * transaction opens; schema validation runs before the route handler at all)
 * or, for NG-10/the authorization check, by directly re-checking the
 * company-list total is unchanged after the attempt.
 *
 * "Starter" (id 1, confirmed live in Phase 3/4 discovery — smallest active
 * plan) is used for both real creations, to keep the disposable tenants as
 * minimal/cheap as possible.
 */
import { expect, test } from '../fixtures/crossPortalAuth';
import { PlatformAdminCompanyCreatePage } from '../pages/PlatformAdminCompanyCreatePage';
import { createCompanyRequest } from '../helpers/platformAdminProvisioning';
import { getCompanyRequest, getProvisioningHistoryRequest, listCompaniesRequest } from '../helpers/platformAdminCompanies';
import {
  INACTIVE_PLAN_ID,
  STARTER_PLAN_ID,
  nameOfExactLength,
  slugOfExactLength,
  uniqueAdminEmail,
  uniqueCompanyName,
  uniqueSlug,
  validCreateCompanyPayload,
} from '../fixtures/platformAdminProvisioningData';
import { XSS_PAYLOAD, uniqueSuffix } from '../fixtures/test-data';

test.describe('Platform Admin Provisioning — validation (no tenant created)', () => {
  test('PA-VD-03: an uppercase slug is rejected', async ({ platformAdminPage }) => {
    const res = await createCompanyRequest(platformAdminPage.request, validCreateCompanyPayload({ slug: 'ACME' + uniqueSuffix() }));
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/lowercase letters, numbers and hyphens/i);
  });

  test('PA-VD-04: a slug starting with a hyphen is rejected', async ({ platformAdminPage }) => {
    const res = await createCompanyRequest(platformAdminPage.request, validCreateCompanyPayload({ slug: '-' + uniqueSlug() }));
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/lowercase letters, numbers and hyphens/i);
  });

  test('PA-VD-05: a completely empty body is rejected with per-field errors, including subscription_plan_id', async ({ platformAdminPage }) => {
    const res = await createCompanyRequest(platformAdminPage.request, {});
    expect(res.status()).toBe(400);
    const error = (await res.json()).error as string;
    expect(error).toMatch(/name/i);
    expect(error).toMatch(/subscription_plan_id/i);
  });

  test('PA-VD-06: an invalid adminEmail format is rejected', async ({ platformAdminPage }) => {
    const res = await createCompanyRequest(platformAdminPage.request, validCreateCompanyPayload({ adminEmail: 'not-an-email' }));
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/adminEmail/i);
  });

  test('PA-VD-07: an invalid roleTemplate (not simple/enterprise) is rejected', async ({ platformAdminPage }) => {
    const res = await createCompanyRequest(platformAdminPage.request, validCreateCompanyPayload({ roleTemplate: 'bogus' as never }));
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/roleTemplate/i);
  });

  test('PA-VD-08: an invalid status (not trial/active) is rejected', async ({ platformAdminPage }) => {
    const res = await createCompanyRequest(platformAdminPage.request, validCreateCompanyPayload({ status: 'suspended' as never }));
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/status/i);
  });

  test('PA-BD-06: a slug of 51 characters is rejected (50 is exercised in the successful-creation test below)', async ({ platformAdminPage }) => {
    const res = await createCompanyRequest(platformAdminPage.request, validCreateCompanyPayload({ slug: slugOfExactLength(51) }));
    expect(res.status()).toBe(400);
  });

  test('PA-BD-07: a company name of 256 characters is rejected (255 is exercised in the successful-creation test below)', async ({ platformAdminPage }) => {
    const res = await createCompanyRequest(platformAdminPage.request, validCreateCompanyPayload({ name: nameOfExactLength(256) }));
    expect(res.status()).toBe(400);
  });

  test('PA-NG-11: a missing subscription_plan_id and a known-inactive plan are both rejected', async ({ platformAdminPage }) => {
    const { subscription_plan_id: _omit, ...payloadWithoutPlan } = validCreateCompanyPayload();
    void _omit;
    const missingRes = await createCompanyRequest(platformAdminPage.request, payloadWithoutPlan);
    expect(missingRes.status()).toBe(400);

    const inactiveRes = await createCompanyRequest(platformAdminPage.request, validCreateCompanyPayload({ subscription_plan_id: INACTIVE_PLAN_ID }));
    expect(inactiveRes.status()).toBe(400);
    expect((await inactiveRes.json()).error).toMatch(/select a valid, active subscription plan/i);
  });

  test('Authorization: POST /companies with a tenant token (not a platform-admin one) is rejected, and creates nothing', async ({ adminPage, platformAdminPage }) => {
    const before = await listCompaniesRequest(platformAdminPage.request);
    const totalBefore = (await before.json()).total;

    const res = await adminPage.request.post('/api/platform-admin/companies', { data: validCreateCompanyPayload() });
    expect(res.status()).toBe(401);

    const after = await listCompaniesRequest(platformAdminPage.request);
    expect((await after.json()).total).toBe(totalBefore);
  });
});

test.describe('Platform Admin Provisioning — Create Company form (no tenant created)', () => {
  test('PA-UI-06: submitting the form with every required field empty shows inline validation and blocks submission', async ({ platformAdminPage }) => {
    const create = new PlatformAdminCompanyCreatePage(platformAdminPage);
    await create.goto();
    await create.submit();
    await expect(create.nameError).toBeVisible();
    await expect(create.phoneError).toBeVisible();
    await expect(create.adminNameError).toBeVisible();
  });

  test('PA-UI-07: submitting with every field filled but no subscription plan selected shows a blocking snackbar', async ({ platformAdminPage }) => {
    const create = new PlatformAdminCompanyCreatePage(platformAdminPage);
    await create.goto();
    await create.fillRequired({
      name: uniqueCompanyName(),
      slug: uniqueSlug(),
      phone: '9990001234',
      adminName: 'PA Provisioning Admin',
      adminEmail: uniqueAdminEmail(),
    });
    await create.submit();
    await expect(platformAdminPage.getByText('Select a subscription plan', { exact: true })).toBeVisible();
  });
});

test.describe('Platform Admin Provisioning — successful creation (Tenant A, real permanent tenant)', () => {
  test('PA-FN-08/PA-BD-06/PA-BD-07/PA-UI-08/PA-AP-07: a valid submission via the real form provisions a company, shows one-time credentials, and the API contract is exact', async ({
    platformAdminPage,
  }) => {
    const slug = slugOfExactLength(50);
    const name = nameOfExactLength(255);
    const adminEmail = uniqueAdminEmail();

    const create = new PlatformAdminCompanyCreatePage(platformAdminPage);
    await create.goto();
    await create.fillRequired({ name, slug, phone: '9990001234', adminName: 'PA Provisioning Admin', adminEmail });
    await create.selectPlan('Starter');

    const responsePromise = platformAdminPage.waitForResponse((r) => r.url().endsWith('/api/platform-admin/companies') && r.request().method() === 'POST');
    await create.submit();
    const response = await responsePromise;

    // PA-AP-07 — exact response shape.
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['adminEmail', 'adminUserId', 'generatedPassword', 'tenantId'].sort());
    expect(typeof body.tenantId).toBe('number');
    expect(typeof body.adminUserId).toBe('number');
    expect(body.adminEmail).toBe(adminEmail);
    // generateInitialPassword() (tenantProvisioning.service.js): 12 base64url
    // chars + a fixed '!Aa1' suffix.
    expect(body.generatedPassword).toMatch(/^[\w-]{12}!Aa1$/);

    // PA-UI-08 — one-time credentials panel.
    await expect(create.resultAdminEmail).toHaveText(adminEmail);
    await expect(create.resultPassword).toHaveText(body.generatedPassword);
    await expect(create.copyCredentialsButton).toBeVisible();
    await expect(platformAdminPage.getByText(/cannot be retrieved again/i)).toBeVisible();

    // Provisioning history for the new tenant — directly related to this
    // creation, not a re-test of Phase 3's already-covered read path.
    const historyRes = await getProvisioningHistoryRequest(platformAdminPage.request, body.tenantId);
    const history = await historyRes.json();
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('success');
    expect(history[0].steps.some((s: { step: string }) => s.step === 'create_tenant')).toBe(true);
    expect(history[0].steps.some((s: { step: string }) => s.step === 'create_admin_user')).toBe(true);
    expect(history[0].steps.every((s: { status: string }) => s.status === 'success')).toBe(true);

    // PA-NG-10 — reuses Tenant A's OWN slug, never creates a second tenant.
    const totalBefore = (await (await listCompaniesRequest(platformAdminPage.request)).json()).total;
    const dupRes = await createCompanyRequest(platformAdminPage.request, validCreateCompanyPayload({ slug, subscription_plan_id: STARTER_PLAN_ID }));
    expect(dupRes.status()).toBe(409);
    expect((await dupRes.json()).error).toMatch(/a company with this code \(slug\) already exists/i);
    const totalAfter = (await (await listCompaniesRequest(platformAdminPage.request)).json()).total;
    expect(totalAfter).toBe(totalBefore); // no partial/orphaned tenant left behind by the failed duplicate attempt
  });
});

test.describe('Platform Admin Provisioning — security (Tenant B, real permanent tenant)', () => {
  test('PA-SC-09/PA-SC-16: an XSS payload in name/adminName is stored and rendered safely, and mass-assignment extra fields are ignored', async ({
    platformAdminPage,
  }) => {
    const payload = validCreateCompanyPayload({
      name: `XSS Test ${XSS_PAYLOAD} ${uniqueSuffix()}`,
      adminName: `XSS Admin ${XSS_PAYLOAD}`,
      // PA-SC-16 — none of these should have any effect: createCompanySchema
      // is a plain (non-.passthrough()) zod object, so zod's own safeParse
      // silently strips unrecognized keys before the route ever sees them.
      is_active: false,
      id: 999999,
      primary_admin_user_id: 1,
    } as never);

    const res = await createCompanyRequest(platformAdminPage.request, payload);
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.tenantId).not.toBe(999999);

    // Confirms primary_admin_user_id actually links to the REAL admin user
    // this call created, not the injected value 1.
    const companyRes = await getCompanyRequest(platformAdminPage.request, body.tenantId);
    const company = await companyRes.json();
    expect(company.primary_admin_user_id).toBe(body.adminUserId);
    expect(company.primary_admin_user_id).not.toBe(1);
    expect(company.status).not.toBe(false);

    // Renders as literal, escaped text — never executes.
    await platformAdminPage.addInitScript(() => {
      (window as unknown as { __xssFired?: boolean }).__xssFired = false;
    });
    await platformAdminPage.goto(`/platform-admin/companies/${body.tenantId}`);
    const fired = await platformAdminPage.evaluate(() => (window as unknown as { __xssFired?: boolean }).__xssFired);
    expect(fired).toBeFalsy();
    await expect(platformAdminPage.getByLabel('Company Name')).toHaveValue(payload.name);
  });
});

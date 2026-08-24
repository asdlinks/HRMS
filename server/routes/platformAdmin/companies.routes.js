const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const companiesRepo = require('../../repositories/platformCompanies.repository');
const provisioningRepo = require('../../repositories/provisioning.repository');
const authRepo = require('../../repositories/auth.repository');
const tenantHealthRepo = require('../../repositories/platformTenantHealth.repository');
const subscriptionPlansRepo = require('../../repositories/subscriptionPlans.repository');
const tenantProvisioning = require('../../services/tenantProvisioning.service');
const { isUniqueViolation } = require('../../db/sql');
const { HttpError } = require('../../middleware/errorHandler');
const { validateBody } = require('../../middleware/validate');
const {
    createCompanySchema, companyProfileUpdateSchema, platformSetStatusSchema, subscriptionAssignSchema,
} = require('../../schemas');

const router = express.Router();

// GET /api/platform-admin/companies?search=&status=&page=&pageSize=
router.get('/', async (req, res) => {
    const { search, status, page, pageSize } = req.query;
    const result = await companiesRepo.listCompanies({
        search: search || undefined,
        status: status || undefined,
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
    res.json(result);
});

router.get('/:id', async (req, res) => {
    const company = await companiesRepo.getCompanyById(req.params.id);
    if (!company) throw new HttpError(404, 'Company not found');
    res.json(company);
});

// POST /api/platform-admin/companies — creates + provisions a new company in
// one transactional service call. Returns the generated admin credentials
// exactly once; they are never retrievable again after this response.
router.post('/', validateBody(createCompanySchema), async (req, res) => {
    try {
        const result = await tenantProvisioning.provisionCompany(req.body, req.platformAdmin.id);
        res.status(201).json(result);
    } catch (err) {
        if (isUniqueViolation(err)) {
            throw new HttpError(409, 'A company with this code (slug) already exists');
        }
        throw err;
    }
});

router.put('/:id', validateBody(companyProfileUpdateSchema), async (req, res) => {
    const company = await companiesRepo.getCompanyById(req.params.id);
    if (!company) throw new HttpError(404, 'Company not found');
    await companiesRepo.updateCompany(req.params.id, req.body);
    res.json(await companiesRepo.getCompanyById(req.params.id));
});

router.post('/:id/activate', async (req, res) => {
    const company = await companiesRepo.getCompanyById(req.params.id);
    if (!company) throw new HttpError(404, 'Company not found');
    await companiesRepo.setStatus(req.params.id, 'active');
    res.json(await companiesRepo.getCompanyById(req.params.id));
});

router.post('/:id/suspend', async (req, res) => {
    const company = await companiesRepo.getCompanyById(req.params.id);
    if (!company) throw new HttpError(404, 'Company not found');
    await companiesRepo.setStatus(req.params.id, 'suspended');
    res.json(await companiesRepo.getCompanyById(req.params.id));
});

// Also allows an arbitrary status transition (e.g. back to 'trial' or
// 'cancelled') for completeness, beyond the two dedicated shortcuts above.
router.post('/:id/status', validateBody(platformSetStatusSchema), async (req, res) => {
    const company = await companiesRepo.getCompanyById(req.params.id);
    if (!company) throw new HttpError(404, 'Company not found');
    await companiesRepo.setStatus(req.params.id, req.body.status);
    res.json(await companiesRepo.getCompanyById(req.params.id));
});

// POST /api/platform-admin/companies/:id/reset-admin-password — generates a
// fresh one-time password for that tenant's primary HR Administrator,
// returned once, and kills every existing HRMS session for that user so the
// old password can no longer be used to stay logged in.
router.post('/:id/reset-admin-password', async (req, res) => {
    const admin = await companiesRepo.getPrimaryAdmin(req.params.id);
    if (!admin) throw new HttpError(404, 'This company has no linked administrator to reset');

    const newPassword = `${crypto.randomBytes(9).toString('base64url')}!Aa1`;
    const hash = await bcrypt.hash(newPassword, 10);
    await authRepo.updateUserPassword(admin.id, hash);
    await authRepo.revokeAllUserRefreshTokens(admin.id);

    res.json({ adminEmail: admin.email, newPassword });
});

// PUT /api/platform-admin/companies/:id/subscription — assigns a Subscription
// Plan (Phase 13E, Part 8). Deliberately separate from PUT /:id
// (companyProfileUpdateSchema), which a tenant's own Organization
// Administrator can also reach in-app — a tenant must never reassign its
// own plan.
router.put('/:id/subscription', validateBody(subscriptionAssignSchema), async (req, res) => {
    const company = await companiesRepo.getCompanyById(req.params.id);
    if (!company) throw new HttpError(404, 'Company not found');
    const plan = await subscriptionPlansRepo.getPlan(req.body.subscription_plan_id);
    if (!plan || !plan.is_active) throw new HttpError(400, 'Select a valid, active subscription plan');
    await companiesRepo.assignSubscriptionPlan(req.params.id, req.body.subscription_plan_id, plan.enabled_modules);
    res.json(await companiesRepo.getCompanyById(req.params.id));
});

// GET /api/platform-admin/companies/:id/health — Tenant Health (Part 4):
// onboarding checklist + completion %, counts/booleans only.
router.get('/:id/health', async (req, res) => {
    const company = await companiesRepo.getCompanyById(req.params.id);
    if (!company) throw new HttpError(404, 'Company not found');
    res.json(await tenantHealthRepo.getTenantHealth(req.params.id));
});

// GET /api/platform-admin/companies/:id/usage — Usage Summary (Part 5):
// business-level metrics only, never attendance/leave/payroll record content.
// storageLimitMb (Phase 13E, Part 10) rides along so the client can show
// usage against the plan's limit without a second round trip.
router.get('/:id/usage', async (req, res) => {
    const company = await companiesRepo.getCompanyById(req.params.id);
    if (!company) throw new HttpError(404, 'Company not found');
    const usage = await tenantHealthRepo.getTenantUsage(req.params.id);
    res.json({ ...usage, storageLimitMb: company.storage_limit_mb ?? null });
});

router.get('/:id/provisioning-history', async (req, res) => {
    const company = await companiesRepo.getCompanyById(req.params.id);
    if (!company) throw new HttpError(404, 'Company not found');
    const logs = await provisioningRepo.listProvisioningLogs(req.params.id);
    res.json(logs.map((l) => ({ ...l, steps: JSON.parse(l.steps) })));
});

module.exports = router;

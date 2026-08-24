const express = require('express');
const companyRepo = require('../repositories/company.repository');
const { requirePermission, requireAnyPermission } = require('../middleware/authorize');
const { validateBody } = require('../middleware/validate');
const { companyProfileUpdateSchema } = require('../schemas');

const router = express.Router();

router.get('/', requireAnyPermission(['company.view', 'company.manage']), async (req, res) => {
    res.json(await companyRepo.getCompanyProfile(req.auth.tenantId));
});

router.put('/', requirePermission('company.manage'), validateBody(companyProfileUpdateSchema), async (req, res) => {
    await companyRepo.updateCompanyProfile(req.auth.tenantId, req.body);
    res.json({ success: true });
});

module.exports = router;

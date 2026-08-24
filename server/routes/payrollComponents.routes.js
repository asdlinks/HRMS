const express = require('express');
const componentsRepo = require('../repositories/payrollComponents.repository');
const { requirePermission, requireAnyPermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { payrollComponentSchema } = require('../schemas');
const { isUniqueViolation } = require('../db/sql');

const router = express.Router();

// Also readable by whoever builds structures (they need the catalogue for
// the component picker) — editing still requires payroll.components.manage.
router.get('/', requireAnyPermission(['payroll.components.manage', 'payroll.structures.manage']), async (req, res) => {
    const rows = await componentsRepo.listComponents(req.auth.tenantId, { activeOnly: req.query.activeOnly === 'true' });
    res.json(rows);
});

router.post('/', requirePermission('payroll.components.manage'), validateBody(payrollComponentSchema), async (req, res) => {
    try {
        const id = await componentsRepo.createComponent(req.auth.tenantId, req.body);
        res.json({ id });
    } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(409, `A component with code "${req.body.code}" already exists`);
        throw err;
    }
});

router.patch('/:id', requirePermission('payroll.components.manage'), validateBody(payrollComponentSchema), async (req, res) => {
    const existing = await componentsRepo.getComponent(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Component not found');
    try {
        await componentsRepo.updateComponent(req.auth.tenantId, req.params.id, req.body);
        res.json({ success: true });
    } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(409, `A component with code "${req.body.code}" already exists`);
        throw err;
    }
});

router.delete('/:id', requirePermission('payroll.components.manage'), async (req, res) => {
    const existing = await componentsRepo.getComponent(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Component not found');

    const referenced = await componentsRepo.isComponentReferenced(req.auth.tenantId, req.params.id);
    if (referenced) {
        await componentsRepo.deactivateComponent(req.auth.tenantId, req.params.id);
        return res.json({ success: true, deactivated: true });
    }
    await componentsRepo.deleteComponent(req.auth.tenantId, req.params.id);
    res.json({ success: true, deactivated: false });
});

module.exports = router;

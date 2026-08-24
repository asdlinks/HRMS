const express = require('express');
const structuresRepo = require('../repositories/payrollStructures.repository');
const { requirePermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { payrollStructureSchema, structureComponentsReplaceSchema } = require('../schemas');
const { isUniqueViolation } = require('../db/sql');

const router = express.Router();

router.get('/', requirePermission('payroll.structures.manage'), async (req, res) => {
    res.json(await structuresRepo.listStructures(req.auth.tenantId));
});

router.post('/', requirePermission('payroll.structures.manage'), validateBody(payrollStructureSchema), async (req, res) => {
    try {
        const id = await structuresRepo.createStructure(req.auth.tenantId, req.body);
        res.json({ id });
    } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(409, `A structure named "${req.body.name}" already exists`);
        throw err;
    }
});

router.patch('/:id', requirePermission('payroll.structures.manage'), validateBody(payrollStructureSchema), async (req, res) => {
    const existing = await structuresRepo.getStructure(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Structure not found');
    await structuresRepo.updateStructure(req.auth.tenantId, req.params.id, req.body);
    res.json({ success: true });
});

router.delete('/:id', requirePermission('payroll.structures.manage'), async (req, res) => {
    const existing = await structuresRepo.getStructure(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Structure not found');
    const referenced = await structuresRepo.isStructureReferenced(req.auth.tenantId, req.params.id);
    if (referenced) throw new HttpError(409, 'This structure is assigned to one or more employees and cannot be deleted');
    await structuresRepo.deleteStructure(req.auth.tenantId, req.params.id);
    res.json({ success: true });
});

router.get('/:id/components', requirePermission('payroll.structures.manage'), async (req, res) => {
    res.json(await structuresRepo.listStructureComponents(req.auth.tenantId, req.params.id));
});

router.put('/:id/components', requirePermission('payroll.structures.manage'), validateBody(structureComponentsReplaceSchema), async (req, res) => {
    const existing = await structuresRepo.getStructure(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Structure not found');
    await structuresRepo.setStructureComponents(req.auth.tenantId, req.params.id, req.body.items);
    res.json({ success: true });
});

module.exports = router;

const express = require('express');
const shiftsRepo = require('../repositories/shifts.repository');
const { requirePermission, requireAnyPermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { shiftSchema, shiftAssignmentSchema } = require('../schemas');
const { isUniqueViolation } = require('../db/sql');

const router = express.Router();

router.get('/', requireAnyPermission(['shifts.view', 'shifts.manage']), async (req, res) => {
    res.json(await shiftsRepo.listShifts(req.auth.tenantId));
});

router.post('/', requirePermission('shifts.manage'), validateBody(shiftSchema), async (req, res) => {
    try {
        const id = await shiftsRepo.createShift(req.auth.tenantId, req.body);
        res.json({ id });
    } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(409, `A shift named "${req.body.name}" already exists`);
        throw err;
    }
});

router.patch('/:id', requirePermission('shifts.manage'), validateBody(shiftSchema), async (req, res) => {
    const existing = await shiftsRepo.getShift(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Shift not found');
    await shiftsRepo.updateShift(req.auth.tenantId, req.params.id, req.body);
    res.json({ success: true });
});

router.delete('/:id', requirePermission('shifts.manage'), async (req, res) => {
    const existing = await shiftsRepo.getShift(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Shift not found');
    const referenced = await shiftsRepo.isShiftReferenced(req.auth.tenantId, req.params.id);
    if (referenced) throw new HttpError(409, 'This shift is assigned to one or more employees and cannot be deleted');
    await shiftsRepo.deleteShift(req.auth.tenantId, req.params.id);
    res.json({ success: true });
});

// GET /api/shifts/assignments?userId= — history for one employee.
router.get('/assignments', requireAnyPermission(['shifts.view', 'shifts.manage']), async (req, res) => {
    const { userId } = req.query;
    if (!userId) throw new HttpError(400, 'userId is required');
    res.json(await shiftsRepo.listShiftAssignmentHistory(req.auth.tenantId, userId));
});

router.post('/assignments', requirePermission('shifts.manage'), validateBody(shiftAssignmentSchema), async (req, res) => {
    const id = await shiftsRepo.createShiftAssignment(req.auth.tenantId, req.body, req.auth.userId);
    res.json({ id });
});

module.exports = router;

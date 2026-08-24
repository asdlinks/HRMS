const express = require('express');
const workModesRepo = require('../repositories/workModes.repository');
const { requirePermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { workModeSchema, workModeAssignSchema } = require('../schemas');
const { isUniqueViolation } = require('../db/sql');

const router = express.Router();

// Every authenticated user can read the list (e.g. to populate a work-mode
// picker on the attendance check-in screen); only work-modes.manage can
// create/edit/delete or assign a default.
router.get('/', async (req, res) => {
    res.json(await workModesRepo.listWorkModes(req.auth.tenantId));
});

router.post('/', requirePermission('work-modes.manage'), validateBody(workModeSchema), async (req, res) => {
    try {
        const id = await workModesRepo.createWorkMode(req.auth.tenantId, req.body);
        res.json({ id });
    } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(409, `A work mode with code "${req.body.code}" already exists`);
        throw err;
    }
});

router.patch('/:id', requirePermission('work-modes.manage'), validateBody(workModeSchema), async (req, res) => {
    const existing = await workModesRepo.getWorkMode(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Work mode not found');
    await workModesRepo.updateWorkMode(req.auth.tenantId, req.params.id, req.body);
    res.json({ success: true });
});

router.delete('/:id', requirePermission('work-modes.manage'), async (req, res) => {
    const existing = await workModesRepo.getWorkMode(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Work mode not found');
    const referenced = await workModesRepo.isWorkModeReferenced(req.auth.tenantId, req.params.id);
    if (referenced) throw new HttpError(409, 'This work mode is in use and cannot be deleted');
    await workModesRepo.deleteWorkMode(req.auth.tenantId, req.params.id);
    res.json({ success: true });
});

// PUT /api/work-modes/assign/:userId — { workModeId } — mirrors
// attendance-policies.routes.js's dedicated assignment-endpoint pattern
// rather than the generic user-update allowlist.
router.put('/assign/:userId', requirePermission('work-modes.manage'), validateBody(workModeAssignSchema), async (req, res) => {
    await workModesRepo.assignDefaultWorkModeToUser(req.auth.tenantId, req.params.userId, req.body.workModeId);
    res.json({ success: true });
});

module.exports = router;

const express = require('express');
const overtimeRepo = require('../repositories/overtime.repository');
const { requireAnyPermission, requirePermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { overtimeEntrySchema, overtimeStatusSchema } = require('../schemas');
const { isUniqueViolation } = require('../db/sql');

const router = express.Router();

router.get('/', requireAnyPermission(['payroll.overtime.apply', 'payroll.overtime.approve', 'payroll.view.own']), async (req, res) => {
    const { status, userId: filterUserId } = req.query;
    const { permissions, tenantId, userId } = req.auth;
    const scope = permissions.includes('payroll.view.all') ? 'all'
        : permissions.includes('payroll.overtime.approve') ? 'team'
        : 'own';
    const rows = await overtimeRepo.listEntries(tenantId, { scope, requesterId: userId, status, filterUserId });
    res.json(rows);
});

router.post('/', requirePermission('payroll.overtime.apply'), validateBody(overtimeEntrySchema), async (req, res) => {
    try {
        const id = await overtimeRepo.createEntry(req.auth.tenantId, req.body, req.auth.userId);
        res.json({ id });
    } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(409, 'An overtime entry already exists for this employee on this date');
        throw err;
    }
});

router.patch('/:id', requirePermission('payroll.overtime.apply'), validateBody(overtimeEntrySchema), async (req, res) => {
    const result = await overtimeRepo.updateEntry(req.auth.tenantId, req.params.id, req.body);
    if (result.rowsAffected === 0) throw new HttpError(400, 'Entry not found, or no longer editable (already reviewed or claimed by a payroll run)');
    res.json({ success: true });
});

router.patch('/:id/status', requirePermission('payroll.overtime.approve'), validateBody(overtimeStatusSchema), async (req, res) => {
    const entry = await overtimeRepo.getEntry(req.auth.tenantId, req.params.id);
    if (!entry) throw new HttpError(404, 'Overtime entry not found');

    const { permissions, userId } = req.auth;
    if (entry.user_id === userId) {
        throw new HttpError(403, 'You cannot approve or reject your own overtime request');
    }

    const isTeamMember = entry.manager_id === userId;
    if (!permissions.includes('payroll.view.all') && !isTeamMember) {
        throw new HttpError(403, 'You do not have permission to review this entry');
    }

    const result = await overtimeRepo.updateStatus(req.auth.tenantId, req.params.id, req.body.status, userId, req.body.rejection_reason);
    if (result.rowsAffected === 0) throw new HttpError(400, 'Entry is no longer pending');
    res.json({ success: true });
});

module.exports = router;

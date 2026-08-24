const express = require('express');
const assignmentsRepo = require('../repositories/payrollAssignments.repository');
const { requirePermission } = require('../middleware/authorize');
const { validateBody } = require('../middleware/validate');
const { payrollAssignmentSchema } = require('../schemas');

const router = express.Router();

router.get('/', requirePermission('payroll.assign'), async (req, res) => {
    const { userId } = req.query;
    if (userId) return res.json(await assignmentsRepo.listHistory(req.auth.tenantId, userId));
    res.json(await assignmentsRepo.listAllOpen(req.auth.tenantId));
});

router.post('/', requirePermission('payroll.assign'), validateBody(payrollAssignmentSchema), async (req, res) => {
    const id = await assignmentsRepo.createAssignment(req.auth.tenantId, req.body, req.auth.userId);
    res.json({ id });
});

module.exports = router;

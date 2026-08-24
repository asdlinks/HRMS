const express = require('express');
const policiesRepo = require('../repositories/attendancePolicies.repository');
const { requirePermission } = require('../middleware/authorize');
const { validateBody } = require('../middleware/validate');
const { HttpError } = require('../middleware/errorHandler');
const { attendancePolicySchema, policyAssignSchema } = require('../schemas');

const router = express.Router();

router.get('/', requirePermission('attendance.policy.manage'), async (req, res) => {
    res.json(await policiesRepo.listPolicies(req.auth.tenantId));
});

router.post('/', requirePermission('attendance.policy.manage'), validateBody(attendancePolicySchema), async (req, res) => {
    const id = await policiesRepo.createPolicy(req.auth.tenantId, req.body);
    res.json({ id });
});

router.put('/:id', requirePermission('attendance.policy.manage'), validateBody(attendancePolicySchema), async (req, res) => {
    const rowsAffected = await policiesRepo.updatePolicy(req.auth.tenantId, parseInt(req.params.id, 10), req.body);
    if (!rowsAffected) throw new HttpError(404, 'Attendance policy not found');
    res.json({ success: true });
});

router.delete('/:id', requirePermission('attendance.policy.manage'), async (req, res) => {
    await policiesRepo.deletePolicy(req.auth.tenantId, parseInt(req.params.id, 10));
    res.json({ success: true });
});

// PUT /api/attendance-policies/assign/:userId — { policyId } — assigns (or,
// with policyId: null, clears) which policy an employee is governed by.
router.put('/assign/:userId', requirePermission('attendance.policy.manage'), validateBody(policyAssignSchema), async (req, res) => {
    await policiesRepo.assignPolicyToUser(req.auth.tenantId, parseInt(req.params.userId, 10), req.body.policyId);
    res.json({ success: true });
});

module.exports = router;

const express = require('express');
const payslipsRepo = require('../repositories/payslips.repository');
const runsRepo = require('../repositories/payrollRuns.repository');
const { requireAnyPermission, requirePermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');

const router = express.Router();

const VIEW_PERMS = ['payroll.view.own', 'payroll.view.team', 'payroll.view.all'];

router.get('/', requireAnyPermission(VIEW_PERMS), async (req, res) => {
    const { userId: requestedUserId, year, month } = req.query;
    const { permissions, tenantId, userId } = req.auth;
    const scope = permissions.includes('payroll.view.all') ? 'all' : permissions.includes('payroll.view.team') ? 'team' : 'own';

    const rows = await payslipsRepo.listForTenant(tenantId, {
        scope,
        requesterId: userId,
        filterUserId: requestedUserId,
        year: year ? Number(year) : undefined,
        month: month ? Number(month) : undefined,
    });
    // Only Paid-run payslips are visible to anyone other than the roles that
    // can process/approve payroll — HR may finalize a run before payday.
    const canSeeUnpublished = permissions.includes('payroll.process') || permissions.includes('payroll.approve');
    res.json(canSeeUnpublished ? rows : rows.filter((r) => r.is_published));
});

router.get('/:runLineId', requireAnyPermission(VIEW_PERMS), async (req, res) => {
    const { permissions, tenantId, userId } = req.auth;
    const detail = await payslipsRepo.getDetail(tenantId, req.params.runLineId);
    if (!detail) throw new HttpError(404, 'Payslip not found');

    const isSelf = detail.user_id === userId;
    const isTeam = permissions.includes('payroll.view.team') && detail.manager_id === userId;
    const canManage = permissions.includes('payroll.process') || permissions.includes('payroll.approve');
    const canViewScope = isSelf || isTeam || permissions.includes('payroll.view.all') || canManage;
    if (!canViewScope) throw new HttpError(403, 'You do not have permission to view this payslip');
    if (!detail.is_published && !canManage) throw new HttpError(404, 'Payslip not yet available');

    const components = await runsRepo.getRunLineComponents(tenantId, req.params.runLineId);
    res.json({ ...detail, components });
});

router.post('/:runLineId/publish', requirePermission('payroll.approve'), async (req, res) => {
    await payslipsRepo.publish(req.auth.tenantId, req.params.runLineId, req.auth.userId);
    res.json({ success: true });
});

router.patch('/:runLineId/viewed', requireAnyPermission(VIEW_PERMS), async (req, res) => {
    await payslipsRepo.markViewed(req.auth.tenantId, req.params.runLineId);
    res.json({ success: true });
});

module.exports = router;

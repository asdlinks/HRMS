const express = require('express');
const runsRepo = require('../repositories/payrollRuns.repository');
const payslipsRepo = require('../repositories/payslips.repository');
const payrollCalc = require('../services/payrollCalculation.service');
const payrollExport = require('../services/payrollExport.service');
const { requirePermission, requireAnyPermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { payrollRunCreateSchema } = require('../schemas');
const { isUniqueViolation } = require('../db/sql');

const router = express.Router();

const VIEW_PERMS = ['payroll.process', 'payroll.approve'];

router.get('/', requireAnyPermission(VIEW_PERMS), async (req, res) => {
    res.json(await runsRepo.listRuns(req.auth.tenantId));
});

router.post('/', requirePermission('payroll.process'), validateBody(payrollRunCreateSchema), async (req, res) => {
    const periodYear = Number(req.body.period_year);
    const periodMonth = Number(req.body.period_month);
    if (periodMonth < 1 || periodMonth > 12) throw new HttpError(400, 'period_month must be between 1 and 12');

    const cycleStartDate = `${periodYear}-${String(periodMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(periodYear, periodMonth, 0).getDate();
    const cycleEndDate = `${periodYear}-${String(periodMonth).padStart(2, '0')}-${lastDay}`;

    try {
        const id = await runsRepo.createRun(req.auth.tenantId, { periodYear, periodMonth, cycleStartDate, cycleEndDate }, req.auth.userId);
        res.json({ id });
    } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(409, `A payroll run for ${periodMonth}/${periodYear} already exists`);
        throw err;
    }
});

router.get('/:id', requireAnyPermission(VIEW_PERMS), async (req, res) => {
    const run = await runsRepo.getRun(req.auth.tenantId, req.params.id);
    if (!run) throw new HttpError(404, 'Payroll run not found');
    res.json(run);
});

router.get('/:id/lines', requireAnyPermission(VIEW_PERMS), async (req, res) => {
    const run = await runsRepo.getRun(req.auth.tenantId, req.params.id);
    if (!run) throw new HttpError(404, 'Payroll run not found');
    res.json(await runsRepo.listRunLines(req.auth.tenantId, req.params.id));
});

router.get('/:id/lines/:lineId', requireAnyPermission(VIEW_PERMS), async (req, res) => {
    const line = await runsRepo.getRunLine(req.auth.tenantId, req.params.lineId);
    if (!line || line.run_id !== Number(req.params.id)) throw new HttpError(404, 'Payroll run line not found');
    const components = await runsRepo.getRunLineComponents(req.auth.tenantId, req.params.lineId);
    res.json({ ...line, components });
});

router.post('/:id/process', requirePermission('payroll.process'), async (req, res) => {
    const run = await runsRepo.getRun(req.auth.tenantId, req.params.id);
    if (!run) throw new HttpError(404, 'Payroll run not found');
    if (!['Draft', 'Processing'].includes(run.status)) {
        throw new HttpError(409, `Cannot process a run in "${run.status}" status`);
    }

    const lines = await payrollCalc.computeRunLines(req.auth.tenantId, run);
    await runsRepo.saveComputedLines(req.auth.tenantId, run.id, lines, req.auth.userId);
    res.json({ success: true, employeeCount: lines.length });
});

// Payroll Export (Phase 13D) — gated by payroll.approve, the same
// permission that already controls Approve/Pay on this run; exporting for
// bank hand-off is part of finalizing a paid run, not a separate concern.
// `format` defaults to GENERIC_CSV inside the service — accepted here for
// forward-compatibility even though the UI doesn't expose a picker yet
// (only one format exists; a dropdown with one entry would itself be the
// kind of placeholder UI the product spec says to avoid).
router.get('/:id/export', requirePermission('payroll.approve'), async (req, res) => {
    await payrollExport.exportRun(req.auth.tenantId, req.params.id, req.query.format, res);
});

router.post('/:id/approve', requirePermission('payroll.approve'), async (req, res) => {
    const run = await runsRepo.getRun(req.auth.tenantId, req.params.id);
    if (!run) throw new HttpError(404, 'Payroll run not found');
    if (run.status !== 'Processing') throw new HttpError(409, `Cannot approve a run in "${run.status}" status — process it first`);

    const result = await runsRepo.approveRun(req.auth.tenantId, req.params.id, req.auth.userId);
    if (result.rowsAffected === 0) throw new HttpError(409, 'Run could not be approved (status changed concurrently)');
    res.json({ success: true });
});

router.post('/:id/pay', requirePermission('payroll.approve'), async (req, res) => {
    const run = await runsRepo.getRun(req.auth.tenantId, req.params.id);
    if (!run) throw new HttpError(404, 'Payroll run not found');
    if (run.status !== 'Approved') throw new HttpError(409, `Cannot mark a run "${run.status}" as paid — approve it first`);

    const result = await runsRepo.payRun(req.auth.tenantId, req.params.id, req.auth.userId);
    if (result.rowsAffected === 0) throw new HttpError(409, 'Run could not be marked paid (status changed concurrently)');
    res.json({ success: true });
});

router.post('/:id/cancel', requirePermission('payroll.process'), async (req, res) => {
    const run = await runsRepo.getRun(req.auth.tenantId, req.params.id);
    if (!run) throw new HttpError(404, 'Payroll run not found');
    if (!['Draft', 'Processing'].includes(run.status)) {
        throw new HttpError(409, `Cannot cancel a run in "${run.status}" status`);
    }

    const result = await runsRepo.cancelRun(req.auth.tenantId, req.params.id);
    if (result.rowsAffected === 0) throw new HttpError(409, 'Run could not be cancelled (status changed concurrently)');
    res.json({ success: true });
});

router.post('/:id/publish-all', requirePermission('payroll.approve'), async (req, res) => {
    const run = await runsRepo.getRun(req.auth.tenantId, req.params.id);
    if (!run) throw new HttpError(404, 'Payroll run not found');
    await payslipsRepo.publishAllForRun(req.auth.tenantId, req.params.id, req.auth.userId);
    res.json({ success: true });
});

module.exports = router;

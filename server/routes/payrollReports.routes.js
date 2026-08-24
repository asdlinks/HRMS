const express = require('express');
const reportsRepo = require('../repositories/payrollReports.repository');
const { requirePermission } = require('../middleware/authorize');

const router = express.Router();

router.get('/summary', requirePermission('payroll.view.all'), async (req, res) => {
    const { year, month, departmentId } = req.query;
    res.json(await reportsRepo.summaryForPeriod(req.auth.tenantId, Number(year), Number(month), departmentId));
});

router.get('/component-breakdown', requirePermission('payroll.view.all'), async (req, res) => {
    const { year, month } = req.query;
    res.json(await reportsRepo.componentBreakdownForPeriod(req.auth.tenantId, Number(year), Number(month)));
});

router.get('/trend', requirePermission('payroll.view.all'), async (req, res) => {
    const monthsBack = req.query.months ? Number(req.query.months) : 12;
    res.json(await reportsRepo.costTrend(req.auth.tenantId, monthsBack));
});

module.exports = router;

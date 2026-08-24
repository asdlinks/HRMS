const express = require('express');
const dashboardRepo = require('../../repositories/platformDashboard.repository');

const router = express.Router();

// GET /api/platform-admin/dashboard — high-level KPIs only (Part 1). No
// attendance/leave/payroll figures are ever surfaced here.
router.get('/', async (req, res) => {
    res.json(await dashboardRepo.getDashboardKpis());
});

module.exports = router;

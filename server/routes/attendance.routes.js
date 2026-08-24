const express = require('express');
const attendanceRepo = require('../repositories/attendance.repository');
const leavesRepo = require('../repositories/leaves.repository');
const holidaysRepo = require('../repositories/holidays.repository');
const policiesRepo = require('../repositories/attendancePolicies.repository');
const attendanceEngine = require('../services/attendanceEngine.service');
const { requirePermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { checkInSchema, workModeSelectSchema, attendanceCheckOutSchema, attendanceBreakActionSchema } = require('../schemas');

const router = express.Router();

function monthRange(month, year) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    return { startDate, endDate };
}

router.get('/monthly', async (req, res) => {
    const { userId, month, year } = req.query;
    const { tenantId, userId: requesterId, permissions } = req.auth;

    const targetUserId = parseInt(userId, 10);
    if (targetUserId !== requesterId && !permissions.includes('attendance.view.team')) {
        throw new HttpError(403, 'You do not have permission to perform this action');
    }

    const { startDate, endDate } = monthRange(month, year);
    const user = await attendanceRepo.getUserLocationId(tenantId, targetUserId);
    const locationId = user?.location_id;

    const attendance = await attendanceRepo.listForUserBetween(tenantId, targetUserId, startDate, endDate);
    const leaves = await leavesRepo.listLeaves(tenantId, { scope: 'own', requesterId: targetUserId });
    const leavesInRange = leaves.filter(
        (l) => l.status === 'Approved' && ((l.start_date >= startDate && l.start_date <= endDate) ||
            (l.end_date >= startDate && l.end_date <= endDate) || (l.start_date <= startDate && l.end_date >= endDate))
    );
    const allHolidays = await holidaysRepo.listBetween('holidays', tenantId, startDate, endDate);
    const holidays = allHolidays.filter((h) => h.location_id === null || h.location_id === locationId);

    res.json({ attendance, leaves: leavesInRange, holidays });
});

router.get('/today', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    res.json(await attendanceRepo.listToday(req.auth.tenantId, today));
});

// GET /api/attendance/today-status — whether the caller already has an
// attendance row today (any method, including a kiosk face scan), so the
// HRMS UI knows whether to show a read-only "today's attendance" card or a
// work-mode picker for Hybrid/Remote/Field employees.
router.get('/today-status', async (req, res) => {
    const { tenantId, userId } = req.auth;
    const today = new Date().toISOString().split('T')[0];
    res.json(await attendanceEngine.getTodayStatus(tenantId, userId, today));
});

// GET /api/attendance/my-policy — the caller's own assigned policy (no
// attendance.policy.manage permission required, since this only exposes the
// caller's own row). Drives which check-in methods the HRMS UI offers
// (Manual/WFH/ClientVisit/FieldWork) — Face is always kiosk-only regardless
// of policy, since the HRMS web UI never has a trusted device identity.
router.get('/my-policy', async (req, res) => {
    const { tenantId, userId } = req.auth;
    const policy = await policiesRepo.getPolicyForUser(tenantId, userId);
    if (!policy) return res.json({ policy: null, allowedMethods: ['Manual'] });
    let allowedMethods = [];
    try {
        allowedMethods = JSON.parse(policy.allowed_methods) || [];
    } catch {
        allowedMethods = [];
    }
    res.json({ policy: { ...policy, allowed_methods: allowedMethods }, allowedMethods });
});

router.post('/check-in', requirePermission('attendance.checkin'), validateBody(checkInSchema), async (req, res) => {
    const { tenantId, userId } = req.auth;
    const { date } = req.body;
    const result = await attendanceEngine.recordCheckIn({ tenantId, userId, method: 'Manual', date });
    res.json(result);
});

// POST /api/attendance/work-mode/select — the Hybrid/Remote/Field-employee
// "not recorded yet today" flow: pick WFH / Client Visit / Field Work
// (never Office — that's kiosk-only) and check in under that method in one
// call. attendanceEngine.recordCheckIn re-validates against the caller's
// policy and the day's uniqueness constraint regardless of what the UI
// already showed, so a stale client can't create a duplicate row.
router.post('/work-mode/select', requirePermission('attendance.checkin'), validateBody(workModeSelectSchema), async (req, res) => {
    const { tenantId, userId } = req.auth;
    const { date, workMode, location, clientName, notes, idempotencyKey } = req.body;

    const result = await attendanceEngine.recordCheckIn({
        tenantId,
        userId,
        method: workMode,
        workMode,
        date,
        location,
        clientName,
        notes,
        idempotencyKey,
    });
    res.json(result);
});

router.post('/break', requirePermission('attendance.checkin'), validateBody(attendanceBreakActionSchema), async (req, res) => {
    const { tenantId, userId } = req.auth;
    res.json(await attendanceEngine.recordBreak({ tenantId, userId, date: req.body.date }));
});

router.post('/resume', requirePermission('attendance.checkin'), validateBody(attendanceBreakActionSchema), async (req, res) => {
    const { tenantId, userId } = req.auth;
    res.json(await attendanceEngine.resumeFromBreak({ tenantId, userId, date: req.body.date }));
});

router.post('/check-out', requirePermission('attendance.checkin'), validateBody(attendanceCheckOutSchema), async (req, res) => {
    const { tenantId, userId } = req.auth;
    const { date, workSummary, idempotencyKey } = req.body;
    res.json(await attendanceEngine.recordCheckOut({ tenantId, userId, date, workSummary, idempotencyKey }));
});

module.exports = router;

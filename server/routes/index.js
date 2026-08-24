const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireActiveTenant } = require('../middleware/authorize');

const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const leavesRoutes = require('./leaves.routes');
const departmentsRoutes = require('./departments.routes');
const locationsRoutes = require('./locations.routes');
const { createLookupRouter } = require('./orgLookups.routes');
const {
    designationsRepo, employmentTypesRepo,
} = require('../repositories/orgLookups.repository');
const { createHolidayRouter } = require('./holidays.routes');
const attendanceRoutes = require('./attendance.routes');
const notificationsRoutes = require('./notifications.routes');
const settingsRoutes = require('./settings.routes');
const reportsRoutes = require('./reports.routes');
const voiceRoutes = require('./voice.routes');
const rolesRoutes = require('./roles.routes');
const menuRoutes = require('./menu.routes');
const announcementsRoutes = require('./announcements.routes');
const payrollComponentsRoutes = require('./payrollComponents.routes');
const payrollStructuresRoutes = require('./payrollStructures.routes');
const payrollAssignmentsRoutes = require('./payrollAssignments.routes');
const payrollRunsRoutes = require('./payrollRuns.routes');
const overtimeRoutes = require('./overtime.routes');
const payslipsRoutes = require('./payslips.routes');
const payrollReportsRoutes = require('./payrollReports.routes');
const faceAttendanceRoutes = require('./face-attendance.routes');
const attendancePoliciesRoutes = require('./attendance-policies.routes');
const kioskDevicesRoutes = require('./kiosk-devices.routes');
const companyRoutes = require('./company.routes');
const shiftsRoutes = require('./shifts.routes');
const workModesRoutes = require('./work-modes.routes');
const salaryGradesRoutes = require('./salaryGrades.routes');
const companyDocumentsRoutes = require('./companyDocuments.routes');

const router = express.Router();

// Login/refresh/logout are unauthenticated by definition; change-password
// applies `authenticate` itself within auth.routes.js.
router.use('/auth', authRoutes);

// Everything below requires a valid access token — no route past this point
// trusts a client-supplied identity.
router.use(authenticate);

// Re-checks the tenant hasn't been suspended/cancelled since this token was
// issued — /login and /refresh check status too, but this catches a tenant
// suspended mid-session without waiting for the access token to expire.
router.use(requireActiveTenant());

router.use('/users', usersRoutes);
router.use('/leaves', leavesRoutes);
router.use('/departments', departmentsRoutes);
router.use('/locations', locationsRoutes);
router.use('/designations', createLookupRouter(designationsRepo, 'designations.manage', 'designation'));
router.use('/employment-types', createLookupRouter(employmentTypesRepo, 'employment-types.manage', 'employment type'));
router.use('/holidays', createHolidayRouter('holidays'));
router.use('/flexi-holidays', createHolidayRouter('flexi_holidays'));
router.use('/attendance', attendanceRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/settings', settingsRoutes);
router.use('/reports', reportsRoutes);
router.use('/voice', voiceRoutes);
router.use('/roles', rolesRoutes);
router.use('/menu', menuRoutes);
router.use('/announcements', announcementsRoutes);
router.use('/payroll/components', payrollComponentsRoutes);
router.use('/payroll/structures', payrollStructuresRoutes);
router.use('/payroll/assignments', payrollAssignmentsRoutes);
router.use('/payroll/runs', payrollRunsRoutes);
router.use('/payroll/overtime', overtimeRoutes);
router.use('/payroll/payslips', payslipsRoutes);
router.use('/payroll/reports', payrollReportsRoutes);
router.use('/face-attendance', faceAttendanceRoutes);
router.use('/attendance-policies', attendancePoliciesRoutes);
router.use('/kiosk-devices', kioskDevicesRoutes);
router.use('/company', companyRoutes);
router.use('/shifts', shiftsRoutes);
router.use('/work-modes', workModesRoutes);
router.use('/payroll/grades', salaryGradesRoutes);
router.use('/company-documents', companyDocumentsRoutes);

module.exports = router;

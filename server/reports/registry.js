// Central report catalogue: one array entry per report, each pointing at a
// repository function that builds (not runs) a query. See
// server/routes/reports.routes.js for how an entry is turned into a
// response, and the plan doc (Phase 10B) for the full field contract.
//
// Split into one file per category so category work never touches a shared
// file — each category's reports live entirely in their own
// server/repositories/reports/<category>Reports.repository.js +
// server/reports/categories/<category>.registry.js pair.
const employeeReports = require('./categories/employee.registry');
const attendanceReports = require('./categories/attendance.registry');
const leaveReports = require('./categories/leave.registry');
const payrollReports = require('./categories/payroll.registry');
const organizationReports = require('./categories/organization.registry');
const stubReports = require('./categories/stubs.registry');

const registry = [
    ...employeeReports,
    ...attendanceReports,
    ...leaveReports,
    ...payrollReports,
    ...organizationReports,
    ...stubReports,
];

function getReport(reportId) {
    return registry.find((r) => r.id === reportId) || null;
}

module.exports = { registry, getReport };

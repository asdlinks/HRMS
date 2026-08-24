const { one, sql } = require('../../db/sql');
const { applyScope } = require('../../utils/reportScopeSql');

// Every KPI is independently scoped by the category permission the
// requester actually holds (see reports.routes.js's resolveScope calls) —
// a plain employee with only *.view.own gets their own counts where that's
// meaningful (attendance/leave) and null for org-wide-only figures
// (payroll cost, headcount), which the frontend renders as a narrower
// "your snapshot" card set instead of the full KPI grid.
async function getSummary(tenantId, { requesterId, scopes }) {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const now = new Date();
    const periodYear = now.getFullYear();
    const periodMonth = now.getMonth() + 1;

    const result = {};

    if (scopes.employee) {
        const whereParts = [`tenant_id = @tenantId`, `role != 'super_admin'`, `status = 'active'`];
        const params = { tenantId: { type: sql.Int, value: tenantId } };
        applyScope(whereParts, params, scopes.employee, { tenantId, requesterId }, 'id');
        const row = await one(`SELECT COUNT(*) as total FROM users WHERE ${whereParts.join(' AND ')}`, params);
        result.totalEmployees = row?.total || 0;

        const joinersWhere = [...whereParts, 'joining_date >= @monthStart'];
        const joinersParams = { ...params, monthStart: { type: sql.Date, value: monthStart } };
        const joiners = await one(`SELECT COUNT(*) as total FROM users WHERE ${joinersWhere.join(' AND ')}`, joinersParams);
        result.newJoiners = joiners?.total || 0;

        const exitWhereParts = [`tenant_id = @tenantId`, `role != 'super_admin'`, `exit_date >= @monthStart`];
        const exitParams = { tenantId: { type: sql.Int, value: tenantId }, monthStart: { type: sql.Date, value: monthStart } };
        applyScope(exitWhereParts, exitParams, scopes.employee, { tenantId, requesterId }, 'id');
        const exited = await one(`SELECT COUNT(*) as total FROM users WHERE ${exitWhereParts.join(' AND ')}`, exitParams);
        result.employeesExited = exited?.total || 0;

        const bdayWhereParts = [...whereParts, `date_of_birth IS NOT NULL`,
            `(DATEADD(YEAR, DATEDIFF(YEAR, date_of_birth, @today), date_of_birth)) BETWEEN @today AND DATEADD(DAY, 7, @today)`];
        const bdayParams = { ...params, today: { type: sql.Date, value: today } };
        const bdays = await one(`SELECT COUNT(*) as total FROM users WHERE ${bdayWhereParts.join(' AND ')}`, bdayParams);
        result.upcomingBirthdays = bdays?.total || 0;

        const annivWhereParts = [...whereParts, `joining_date IS NOT NULL`,
            `(DATEADD(YEAR, DATEDIFF(YEAR, joining_date, @today), joining_date)) BETWEEN @today AND DATEADD(DAY, 7, @today)`];
        const annivParams = { ...params, today: { type: sql.Date, value: today } };
        const annivs = await one(`SELECT COUNT(*) as total FROM users WHERE ${annivWhereParts.join(' AND ')}`, annivParams);
        result.upcomingAnniversaries = annivs?.total || 0;
    }

    if (scopes.attendance) {
        const baseWhere = [`a.tenant_id = @tenantId`, `a.date = @today`];
        const baseParams = { tenantId: { type: sql.Int, value: tenantId }, today: { type: sql.Date, value: today } };
        applyScope(baseWhere, baseParams, scopes.attendance, { tenantId, requesterId }, 'a.user_id');

        const present = await one(
            `SELECT COUNT(DISTINCT a.user_id) as total FROM attendance a WHERE ${baseWhere.join(' AND ')}`,
            baseParams
        );
        result.presentToday = present?.total || 0;

        const lateWhere = [...baseWhere, 'a.late_minutes > 0'];
        const late = await one(`SELECT COUNT(*) as total FROM attendance a WHERE ${lateWhere.join(' AND ')}`, baseParams);
        result.lateArrivals = late?.total || 0;

        const otWhereParts = [`a.tenant_id = @tenantId`, `a.date >= @monthStart`];
        const otParams = { tenantId: { type: sql.Int, value: tenantId }, monthStart: { type: sql.Date, value: monthStart } };
        applyScope(otWhereParts, otParams, scopes.attendance, { tenantId, requesterId }, 'a.user_id');
        const ot = await one(
            `SELECT ISNULL(SUM(a.overtime_minutes), 0) as total_minutes FROM attendance a WHERE ${otWhereParts.join(' AND ')}`,
            otParams
        );
        result.overtimeHours = Math.round(((ot?.total_minutes || 0) / 60) * 10) / 10;
    }

    if (scopes.leave) {
        const onLeaveWhere = [`l.tenant_id = @tenantId`, `l.status = 'Approved'`, `@today BETWEEN l.start_date AND l.end_date`];
        const onLeaveParams = { tenantId: { type: sql.Int, value: tenantId }, today: { type: sql.Date, value: today } };
        applyScope(onLeaveWhere, onLeaveParams, scopes.leave, { tenantId, requesterId }, 'l.user_id');
        const onLeave = await one(`SELECT COUNT(DISTINCT l.user_id) as total FROM leaves l WHERE ${onLeaveWhere.join(' AND ')}`, onLeaveParams);
        result.onLeave = onLeave?.total || 0;

        if (result.totalEmployees !== undefined && result.presentToday !== undefined) {
            result.absentToday = Math.max(0, result.totalEmployees - result.presentToday - result.onLeave);
        }

        const pendingWhere = [`l.tenant_id = @tenantId`, `l.status = 'Pending'`];
        const pendingParams = { tenantId: { type: sql.Int, value: tenantId } };
        applyScope(pendingWhere, pendingParams, scopes.leave, { tenantId, requesterId }, 'l.user_id');
        const pending = await one(`SELECT COUNT(*) as total FROM leaves l WHERE ${pendingWhere.join(' AND ')}`, pendingParams);
        result.pendingApprovals = pending?.total || 0;
    }

    if (scopes.payroll) {
        const whereParts = [`l.tenant_id = @tenantId`, `r.period_year = @periodYear`, `r.period_month = @periodMonth`, `r.status <> 'Cancelled'`];
        const params = {
            tenantId: { type: sql.Int, value: tenantId },
            periodYear: { type: sql.Int, value: periodYear },
            periodMonth: { type: sql.Int, value: periodMonth },
        };
        applyScope(whereParts, params, scopes.payroll, { tenantId, requesterId }, 'l.user_id');
        const cost = await one(
            `SELECT ISNULL(SUM(l.net_pay), 0) as total FROM payroll_run_lines l JOIN payroll_runs r ON l.run_id = r.id WHERE ${whereParts.join(' AND ')}`,
            params
        );
        result.monthlyPayrollCost = cost?.total || 0;
    }

    return result;
}

module.exports = { getSummary };

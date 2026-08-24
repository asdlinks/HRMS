const { one, many, run, sql } = require('../db/sql');

// One row per (user, year, month) combining the run line + payslip
// publish/view state — the shape "Employee Payroll History" reads.
function listForUser(tenantId, userId) {
    return many(
        `SELECT p.id as payslip_id, p.is_published, p.published_at, p.first_viewed_at, p.view_count,
                l.id as run_line_id, l.net_pay, l.gross_earnings, l.total_deductions, l.lop_days, l.ot_amount,
                r.id as run_id, r.period_year, r.period_month, r.status as run_status
         FROM payslips p
         JOIN payroll_run_lines l ON p.run_line_id = l.id
         JOIN payroll_runs r ON l.run_id = r.id
         WHERE p.tenant_id = @tenantId AND p.user_id = @userId
         ORDER BY r.period_year DESC, r.period_month DESC`,
        { tenantId: { type: sql.Int, value: tenantId }, userId: { type: sql.Int, value: userId } }
    );
}

// scope mirrors leaves/overtime: 'team' -> requester + direct reports.
function listForTenant(tenantId, { scope, requesterId, filterUserId, year, month } = {}) {
    let query = `
        SELECT p.id as payslip_id, p.is_published, p.published_at, p.first_viewed_at, p.view_count, p.user_id,
               u.name as user_name, u.employee_id,
               l.id as run_line_id, l.net_pay, l.gross_earnings, l.total_deductions, l.lop_days, l.ot_amount,
               r.id as run_id, r.period_year, r.period_month, r.status as run_status
        FROM payslips p
        JOIN payroll_run_lines l ON p.run_line_id = l.id
        JOIN payroll_runs r ON l.run_id = r.id
        JOIN users u ON p.user_id = u.id
        WHERE p.tenant_id = @tenantId
    `;
    const params = { tenantId: { type: sql.Int, value: tenantId } };

    if (scope === 'own') {
        query += ' AND p.user_id = @requesterId';
        params.requesterId = { type: sql.Int, value: requesterId };
    } else if (scope === 'team') {
        query += ' AND (p.user_id = @requesterId OR u.manager_id = @requesterId)';
        params.requesterId = { type: sql.Int, value: requesterId };
    }
    if (filterUserId) {
        query += ' AND p.user_id = @filterUserId';
        params.filterUserId = { type: sql.Int, value: filterUserId };
    }
    if (year) {
        query += ' AND r.period_year = @year';
        params.year = { type: sql.Int, value: year };
    }
    if (month) {
        query += ' AND r.period_month = @month';
        params.month = { type: sql.Int, value: month };
    }

    query += ' ORDER BY r.period_year DESC, r.period_month DESC, u.name';
    return many(query, params);
}

// Full breakdown for one payslip — the printable payslip view.
function getDetail(tenantId, runLineId) {
    return one(
        `SELECT p.id as payslip_id, p.is_published, p.published_at, p.first_viewed_at, p.view_count,
                l.*, u.name as user_name, u.employee_id, u.designation, u.manager_id,
                r.period_year, r.period_month, r.cycle_start_date, r.cycle_end_date, r.status as run_status
         FROM payroll_run_lines l
         JOIN payroll_runs r ON l.run_id = r.id
         JOIN users u ON l.user_id = u.id
         LEFT JOIN payslips p ON p.run_line_id = l.id
         WHERE l.tenant_id = @tenantId AND l.id = @runLineId`,
        { tenantId: { type: sql.Int, value: tenantId }, runLineId: { type: sql.Int, value: runLineId } }
    );
}

function publish(tenantId, runLineId, publishedBy) {
    return run(
        `UPDATE payslips SET is_published = 1, published_at = SYSUTCDATETIME(), published_by = @publishedBy
         WHERE tenant_id = @tenantId AND run_line_id = @runLineId`,
        { tenantId: { type: sql.Int, value: tenantId }, runLineId: { type: sql.Int, value: runLineId }, publishedBy: { type: sql.Int, value: publishedBy } }
    );
}

function publishAllForRun(tenantId, runId, publishedBy) {
    return run(
        `UPDATE p SET is_published = 1, published_at = SYSUTCDATETIME(), published_by = @publishedBy
         FROM payslips p JOIN payroll_run_lines l ON p.run_line_id = l.id
         WHERE l.tenant_id = @tenantId AND l.run_id = @runId AND p.is_published = 0`,
        { tenantId: { type: sql.Int, value: tenantId }, runId: { type: sql.Int, value: runId }, publishedBy: { type: sql.Int, value: publishedBy } }
    );
}

function markViewed(tenantId, runLineId) {
    return run(
        `UPDATE payslips SET view_count = view_count + 1, first_viewed_at = ISNULL(first_viewed_at, SYSUTCDATETIME())
         WHERE tenant_id = @tenantId AND run_line_id = @runLineId`,
        { tenantId: { type: sql.Int, value: tenantId }, runLineId: { type: sql.Int, value: runLineId } }
    );
}

module.exports = { listForUser, listForTenant, getDetail, publish, publishAllForRun, markViewed };

const { one, many, sql } = require('../db/sql');
const { applyScope } = require('../utils/reportScopeSql');
const { buildDimensionFilters } = require('../utils/reportFilters');

function summaryForPeriod(tenantId, year, month, departmentId) {
    let query = `
        SELECT COUNT(*) as employee_count, ISNULL(SUM(l.gross_earnings), 0) as total_gross,
               ISNULL(SUM(l.total_deductions), 0) as total_deductions, ISNULL(SUM(l.net_pay), 0) as total_net,
               ISNULL(SUM(l.lop_days), 0) as total_lop_days, ISNULL(SUM(l.ot_amount), 0) as total_ot_amount
        FROM payroll_run_lines l
        JOIN payroll_runs r ON l.run_id = r.id
        JOIN users u ON l.user_id = u.id
        WHERE l.tenant_id = @tenantId AND r.period_year = @year AND r.period_month = @month AND r.status <> 'Cancelled'
    `;
    const params = {
        tenantId: { type: sql.Int, value: tenantId },
        year: { type: sql.Int, value: year },
        month: { type: sql.Int, value: month },
    };
    if (departmentId && departmentId !== 'all') {
        query += ' AND u.department_id = @departmentId';
        params.departmentId = { type: sql.Int, value: departmentId };
    }
    return one(query, params);
}

function componentBreakdownForPeriod(tenantId, year, month) {
    return many(
        `SELECT c.component_code, c.component_name, c.component_type, SUM(c.amount) as total_amount
         FROM payroll_run_line_components c
         JOIN payroll_run_lines l ON c.run_line_id = l.id
         JOIN payroll_runs r ON l.run_id = r.id
         WHERE c.tenant_id = @tenantId AND r.period_year = @year AND r.period_month = @month AND r.status <> 'Cancelled'
         GROUP BY c.component_code, c.component_name, c.component_type
         ORDER BY c.component_type, total_amount DESC`,
        { tenantId: { type: sql.Int, value: tenantId }, year: { type: sql.Int, value: year }, month: { type: sql.Int, value: month } }
    );
}

function costTrend(tenantId, monthsBack) {
    return many(
        `SELECT TOP (@monthsBack) r.period_year, r.period_month,
                ISNULL(SUM(l.gross_earnings), 0) as total_gross, ISNULL(SUM(l.total_deductions), 0) as total_deductions,
                ISNULL(SUM(l.net_pay), 0) as total_net, COUNT(l.id) as employee_count
         FROM payroll_runs r
         LEFT JOIN payroll_run_lines l ON l.run_id = r.id
         WHERE r.tenant_id = @tenantId AND r.status <> 'Cancelled'
         GROUP BY r.period_year, r.period_month
         ORDER BY r.period_year DESC, r.period_month DESC`,
        { tenantId: { type: sql.Int, value: tenantId }, monthsBack: { type: sql.Int, value: monthsBack } }
    );
}

// ---------------------------------------------------------------------------
// Reports & Analytics platform (Payroll category) additions below.
//
// payroll_run* rows are the immutable, snapshotted record of a processed pay
// cycle (see 010_payroll_runs.sql's header) — every query here reads that
// snapshot rather than joining back to live salary_structures/components, so
// a report of a Paid period can never drift from what was actually paid.
// ---------------------------------------------------------------------------

// The client may send an explicit period; otherwise default to "this month"
// resolved here in JS (never GETDATE(), so it composes with the override).
function resolvePeriod(filters = {}) {
    const now = new Date();
    const year = parseInt(filters.periodYear, 10) || now.getFullYear();
    const month = parseInt(filters.periodMonth, 10) || now.getMonth() + 1;
    return { year, month };
}

// Scoped variant of summaryForPeriod — the existing function above is left
// untouched (it's called positionally by the old payroll dashboard route)
// since it has no notion of requester scope; this one adds it for the new
// Reports platform's Payroll Summary entry.
async function summaryForPeriodScoped(tenantId, { scope, requesterId, filters }) {
    const { year, month } = resolvePeriod(filters);
    const whereParts = ['l.tenant_id = @tenantId', 'r.period_year = @year', 'r.period_month = @month', "r.status <> 'Cancelled'"];
    const params = {
        tenantId: { type: sql.Int, value: tenantId },
        year: { type: sql.Int, value: year },
        month: { type: sql.Int, value: month },
    };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'l.user_id');

    const { whereSql, params: filterParams } = buildDimensionFilters(filters, {
        departmentId: 'u.department_id',
        branchId: 'u.location_id',
        designationId: 'u.designation_id',
        employmentTypeId: 'u.employment_type_id',
        managerId: 'u.manager_id',
    });
    Object.assign(params, filterParams);

    const row = await one(
        `SELECT COUNT(*) as employee_count, ISNULL(SUM(l.gross_earnings), 0) as total_gross,
                ISNULL(SUM(l.total_deductions), 0) as total_deductions, ISNULL(SUM(l.net_pay), 0) as total_net,
                ISNULL(SUM(l.lop_days), 0) as total_lop_days, ISNULL(SUM(l.ot_amount), 0) as total_ot_amount
         FROM payroll_run_lines l
         JOIN payroll_runs r ON l.run_id = r.id
         JOIN users u ON l.user_id = u.id AND u.tenant_id = @tenantId AND u.role <> 'super_admin'
         WHERE ${whereParts.join(' AND ')} ${whereSql}`,
        params
    );
    return [{ period_year: year, period_month: month, ...row }];
}

// Scoped variant of costTrend — see summaryForPeriodScoped's comment.
async function costTrendScoped(tenantId, monthsBack, { scope, requesterId, filters }) {
    const whereParts = ['r.tenant_id = @tenantId', "r.status <> 'Cancelled'"];
    const params = {
        tenantId: { type: sql.Int, value: tenantId },
        monthsBack: { type: sql.Int, value: monthsBack },
    };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'l.user_id');

    const { whereSql, params: filterParams } = buildDimensionFilters(filters, {
        departmentId: 'u.department_id',
        branchId: 'u.location_id',
    });
    Object.assign(params, filterParams);

    return many(
        `SELECT TOP (@monthsBack) r.period_year, r.period_month,
                ISNULL(SUM(l.gross_earnings), 0) as total_gross, ISNULL(SUM(l.total_deductions), 0) as total_deductions,
                ISNULL(SUM(l.net_pay), 0) as total_net, COUNT(l.id) as employee_count
         FROM payroll_runs r
         LEFT JOIN payroll_run_lines l ON l.run_id = r.id
         LEFT JOIN users u ON l.user_id = u.id AND u.tenant_id = @tenantId AND u.role <> 'super_admin'
         WHERE ${whereParts.join(' AND ')} ${whereSql}
         GROUP BY r.period_year, r.period_month
         ORDER BY r.period_year DESC, r.period_month DESC`,
        params
    );
}

// Scoped variant of componentBreakdownForPeriod — see summaryForPeriodScoped's comment.
async function componentBreakdownForPeriodScoped(tenantId, { scope, requesterId, filters }) {
    const { year, month } = resolvePeriod(filters);
    const whereParts = ['c.tenant_id = @tenantId', 'r.period_year = @year', 'r.period_month = @month', "r.status <> 'Cancelled'"];
    const params = {
        tenantId: { type: sql.Int, value: tenantId },
        year: { type: sql.Int, value: year },
        month: { type: sql.Int, value: month },
    };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'l.user_id');

    const { whereSql, params: filterParams } = buildDimensionFilters(filters, {
        departmentId: 'u.department_id',
        branchId: 'u.location_id',
    });
    Object.assign(params, filterParams);

    return many(
        `SELECT c.component_code, c.component_name, c.component_type, SUM(c.amount) as total_amount
         FROM payroll_run_line_components c
         JOIN payroll_run_lines l ON c.run_line_id = l.id
         JOIN payroll_runs r ON l.run_id = r.id
         JOIN users u ON l.user_id = u.id AND u.tenant_id = @tenantId AND u.role <> 'super_admin'
         WHERE ${whereParts.join(' AND ')} ${whereSql}
         GROUP BY c.component_code, c.component_name, c.component_type
         ORDER BY c.component_type, total_amount DESC`,
        params
    );
}

// --- Registry-facing functions (repoKey: 'payrollReports') -----------------

// mode: bespoke — single summary object, shipped wrapped in a one-row array.
async function getPayrollSummary(tenantId, ctx) {
    return summaryForPeriodScoped(tenantId, ctx);
}

// mode: bespoke — wraps componentBreakdownForPeriodScoped; chart-only report.
async function getSalaryComponentSummary(tenantId, ctx) {
    return componentBreakdownForPeriodScoped(tenantId, ctx);
}

// mode: bespoke — month-over-month movement built on costTrendScoped.
// filters.monthsBack (optional, default 13, capped at 25) controls how many
// trailing periods are considered; the oldest one only anchors the first
// delta and isn't itself returned as a "changed" row beyond null deltas.
async function getPayrollVariance(tenantId, { scope, requesterId, filters }) {
    const monthsBack = Math.min(Math.max(parseInt(filters?.monthsBack, 10) || 13, 2), 25);
    const trend = await costTrendScoped(tenantId, monthsBack, { scope, requesterId, filters });
    const chronological = [...trend].reverse(); // costTrendScoped is newest-first; variance reads oldest-first

    return chronological.map((row, idx) => {
        const prior = idx > 0 ? chronological[idx - 1] : null;
        const delta_vs_prior_month = prior ? row.total_net - prior.total_net : null;
        const delta_pct = prior && prior.total_net ? Number(((delta_vs_prior_month / prior.total_net) * 100).toFixed(2)) : null;
        return {
            period: `${row.period_year}-${String(row.period_month).padStart(2, '0')}`,
            period_year: row.period_year,
            period_month: row.period_month,
            total_gross: row.total_gross,
            total_deductions: row.total_deductions,
            total_net: row.total_net,
            employee_count: row.employee_count,
            delta_vs_prior_month,
            delta_pct,
        };
    });
}

// mode: table — one row per employee for the selected period.
function listSalaryRegister(tenantId, { scope, requesterId, filters }) {
    const { year, month } = resolvePeriod(filters);
    const whereParts = ['l.tenant_id = @tenantId', 'r.period_year = @year', 'r.period_month = @month', "r.status <> 'Cancelled'"];
    const params = {
        tenantId: { type: sql.Int, value: tenantId },
        year: { type: sql.Int, value: year },
        month: { type: sql.Int, value: month },
    };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'l.user_id');

    const { whereSql, params: filterParams } = buildDimensionFilters(filters, {
        departmentId: 'u.department_id',
        branchId: 'u.location_id',
        designationId: 'u.designation_id',
        employmentTypeId: 'u.employment_type_id',
        managerId: 'u.manager_id',
        status: 'u.status',
        search: 'u.name',
    });
    Object.assign(params, filterParams);

    const baseSelect = `
        SELECT u.id as user_id, u.employee_id as employee_id, u.name as user_name,
               d.name as department_name, loc.name as branch_name,
               r.period_year as period_year, r.period_month as period_month,
               esa.ctc_annual as ctc_annual,
               l.working_days as working_days, l.present_days as present_days, l.lop_days as lop_days,
               l.gross_earnings as gross_earnings, l.total_deductions as total_deductions, l.net_pay as net_pay,
               l.line_status as line_status
        FROM payroll_run_lines l
        JOIN payroll_runs r ON l.run_id = r.id
        JOIN users u ON l.user_id = u.id AND u.tenant_id = @tenantId AND u.role <> 'super_admin'
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN locations loc ON u.location_id = loc.id
        OUTER APPLY (
            SELECT TOP 1 esa2.ctc_annual
            FROM employee_salary_assignments esa2
            WHERE esa2.user_id = u.id AND esa2.tenant_id = @tenantId
              AND esa2.effective_from <= r.cycle_end_date
              AND (esa2.effective_to IS NULL OR esa2.effective_to >= r.cycle_end_date)
            ORDER BY esa2.effective_from DESC
        ) esa
        WHERE ${whereParts.join(' AND ')} ${whereSql}
    `;
    return { baseSelect, params };
}

// mode: table — which payslips exist/are published for the period; LEFT JOIN
// payslips so a computed line with no payslip row yet still shows up (as
// unpublished) rather than silently disappearing from the register.
function listPayslipRegister(tenantId, { scope, requesterId, filters }) {
    const { year, month } = resolvePeriod(filters);
    const whereParts = ['l.tenant_id = @tenantId', 'r.period_year = @year', 'r.period_month = @month', "r.status <> 'Cancelled'"];
    const params = {
        tenantId: { type: sql.Int, value: tenantId },
        year: { type: sql.Int, value: year },
        month: { type: sql.Int, value: month },
    };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'l.user_id');

    const { whereSql, params: filterParams } = buildDimensionFilters(filters, {
        departmentId: 'u.department_id',
        branchId: 'u.location_id',
        designationId: 'u.designation_id',
        employmentTypeId: 'u.employment_type_id',
        managerId: 'u.manager_id',
        status: 'u.status',
        search: 'u.name',
    });
    Object.assign(params, filterParams);

    const baseSelect = `
        SELECT u.id as user_id, u.employee_id as employee_id, u.name as user_name,
               d.name as department_name, loc.name as branch_name,
               r.period_year as period_year, r.period_month as period_month,
               l.net_pay as net_pay,
               ISNULL(p.is_published, 0) as is_published, p.published_at as published_at, ISNULL(p.view_count, 0) as view_count
        FROM payroll_run_lines l
        JOIN payroll_runs r ON l.run_id = r.id
        JOIN users u ON l.user_id = u.id AND u.tenant_id = @tenantId AND u.role <> 'super_admin'
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN locations loc ON u.location_id = loc.id
        LEFT JOIN payslips p ON p.run_line_id = l.id
        WHERE ${whereParts.join(' AND ')} ${whereSql}
    `;
    return { baseSelect, params };
}

// mode: table — the source overtime workflow rows (not payroll_run_lines'
// snapshotted ot_hours/ot_amount, which is the payroll-side result of these).
function listOvertimeRegister(tenantId, { scope, requesterId, filters }) {
    const whereParts = ['o.tenant_id = @tenantId'];
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'o.user_id');

    const { whereSql, params: filterParams } = buildDimensionFilters(filters, {
        departmentId: 'u.department_id',
        branchId: 'u.location_id',
        managerId: 'u.manager_id',
        status: 'o.status',
        date: 'o.work_date',
        search: 'u.name',
    });
    Object.assign(params, filterParams);

    const baseSelect = `
        SELECT o.id as id, u.id as user_id, u.employee_id as employee_id, u.name as user_name,
               o.work_date as work_date, o.hours as hours, o.status as status, o.reason as reason,
               approver.name as approved_by, o.approved_at as approved_at
        FROM overtime_entries o
        JOIN users u ON o.user_id = u.id AND u.tenant_id = @tenantId AND u.role <> 'super_admin'
        LEFT JOIN users approver ON o.approved_by = approver.id
        WHERE ${whereParts.join(' AND ')} ${whereSql}
    `;
    return { baseSelect, params };
}

// mode: table — payroll totals grouped by department for the period.
function listDepartmentPayroll(tenantId, { scope, requesterId, filters }) {
    const { year, month } = resolvePeriod(filters);
    const whereParts = ['l.tenant_id = @tenantId', 'r.period_year = @year', 'r.period_month = @month', "r.status <> 'Cancelled'"];
    const params = {
        tenantId: { type: sql.Int, value: tenantId },
        year: { type: sql.Int, value: year },
        month: { type: sql.Int, value: month },
    };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'l.user_id');

    const { whereSql, params: filterParams } = buildDimensionFilters(filters, {
        branchId: 'u.location_id',
        employmentTypeId: 'u.employment_type_id',
        managerId: 'u.manager_id',
    });
    Object.assign(params, filterParams);

    const baseSelect = `
        SELECT d.id as department_id, ISNULL(d.name, 'Unassigned') as department_name,
               COUNT(DISTINCT u.id) as employee_count,
               ISNULL(SUM(l.gross_earnings), 0) as total_gross, ISNULL(SUM(l.total_deductions), 0) as total_deductions,
               ISNULL(SUM(l.net_pay), 0) as total_net
        FROM payroll_run_lines l
        JOIN payroll_runs r ON l.run_id = r.id
        JOIN users u ON l.user_id = u.id AND u.tenant_id = @tenantId AND u.role <> 'super_admin'
        LEFT JOIN departments d ON u.department_id = d.id
        WHERE ${whereParts.join(' AND ')} ${whereSql}
        GROUP BY d.id, d.name
    `;
    return { baseSelect, params };
}

// mode: table — payroll totals grouped by branch (locations) for the period.
function listBranchPayroll(tenantId, { scope, requesterId, filters }) {
    const { year, month } = resolvePeriod(filters);
    const whereParts = ['l.tenant_id = @tenantId', 'r.period_year = @year', 'r.period_month = @month', "r.status <> 'Cancelled'"];
    const params = {
        tenantId: { type: sql.Int, value: tenantId },
        year: { type: sql.Int, value: year },
        month: { type: sql.Int, value: month },
    };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'l.user_id');

    const { whereSql, params: filterParams } = buildDimensionFilters(filters, {
        departmentId: 'u.department_id',
        employmentTypeId: 'u.employment_type_id',
        managerId: 'u.manager_id',
    });
    Object.assign(params, filterParams);

    const baseSelect = `
        SELECT loc.id as branch_id, ISNULL(loc.name, 'Unassigned') as branch_name,
               COUNT(DISTINCT u.id) as employee_count,
               ISNULL(SUM(l.gross_earnings), 0) as total_gross, ISNULL(SUM(l.total_deductions), 0) as total_deductions,
               ISNULL(SUM(l.net_pay), 0) as total_net
        FROM payroll_run_lines l
        JOIN payroll_runs r ON l.run_id = r.id
        JOIN users u ON l.user_id = u.id AND u.tenant_id = @tenantId AND u.role <> 'super_admin'
        LEFT JOIN locations loc ON u.location_id = loc.id
        WHERE ${whereParts.join(' AND ')} ${whereSql}
        GROUP BY loc.id, loc.name
    `;
    return { baseSelect, params };
}

// mode: table — bank hand-off list for a Paid/Approved run. Deliberately
// flat (no nested data) so CSV/Excel export reads exactly like the file
// you'd hand to a bank. Bank details live on the employee record (Employee
// Master, Phase 13B) rather than the salary assignment now, so this is a
// plain join off `users` — no dependency on the assignment being open.
function listBankTransferReport(tenantId, { scope, requesterId, filters }) {
    const { year, month } = resolvePeriod(filters);
    const whereParts = ['l.tenant_id = @tenantId', 'r.period_year = @year', 'r.period_month = @month', "r.status IN ('Approved', 'Paid')"];
    const params = {
        tenantId: { type: sql.Int, value: tenantId },
        year: { type: sql.Int, value: year },
        month: { type: sql.Int, value: month },
    };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'l.user_id');

    const { whereSql, params: filterParams } = buildDimensionFilters(filters, {
        departmentId: 'u.department_id',
        branchId: 'u.location_id',
        search: 'u.name',
    });
    Object.assign(params, filterParams);

    const baseSelect = `
        SELECT u.id as user_id, u.employee_id as employee_id, u.name as user_name,
               u.bank_account_holder_name as bank_account_holder_name, u.bank_account_number as bank_account_number,
               u.bank_name as bank_name, u.bank_branch as bank_branch, u.bank_ifsc_code as bank_ifsc_code,
               u.bank_upi_id as bank_upi_id,
               l.net_pay as net_pay, r.period_year as period_year, r.period_month as period_month
        FROM payroll_run_lines l
        JOIN payroll_runs r ON l.run_id = r.id
        JOIN users u ON l.user_id = u.id AND u.tenant_id = @tenantId AND u.role <> 'super_admin'
        WHERE ${whereParts.join(' AND ')} ${whereSql}
    `;
    return { baseSelect, params };
}

module.exports = {
    summaryForPeriod,
    componentBreakdownForPeriod,
    costTrend,
    getPayrollSummary,
    getSalaryComponentSummary,
    getPayrollVariance,
    listSalaryRegister,
    listPayslipRegister,
    listOvertimeRegister,
    listDepartmentPayroll,
    listBranchPayroll,
    listBankTransferReport,
};

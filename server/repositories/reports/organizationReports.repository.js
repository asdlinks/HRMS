// Organization Reports — org-wide structural breakdowns (branches,
// departments, designations, employment types, shifts, work
// modes) plus a headcount-history view and a last-login snapshot. Unlike
// every other report category these have no own/team/all scope: they
// describe the organization itself, not any one person's slice of it, so
// every function here only ever takes `tenantId` (see organization.registry
// .js's flatPermission entries and reports.routes.js's resolveVisibility).
//
// Every "headcount" figure below counts active, non-super_admin users only
// (the same current-headcount convention dashboardReports.repository.js
// uses) — a report about "how many people are in Branch X" isn't useful if
// it includes disabled/exited accounts or the platform's own super_admin.
const { many, sql } = require('../../db/sql');

const HEADCOUNT_USER_FILTER = `u.tenant_id = @tenantId AND u.role != 'super_admin' AND u.status = 'active'`;

function listBranchSummary(tenantId, { filters } = {}) {
    const baseSelect = `
        SELECT l.id as id, l.name as branch_name, l.code as code, l.city as city, l.state as state, l.is_active as is_active,
               COUNT(u.id) as headcount
        FROM locations l
        LEFT JOIN users u ON u.location_id = l.id AND ${HEADCOUNT_USER_FILTER}
        WHERE l.tenant_id = @tenantId
        GROUP BY l.id, l.name, l.code, l.city, l.state, l.is_active
    `;
    return { baseSelect, params: { tenantId: { type: sql.Int, value: tenantId } } };
}

function listDepartmentSummary(tenantId, { filters } = {}) {
    // departments is the one table in this set that predates the richer
    // org-structure masters — just id/tenant_id/name, no code/is_active.
    const baseSelect = `
        SELECT d.id as id, d.name as department_name, COUNT(u.id) as headcount
        FROM departments d
        LEFT JOIN users u ON u.department_id = d.id AND ${HEADCOUNT_USER_FILTER}
        WHERE d.tenant_id = @tenantId
        GROUP BY d.id, d.name
    `;
    return { baseSelect, params: { tenantId: { type: sql.Int, value: tenantId } } };
}

function listDesignationSummary(tenantId, { filters } = {}) {
    const baseSelect = `
        SELECT ds.id as id, ds.name as designation_name, ds.code as code, ds.is_active as is_active,
               COUNT(u.id) as headcount
        FROM designations ds
        LEFT JOIN users u ON u.designation_id = ds.id AND ${HEADCOUNT_USER_FILTER}
        WHERE ds.tenant_id = @tenantId
        GROUP BY ds.id, ds.name, ds.code, ds.is_active
    `;
    return { baseSelect, params: { tenantId: { type: sql.Int, value: tenantId } } };
}

function listEmploymentTypeSummary(tenantId, { filters } = {}) {
    const baseSelect = `
        SELECT et.id as id, et.name as employment_type_name, et.code as code, et.is_active as is_active,
               COUNT(u.id) as headcount
        FROM employment_types et
        LEFT JOIN users u ON u.employment_type_id = et.id AND ${HEADCOUNT_USER_FILTER}
        WHERE et.tenant_id = @tenantId
        GROUP BY et.id, et.name, et.code, et.is_active
    `;
    return { baseSelect, params: { tenantId: { type: sql.Int, value: tenantId } } };
}

// Accepts 'true'/'false' (as query strings arrive) or actual booleans;
// anything else (undefined, '', 'all') means "no filter".
function parseBooleanFilter(value) {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return undefined;
}

function listShiftSummary(tenantId, { filters = {} } = {}) {
    // "Current" assignment = the one open row per employee, per
    // employee_shift_assignments' effective-dated design (see
    // 022_shifts.sql: exactly one row with effective_to IS NULL per
    // employee at any time, enforced by UX_employee_shift_assignments_user_open).
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    let extraWhere = '';
    const isActive = parseBooleanFilter(filters.isActive);
    if (isActive !== undefined) {
        extraWhere = ' AND s.is_active = @isActive';
        params.isActive = { type: sql.Bit, value: isActive };
    }
    const baseSelect = `
        SELECT s.id as id, s.name as shift_name, s.shift_type as shift_type, s.start_time as start_time, s.end_time as end_time,
               s.is_active as is_active, COUNT(u.id) as headcount
        FROM shifts s
        LEFT JOIN employee_shift_assignments esa ON esa.shift_id = s.id AND esa.tenant_id = @tenantId AND esa.effective_to IS NULL
        LEFT JOIN users u ON u.id = esa.user_id AND ${HEADCOUNT_USER_FILTER}
        WHERE s.tenant_id = @tenantId${extraWhere}
        GROUP BY s.id, s.name, s.shift_type, s.start_time, s.end_time, s.is_active
    `;
    return { baseSelect, params };
}

function listWorkModeSummary(tenantId, { filters } = {}) {
    // Configured default (users.default_work_mode_id), not today's actual
    // attendance.work_mode_id usage: this report sits alongside the other
    // Organization summaries, which are all a snapshot of how the org is
    // *structured/configured* (headcount per branch/department/shift...),
    // not a daily activity log — "how many people worked from home today"
    // is an Attendance-category question, not an Organization one.
    const baseSelect = `
        SELECT wm.id as id, wm.name as work_mode_name, wm.code as code, wm.is_active as is_active,
               COUNT(u.id) as headcount
        FROM work_modes wm
        LEFT JOIN users u ON u.default_work_mode_id = wm.id AND ${HEADCOUNT_USER_FILTER}
        WHERE wm.tenant_id = @tenantId
        GROUP BY wm.id, wm.name, wm.code, wm.is_active
    `;
    return { baseSelect, params: { tenantId: { type: sql.Int, value: tenantId } } };
}

function listUserLoginReport(tenantId, { filters } = {}) {
    // last_login_at only (added alongside this reports platform migration,
    // 032_reports_platform.sql) — a single most-recent-login timestamp, not
    // full login history. A proper "login history" report needs an audit
    // log table, which doesn't exist yet (see stubs.registry.js's audit-trail
    // entry) — until then this is the closest thing to "who's inactive".
    const baseSelect = `
        SELECT u.id as id, u.name as user_name, u.email as email, d.name as department_name, l.name as branch_name,
               u.last_login_at as last_login_at, u.joining_date as joining_date
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN locations l ON l.id = u.location_id
        WHERE u.tenant_id = @tenantId AND u.role != 'super_admin' AND u.status = 'active'
    `;
    return { baseSelect, params: { tenantId: { type: sql.Int, value: tenantId } } };
}

// Bespoke: a 12-point monthly time series. Twelve small queries (one per
// month-end) via Promise.all, each computing that month's headcount/
// joiners/exits in one round trip — simple, and plenty fast at this scale;
// not worth a single mega-query over a full user scan.
async function getOrganizationGrowth(tenantId, { filters } = {}) {
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
        const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
        const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i + 1, 0));
        months.push({
            label: `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`,
            start: monthStart.toISOString().slice(0, 10),
            end: monthEnd.toISOString().slice(0, 10),
        });
    }

    const rows = await Promise.all(
        months.map(async (m) => {
            const result = await many(
                `SELECT
                    (SELECT COUNT(*) FROM users WHERE tenant_id = @tenantId AND role != 'super_admin'
                        AND joining_date <= @monthEnd AND (exit_date IS NULL OR exit_date > @monthEnd)) as headcount,
                    (SELECT COUNT(*) FROM users WHERE tenant_id = @tenantId AND role != 'super_admin'
                        AND joining_date BETWEEN @monthStart AND @monthEnd) as joiners,
                    (SELECT COUNT(*) FROM users WHERE tenant_id = @tenantId AND role != 'super_admin'
                        AND exit_date BETWEEN @monthStart AND @monthEnd) as exits`,
                {
                    tenantId: { type: sql.Int, value: tenantId },
                    monthStart: { type: sql.Date, value: m.start },
                    monthEnd: { type: sql.Date, value: m.end },
                }
            );
            const row = result[0] || { headcount: 0, joiners: 0, exits: 0 };
            return {
                month: m.label,
                headcount: row.headcount,
                joiners: row.joiners,
                exits: row.exits,
                netChange: row.joiners - row.exits,
            };
        })
    );

    return rows;
}

module.exports = {
    listBranchSummary,
    listDepartmentSummary,
    listDesignationSummary,
    listEmploymentTypeSummary,
    listShiftSummary,
    listWorkModeSummary,
    listUserLoginReport,
    getOrganizationGrowth,
};

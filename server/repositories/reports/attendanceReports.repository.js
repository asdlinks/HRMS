const { many, sql } = require('../../db/sql');
const { applyScope } = require('../../utils/reportScopeSql');
const { buildDimensionFilters } = require('../../utils/reportFilters');

// Shared FROM/JOIN clause + SELECT list for every "one row per attendance
// entry" report (Daily/Monthly/Late/Early Exit/WFH/Hybrid/Field Visit/Face
// Recognition/Shift/Overtime/Missing Check-Out all read from this same
// shape) — the only thing that varies between those reports is which extra
// WHERE condition or work-mode/method value is fixed by the registry entry.
// Every alias here matches a columns[].field used by at least one of those
// registry entries so ORDER BY <alias> always resolves.
const ATTENDANCE_ROW_COLUMNS = `
    u.employee_id as employee_id,
    u.name as user_name,
    d.name as department_name,
    loc.name as branch_name,
    a.date as date,
    a.check_in_time as check_in_time,
    a.check_out_time as check_out_time,
    a.status as status,
    a.worked_minutes as worked_minutes,
    a.late_minutes as late_minutes,
    a.overtime_minutes as overtime_minutes,
    CAST(ISNULL(a.overtime_minutes, 0) AS DECIMAL(10,2)) / 60.0 as overtime_hours,
    ISNULL(a.is_early_exit, 0) as is_early_exit,
    wm.name as work_mode,
    s.name as shift_name,
    a.method as method,
    a.confidence as confidence,
    a.client_name as client_name,
    a.location_address as location_address
`;

const ATTENDANCE_BASE_FROM = `
    FROM attendance a
    JOIN users u ON a.user_id = u.id AND u.tenant_id = a.tenant_id
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN locations loc ON u.location_id = loc.id
    LEFT JOIN work_modes wm ON a.work_mode_id = wm.id
    LEFT JOIN shifts s ON a.shift_id = s.id
`;

// The full common dimension set every row-level attendance report reacts to.
// A given registry entry only *lists* the subset relevant to it in its own
// `filters` array — buildDimensionFilters silently ignores keys the client
// never sends, so it's safe to reuse this one map everywhere.
const ATTENDANCE_COLUMN_MAP = {
    branchId: 'u.location_id',
    departmentId: 'u.department_id',
    designationId: 'u.designation_id',
    employmentTypeId: 'u.employment_type_id',
    managerId: 'u.manager_id',
    shiftId: 'a.shift_id',
    workModeId: 'a.work_mode_id',
    status: 'a.status',
    date: 'a.date',
    search: 'u.name',
};

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

// mode: 'table'. Backs Daily/Monthly/Late Arrival/Early Exit/WFH/Hybrid/
// Field Visit/Face Recognition/Shift/Overtime — each registry entry only
// differs by `filters`/`columns` (client-visible knobs) and `fixedFilters`
// (server-side presets: lateOnly, earlyExitOnly, overtimeOnly, method,
// workModeCode). None of those preset conditions are plain equality, so
// they're read directly off `filters` here instead of going through
// buildDimensionFilters (which only models equality/range/LIKE).
function listAttendance(tenantId, { scope, requesterId, filters = {} }) {
    const whereParts = [`a.tenant_id = @tenantId`, `u.tenant_id = @tenantId`, `u.role != 'super_admin'`];
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'a.user_id');

    // Row-level attendance reports default to "today" when the caller sends
    // no date range at all, so an unfiltered Daily/Late/Overtime/etc. report
    // never silently dumps the whole attendance history. Monthly Attendance
    // (and any client that supplies its own dateFrom/dateTo) overrides this
    // naturally since the condition only fires when both are absent.
    const effectiveFilters = { ...filters };
    if (!effectiveFilters.dateFrom && !effectiveFilters.dateTo) {
        const today = todayStr();
        effectiveFilters.dateFrom = today;
        effectiveFilters.dateTo = today;
    }

    const { whereSql, params: filterParams } = buildDimensionFilters(effectiveFilters, ATTENDANCE_COLUMN_MAP);
    Object.assign(params, filterParams);

    if (filters.lateOnly) whereParts.push('a.late_minutes > 0');
    if (filters.earlyExitOnly) whereParts.push('a.is_early_exit = 1');
    if (filters.overtimeOnly) whereParts.push('a.overtime_minutes > 0');
    if (filters.method) {
        whereParts.push('a.method = @method');
        params.method = { type: sql.NVarChar(30), value: filters.method };
    }
    if (filters.workModeCode) {
        whereParts.push('wm.code = @workModeCode');
        params.workModeCode = { type: sql.NVarChar(30), value: filters.workModeCode };
    }

    const baseSelect = `
        SELECT ${ATTENDANCE_ROW_COLUMNS}
        ${ATTENDANCE_BASE_FROM}
        WHERE ${whereParts.join(' AND ')} ${whereSql}
    `;
    return { baseSelect, params };
}

// mode: 'table', GROUP BY user — Attendance Summary. Defaults to
// month-to-date when no range is supplied (same rationale as listAttendance,
// picked independently since a "summary" without a range is meaningless
// rather than merely large).
function summarizeAttendanceByEmployee(tenantId, { scope, requesterId, filters = {} }) {
    const whereParts = [`a.tenant_id = @tenantId`, `u.tenant_id = @tenantId`, `u.role != 'super_admin'`];
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'a.user_id');

    const effectiveFilters = { ...filters };
    if (!effectiveFilters.dateFrom && !effectiveFilters.dateTo) {
        const today = todayStr();
        effectiveFilters.dateFrom = `${today.slice(0, 7)}-01`;
        effectiveFilters.dateTo = today;
    }

    const columnMap = {
        branchId: 'u.location_id',
        departmentId: 'u.department_id',
        designationId: 'u.designation_id',
        employmentTypeId: 'u.employment_type_id',
        managerId: 'u.manager_id',
        search: 'u.name',
        date: 'a.date',
    };
    const { whereSql, params: filterParams } = buildDimensionFilters(effectiveFilters, columnMap);
    Object.assign(params, filterParams);

    const baseSelect = `
        SELECT u.employee_id as employee_id, u.name as user_name, d.name as department_name, loc.name as branch_name,
               COUNT(a.id) as present_days,
               SUM(CASE WHEN a.late_minutes > 0 THEN 1 ELSE 0 END) as late_days,
               ISNULL(AVG(CAST(a.worked_minutes as FLOAT)), 0) as avg_worked_minutes,
               ISNULL(SUM(a.overtime_minutes), 0) as total_overtime_minutes
        FROM attendance a
        JOIN users u ON a.user_id = u.id AND u.tenant_id = a.tenant_id
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN locations loc ON u.location_id = loc.id
        WHERE ${whereParts.join(' AND ')} ${whereSql}
        GROUP BY u.employee_id, u.name, d.name, loc.name
    `;
    return { baseSelect, params };
}

// mode: 'table'. Missing Check-In has a fundamentally different shape (no
// attendance row at all) — starts from `users` and LEFT JOINs a single
// target date, keeping only rows where that join found nothing. `date` is
// picked from filters.dateFrom (defaulting to today) rather than a
// dateFrom/dateTo range, since this report is inherently "who's missing on
// one given day", not a multi-day list.
function listMissingCheckIn(tenantId, { scope, requesterId, filters = {} }) {
    const targetDate = filters.dateFrom || todayStr();

    const whereParts = [`u.tenant_id = @tenantId`, `u.role != 'super_admin'`, `u.status = 'active'`];
    const params = {
        tenantId: { type: sql.Int, value: tenantId },
        targetDate: { type: sql.Date, value: targetDate },
    };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'u.id');

    const columnMap = {
        branchId: 'u.location_id',
        departmentId: 'u.department_id',
        designationId: 'u.designation_id',
        employmentTypeId: 'u.employment_type_id',
        managerId: 'u.manager_id',
        search: 'u.name',
    };
    const { whereSql, params: filterParams } = buildDimensionFilters(filters, columnMap);
    Object.assign(params, filterParams);

    const baseSelect = `
        SELECT u.employee_id as employee_id, u.name as user_name, d.name as department_name,
               loc.name as branch_name, @targetDate as date
        FROM users u
        LEFT JOIN attendance a ON a.user_id = u.id AND a.tenant_id = u.tenant_id AND a.date = @targetDate
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN locations loc ON u.location_id = loc.id
        WHERE a.id IS NULL AND ${whereParts.join(' AND ')} ${whereSql}
    `;
    return { baseSelect, params };
}

// mode: 'table'. Missing Check-Out reuses the standard attendance-row shape
// but deliberately does NOT go through listAttendance's "default to today"
// shortcut — that would default dateFrom=dateTo=today, which combined with
// the `a.date < @today` guard (excluding today's still-open shift) would
// always return zero rows. Left unbounded by default; callers can still
// narrow with dateFrom/dateTo.
function listMissingCheckOut(tenantId, { scope, requesterId, filters = {} }) {
    const today = todayStr();
    const whereParts = [
        `a.tenant_id = @tenantId`, `u.tenant_id = @tenantId`, `u.role != 'super_admin'`,
        `a.check_in_time IS NOT NULL`, `a.check_out_time IS NULL`, `a.date < @today`,
    ];
    const params = { tenantId: { type: sql.Int, value: tenantId }, today: { type: sql.Date, value: today } };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'a.user_id');

    const { whereSql, params: filterParams } = buildDimensionFilters(filters, ATTENDANCE_COLUMN_MAP);
    Object.assign(params, filterParams);

    const baseSelect = `
        SELECT ${ATTENDANCE_ROW_COLUMNS}
        ${ATTENDANCE_BASE_FROM}
        WHERE ${whereParts.join(' AND ')} ${whereSql}
    `;
    return { baseSelect, params };
}

// mode: 'bespoke'. Daily time series when the filtered range is <= ~2
// months, otherwise buckets by calendar month so a multi-year range still
// renders as a readable handful of points instead of thousands of daily
// dots — xField stays 'date' either way (a day string or a month's first-of
// -month string) so the chart config never needs to know which granularity
// was chosen.
async function trendAttendance(tenantId, { scope, requesterId, filters = {} }) {
    const whereParts = [`a.tenant_id = @tenantId`, `u.tenant_id = @tenantId`, `u.role != 'super_admin'`];
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'a.user_id');

    const effectiveFilters = { ...filters };
    if (!effectiveFilters.dateFrom || !effectiveFilters.dateTo) {
        const today = new Date();
        const from = new Date(today);
        from.setDate(from.getDate() - 29);
        effectiveFilters.dateTo = today.toISOString().slice(0, 10);
        effectiveFilters.dateFrom = from.toISOString().slice(0, 10);
    }

    const columnMap = {
        branchId: 'u.location_id',
        departmentId: 'u.department_id',
        shiftId: 'a.shift_id',
        workModeId: 'a.work_mode_id',
        search: 'u.name',
        date: 'a.date',
    };
    const { whereSql, params: filterParams } = buildDimensionFilters(effectiveFilters, columnMap);
    Object.assign(params, filterParams);

    const spanDays = (new Date(effectiveFilters.dateTo) - new Date(effectiveFilters.dateFrom)) / 86400000;
    const groupExpr = spanDays > 62 ? `CONVERT(date, DATEADD(DAY, 1 - DAY(a.date), a.date))` : `a.date`;

    const query = `
        SELECT ${groupExpr} as date,
               COUNT(DISTINCT a.user_id) as present_count,
               SUM(CASE WHEN a.late_minutes > 0 THEN 1 ELSE 0 END) as late_count,
               ISNULL(AVG(CAST(a.worked_minutes as FLOAT)), 0) as avg_worked_minutes
        FROM attendance a
        JOIN users u ON a.user_id = u.id AND u.tenant_id = a.tenant_id
        WHERE ${whereParts.join(' AND ')} ${whereSql}
        GROUP BY ${groupExpr}
        ORDER BY ${groupExpr}
    `;
    return many(query, params);
}

module.exports = {
    listAttendance,
    summarizeAttendanceByEmployee,
    listMissingCheckIn,
    listMissingCheckOut,
    trendAttendance,
};

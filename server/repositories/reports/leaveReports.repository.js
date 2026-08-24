const { many, sql } = require('../../db/sql');
const { applyScope } = require('../../utils/reportScopeSql');
const { buildDimensionFilters } = require('../../utils/reportFilters');
const { toUtcDate } = require('../../utils/dateRanges');
const settingsRepo = require('../settings.repository');
const holidaysRepo = require('../holidays.repository');

const DEFAULT_LEAVE_ALLOCATIONS = [{ type: 'casual', days: 15 }];

// Mirrors leaves.routes.js's own parse-with-fallback of the tenant-wide
// `leave_allocations` setting (no dedicated repository getter exists for it —
// settings are stored as an untyped key/value blob — so this reuses
// settingsRepo.listSettings, the one exported settings getter, rather than
// hand-rolling a `SELECT value FROM settings WHERE [key] = ...` here).
async function getLeaveAllocations(tenantId) {
    const rows = await settingsRepo.listSettings(tenantId);
    const row = rows.find((r) => r.key === 'leave_allocations');
    if (!row) return DEFAULT_LEAVE_ALLOCATIONS;
    try {
        const parsed = JSON.parse(row.value);
        return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_LEAVE_ALLOCATIONS;
    } catch {
        return DEFAULT_LEAVE_ALLOCATIONS;
    }
}

function yearBounds(year) {
    return { yearStart: `${year}-01-01`, yearEnd: `${year}-12-31` };
}

// SQL-side equivalent of dateRanges.js's getOverlappingLeaveDays: clamps a
// leave's [start,end] to a fixed range before counting days, so a leave
// spanning a year/month boundary only contributes the days actually inside
// that range. Kept as a expression fragment (not a scalar function) so it can
// be summed directly inside a GROUP BY query instead of pulling every leave
// row into JS to loop over.
function clampedDaysExpr(rangeStartParam, rangeEndParam) {
    return `SUM(CASE WHEN l.is_half_day = 1 THEN 0.5 ELSE DATEDIFF(day,
        CASE WHEN l.start_date < @${rangeStartParam} THEN @${rangeStartParam} ELSE l.start_date END,
        CASE WHEN l.end_date > @${rangeEndParam} THEN @${rangeEndParam} ELSE l.end_date END
    ) + 1 END)`;
}

// ---------------------------------------------------------------------------
// 1. Leave Summary (mode: table) — also backs Pending Approvals (#4) via
// fixedFilters: { status: 'Pending' } on the registry entry, same query.
// ---------------------------------------------------------------------------
function listLeaves(tenantId, { scope, requesterId, filters = {} } = {}) {
    const whereParts = ['l.tenant_id = @tenantId', 'u.tenant_id = @tenantId', "u.role != 'super_admin'"];
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'l.user_id');

    const { whereSql, params: filterParams } = buildDimensionFilters(filters, {
        departmentId: 'u.department_id',
        branchId: 'u.location_id',
        status: 'l.status',
        search: 'u.name',
        date: 'l.start_date',
    });
    Object.assign(params, filterParams);

    const baseSelect = `
        SELECT l.id as id, u.employee_id as employee_id, u.name as employee_name,
               d.name as department_name, loc.name as branch_name, l.type as type,
               l.start_date as start_date, l.end_date as end_date,
               CASE WHEN l.is_half_day = 1 THEN 0.5 ELSE DATEDIFF(day, l.start_date, l.end_date) + 1 END as days,
               l.status as status, l.reason as reason, l.applied_at as applied_at
        FROM leaves l
        JOIN users u ON l.user_id = u.id
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN locations loc ON u.location_id = loc.id
        WHERE ${whereParts.join(' AND ')} ${whereSql}
    `;
    return { baseSelect, params };
}

// ---------------------------------------------------------------------------
// 2. Leave Balance (mode: bespoke) — per-employee, per-type allocation vs.
// taken vs. remaining for the current calendar year. There is no
// leave_balances table: allocations come from the tenant-wide
// settings.leave_allocations JSON, "taken" is aggregated per user+type in
// SQL (GROUP BY), and the two are combined in JS per employee/type pair.
// ---------------------------------------------------------------------------
async function leaveBalance(tenantId, { scope, requesterId, filters = {} } = {}) {
    const { yearStart, yearEnd } = yearBounds(new Date().getFullYear());
    const allocations = await getLeaveAllocations(tenantId);
    if (!allocations.length) return [];

    const empWhere = ['u.tenant_id = @tenantId', "u.role != 'super_admin'", "u.status = 'active'"];
    const empParams = { tenantId: { type: sql.Int, value: tenantId } };
    applyScope(empWhere, empParams, scope, { tenantId, requesterId }, 'u.id');
    const { whereSql: empFilterSql, params: empFilterParams } = buildDimensionFilters(filters, {
        departmentId: 'u.department_id',
        branchId: 'u.location_id',
        search: 'u.name',
    });
    Object.assign(empParams, empFilterParams);

    const employees = await many(
        `SELECT u.id, u.employee_id, u.name as employee_name, d.name as department_name, loc.name as branch_name
         FROM users u
         LEFT JOIN departments d ON u.department_id = d.id
         LEFT JOIN locations loc ON u.location_id = loc.id
         WHERE ${empWhere.join(' AND ')} ${empFilterSql}`,
        empParams
    );
    if (!employees.length) return [];

    const takenWhere = ['l.tenant_id = @tenantId', "l.status = 'Approved'", 'l.start_date <= @yearEnd', 'l.end_date >= @yearStart'];
    const takenParams = {
        tenantId: { type: sql.Int, value: tenantId },
        yearStart: { type: sql.Date, value: yearStart },
        yearEnd: { type: sql.Date, value: yearEnd },
    };
    applyScope(takenWhere, takenParams, scope, { tenantId, requesterId }, 'l.user_id');

    const taken = await many(
        `SELECT l.user_id, l.type, ${clampedDaysExpr('yearStart', 'yearEnd')} as days_taken
         FROM leaves l
         WHERE ${takenWhere.join(' AND ')}
         GROUP BY l.user_id, l.type`,
        takenParams
    );
    // Leave type is free text (no leave_types table), so match against the
    // allocation config case-insensitively — allocations are commonly stored
    // lowercase (see DEFAULT_LEAVE_ALLOCATIONS) while requests may be typed
    // with any casing.
    const takenMap = new Map(taken.map((r) => [`${r.user_id}::${String(r.type).toLowerCase()}`, r.days_taken]));

    const rows = [];
    for (const emp of employees) {
        for (const alloc of allocations) {
            const takenDays = takenMap.get(`${emp.id}::${String(alloc.type).toLowerCase()}`) || 0;
            rows.push({
                employee_id: emp.employee_id,
                employee_name: emp.employee_name,
                department_name: emp.department_name,
                branch_name: emp.branch_name,
                type: alloc.type,
                allocated_days: alloc.days,
                taken_days: takenDays,
                remaining_days: alloc.days - takenDays,
            });
        }
    }
    return rows;
}

// ---------------------------------------------------------------------------
// 3. Leave Utilization (mode: bespoke) — department-level allocated vs.
// taken vs. utilization % for the current calendar year. "Allocated" per
// department = headcount * sum of all configured per-type allocations
// (every active employee is assumed entitled to the full tenant-wide
// allocation set, matching how Leave Balance treats allocations).
// ---------------------------------------------------------------------------
async function leaveUtilization(tenantId, { scope, requesterId, filters = {} } = {}) {
    const { yearStart, yearEnd } = yearBounds(new Date().getFullYear());
    const allocations = await getLeaveAllocations(tenantId);
    const perEmployeeAllocation = allocations.reduce((sum, a) => sum + (Number(a.days) || 0), 0);

    const empWhere = ['u.tenant_id = @tenantId', "u.role != 'super_admin'", "u.status = 'active'"];
    const empParams = { tenantId: { type: sql.Int, value: tenantId } };
    applyScope(empWhere, empParams, scope, { tenantId, requesterId }, 'u.id');
    const { whereSql: empFilterSql, params: empFilterParams } = buildDimensionFilters(filters, {
        departmentId: 'u.department_id',
        branchId: 'u.location_id',
    });
    Object.assign(empParams, empFilterParams);

    const deptCounts = await many(
        `SELECT ISNULL(d.id, 0) as department_id, ISNULL(d.name, 'Unassigned') as department_name, COUNT(*) as employee_count
         FROM users u
         LEFT JOIN departments d ON u.department_id = d.id
         WHERE ${empWhere.join(' AND ')} ${empFilterSql}
         GROUP BY d.id, d.name`,
        empParams
    );
    if (!deptCounts.length) return [];

    const takenWhere = ['l.tenant_id = @tenantId', 'u.tenant_id = @tenantId', "u.role != 'super_admin'", "l.status = 'Approved'",
        'l.start_date <= @yearEnd', 'l.end_date >= @yearStart'];
    const takenParams = {
        tenantId: { type: sql.Int, value: tenantId },
        yearStart: { type: sql.Date, value: yearStart },
        yearEnd: { type: sql.Date, value: yearEnd },
    };
    applyScope(takenWhere, takenParams, scope, { tenantId, requesterId }, 'l.user_id');
    const { whereSql: takenFilterSql, params: takenFilterParams } = buildDimensionFilters(filters, {
        departmentId: 'u.department_id',
        branchId: 'u.location_id',
    });
    Object.assign(takenParams, takenFilterParams);

    const deptTaken = await many(
        `SELECT ISNULL(d.id, 0) as department_id, ${clampedDaysExpr('yearStart', 'yearEnd')} as days_taken
         FROM leaves l
         JOIN users u ON l.user_id = u.id
         LEFT JOIN departments d ON u.department_id = d.id
         WHERE ${takenWhere.join(' AND ')} ${takenFilterSql}
         GROUP BY d.id`,
        takenParams
    );
    const takenMap = new Map(deptTaken.map((r) => [r.department_id, r.days_taken]));

    return deptCounts.map((dc) => {
        const allocatedDays = dc.employee_count * perEmployeeAllocation;
        const takenDays = takenMap.get(dc.department_id) || 0;
        return {
            department_name: dc.department_name,
            employee_count: dc.employee_count,
            allocated_days: allocatedDays,
            taken_days: takenDays,
            utilization_pct: allocatedDays > 0 ? Math.round((takenDays / allocatedDays) * 1000) / 10 : 0,
        };
    });
}

// ---------------------------------------------------------------------------
// 5. Department Leave Calendar (mode: bespoke) — one row per employee-day of
// approved leave inside the requested window (filters.dateFrom/dateTo,
// defaulting to the current calendar month); the frontend pivots this flat
// list into a calendar grid.
// ---------------------------------------------------------------------------
async function departmentLeaveCalendar(tenantId, { scope, requesterId, filters = {} } = {}) {
    const now = new Date();
    const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const defaultEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)).toISOString().slice(0, 10);
    const windowStart = filters.dateFrom || defaultStart;
    const windowEnd = filters.dateTo || defaultEnd;

    const whereParts = ['l.tenant_id = @tenantId', 'u.tenant_id = @tenantId', "u.role != 'super_admin'", "l.status = 'Approved'",
        'l.start_date <= @windowEnd', 'l.end_date >= @windowStart'];
    const params = {
        tenantId: { type: sql.Int, value: tenantId },
        windowStart: { type: sql.Date, value: windowStart },
        windowEnd: { type: sql.Date, value: windowEnd },
    };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'l.user_id');
    const { whereSql, params: filterParams } = buildDimensionFilters(filters, {
        departmentId: 'u.department_id',
        branchId: 'u.location_id',
    });
    Object.assign(params, filterParams);

    const leaves = await many(
        `SELECT u.name as user_name, d.name as department_name, l.type as type,
                l.start_date, l.end_date, l.is_half_day
         FROM leaves l
         JOIN users u ON l.user_id = u.id
         LEFT JOIN departments d ON u.department_id = d.id
         WHERE ${whereParts.join(' AND ')} ${whereSql}`,
        params
    );

    // Only leaves already known to overlap the window reach here (the SQL
    // WHERE above guarantees that), so this just expands each one into its
    // covered days within the window — reusing toUtcDate for the same
    // Date-vs-string normalization dateRanges.js's own helpers rely on.
    const wStart = toUtcDate(windowStart);
    const wEnd = toUtcDate(windowEnd);
    const rows = [];
    for (const l of leaves) {
        if (l.is_half_day) {
            const d = toUtcDate(l.start_date);
            if (d >= wStart && d <= wEnd) {
                rows.push({ user_name: l.user_name, department_name: l.department_name, type: l.type, date: d.toISOString().slice(0, 10), is_half_day: true });
            }
            continue;
        }
        const start = toUtcDate(l.start_date) < wStart ? wStart : toUtcDate(l.start_date);
        const end = toUtcDate(l.end_date) > wEnd ? wEnd : toUtcDate(l.end_date);
        for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
            rows.push({ user_name: l.user_name, department_name: l.department_name, type: l.type, date: d.toISOString().slice(0, 10), is_half_day: false });
        }
    }
    return rows;
}

// ---------------------------------------------------------------------------
// 6. Holiday Utilization (mode: bespoke).
// Interpretation: the spec left this loosely defined; a genuine "holiday vs.
// nearby-leave" correlation would need per-day attendance/leave joins with no
// clear definition of "utilized", so this instead reports the simpler,
// honestly-scoped option the spec offered as an alternative — per branch
// (location), how many company holidays apply there this year (branch-
// specific + tenant-wide/no-location holidays) versus how many active
// employees are stationed there to actually benefit from them.
// ---------------------------------------------------------------------------
async function holidayUtilization(tenantId, { scope, requesterId, filters = {} } = {}) {
    const year = new Date().getFullYear();
    // holidaysRepo.list with no locationId returns every holiday for the
    // tenant (branch-specific and tenant-wide alike) — reused as-is rather
    // than re-querying the holidays table directly.
    const allHolidays = await holidaysRepo.list('holidays', tenantId, null);
    const yearHolidays = allHolidays.filter((h) => new Date(h.date).getFullYear() === year);

    let tenantWideCount = 0;
    const perBranchCount = new Map();
    for (const h of yearHolidays) {
        if (h.location_id == null) { tenantWideCount++; continue; }
        perBranchCount.set(h.location_id, (perBranchCount.get(h.location_id) || 0) + 1);
    }

    const onParts = ['u.location_id = loc.id', 'u.tenant_id = @tenantId', "u.role != 'super_admin'", "u.status = 'active'"];
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    applyScope(onParts, params, scope, { tenantId, requesterId }, 'u.id');

    let whereSql = 'WHERE loc.tenant_id = @tenantId';
    if (filters.branchId && filters.branchId !== 'all') {
        whereSql += ' AND loc.id = @branchId';
        params.branchId = { type: sql.Int, value: filters.branchId };
    }

    const branches = await many(
        `SELECT loc.id as branch_id, loc.name as branch_name, COUNT(u.id) as employee_count
         FROM locations loc
         LEFT JOIN users u ON ${onParts.join(' AND ')}
         ${whereSql}
         GROUP BY loc.id, loc.name`,
        params
    );

    return branches.map((b) => {
        const holidayCount = (perBranchCount.get(b.branch_id) || 0) + tenantWideCount;
        return {
            branch_name: b.branch_name,
            employee_count: b.employee_count,
            holiday_count: holidayCount,
            holidays_per_employee: b.employee_count > 0 ? Math.round((holidayCount / b.employee_count) * 100) / 100 : null,
        };
    });
}

// ---------------------------------------------------------------------------
// 7. Leave Trends (mode: bespoke) — monthly total of approved leave-days
// taken over the last 12 months. Each leave's days are attributed to the
// month of its start_date (not split across a month boundary) — the same
// simplification payrollReports.repository.js's costTrend makes by grouping
// on period_year/period_month directly, since there's no per-day leave
// table to attribute split days against.
// ---------------------------------------------------------------------------
async function leaveTrends(tenantId, { scope, requesterId, filters = {} } = {}) {
    const now = new Date();
    const rangeStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1)).toISOString().slice(0, 10);

    const whereParts = ['l.tenant_id = @tenantId', 'u.tenant_id = @tenantId', "u.role != 'super_admin'",
        "l.status = 'Approved'", 'l.start_date >= @rangeStart'];
    const params = { tenantId: { type: sql.Int, value: tenantId }, rangeStart: { type: sql.Date, value: rangeStart } };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'l.user_id');
    const { whereSql, params: filterParams } = buildDimensionFilters(filters, {
        departmentId: 'u.department_id',
        branchId: 'u.location_id',
    });
    Object.assign(params, filterParams);

    return many(
        `SELECT FORMAT(l.start_date, 'yyyy-MM') as month,
                SUM(CASE WHEN l.is_half_day = 1 THEN 0.5 ELSE DATEDIFF(day, l.start_date, l.end_date) + 1 END) as days
         FROM leaves l
         JOIN users u ON l.user_id = u.id
         WHERE ${whereParts.join(' AND ')} ${whereSql}
         GROUP BY FORMAT(l.start_date, 'yyyy-MM')
         ORDER BY month ASC`,
        params
    );
}

// ---------------------------------------------------------------------------
// 8. Leave Liability (mode: bespoke) — projected cost of each employee's
// unused current-year leave balance, using their currently-open salary
// assignment's CTC/365 as a daily rate. Employees with no open assignment are
// kept in the result (not excluded) with daily_rate/liability_amount set to
// null, so the report surfaces the data gap instead of hiding it or crashing.
// ---------------------------------------------------------------------------
async function leaveLiability(tenantId, { scope, requesterId, filters = {} } = {}) {
    const { yearStart, yearEnd } = yearBounds(new Date().getFullYear());
    const allocations = await getLeaveAllocations(tenantId);
    const perEmployeeAllocation = allocations.reduce((sum, a) => sum + (Number(a.days) || 0), 0);

    const empWhere = ['u.tenant_id = @tenantId', "u.role != 'super_admin'", "u.status = 'active'"];
    const empParams = { tenantId: { type: sql.Int, value: tenantId } };
    applyScope(empWhere, empParams, scope, { tenantId, requesterId }, 'u.id');
    const { whereSql: empFilterSql, params: empFilterParams } = buildDimensionFilters(filters, {
        departmentId: 'u.department_id',
        branchId: 'u.location_id',
        search: 'u.name',
    });
    Object.assign(empParams, empFilterParams);

    const employees = await many(
        `SELECT u.id, u.employee_id, u.name as employee_name, d.name as department_name, esa.ctc_annual
         FROM users u
         LEFT JOIN departments d ON u.department_id = d.id
         LEFT JOIN employee_salary_assignments esa ON esa.user_id = u.id AND esa.tenant_id = @tenantId AND esa.effective_to IS NULL
         WHERE ${empWhere.join(' AND ')} ${empFilterSql}`,
        empParams
    );
    if (!employees.length) return [];

    const takenWhere = ['l.tenant_id = @tenantId', "l.status = 'Approved'", 'l.start_date <= @yearEnd', 'l.end_date >= @yearStart'];
    const takenParams = {
        tenantId: { type: sql.Int, value: tenantId },
        yearStart: { type: sql.Date, value: yearStart },
        yearEnd: { type: sql.Date, value: yearEnd },
    };
    applyScope(takenWhere, takenParams, scope, { tenantId, requesterId }, 'l.user_id');
    const taken = await many(
        `SELECT l.user_id, ${clampedDaysExpr('yearStart', 'yearEnd')} as days_taken
         FROM leaves l
         WHERE ${takenWhere.join(' AND ')}
         GROUP BY l.user_id`,
        takenParams
    );
    const takenMap = new Map(taken.map((r) => [r.user_id, r.days_taken]));

    return employees.map((emp) => {
        const takenDays = takenMap.get(emp.id) || 0;
        const remainingDays = perEmployeeAllocation - takenDays;
        const dailyRate = emp.ctc_annual != null ? Number(emp.ctc_annual) / 365 : null;
        const liabilityAmount = dailyRate != null ? Math.round(remainingDays * dailyRate * 100) / 100 : null;
        return {
            employee_id: emp.employee_id,
            employee_name: emp.employee_name,
            department_name: emp.department_name,
            remaining_days: remainingDays,
            daily_rate: dailyRate != null ? Math.round(dailyRate * 100) / 100 : null,
            liability_amount: liabilityAmount,
        };
    });
}

module.exports = {
    listLeaves,
    leaveBalance,
    leaveUtilization,
    departmentLeaveCalendar,
    holidayUtilization,
    leaveTrends,
    leaveLiability,
};

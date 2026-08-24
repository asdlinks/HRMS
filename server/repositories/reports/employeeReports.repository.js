const { one, many, sql } = require('../../db/sql');
const { applyScope } = require('../../utils/reportScopeSql');
const { buildDimensionFilters } = require('../../utils/reportFilters');

// Dimension-equality + search filters shared by every report below. `date`
// is deliberately NOT here — it varies per report (joining_date vs
// exit_date, or is handled by hand-rolled BETWEEN logic in the
// birthday/anniversary queries below) so each function adds it itself.
const BASE_COLUMN_MAP = {
    branchId: 'u.location_id',
    departmentId: 'u.department_id',
    designationId: 'u.designation_id',
    employmentTypeId: 'u.employment_type_id',
    managerId: 'u.manager_id',
    status: 'u.status',
    search: 'u.name',
};

const DIRECTORY_JOINS = `
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN locations loc ON u.location_id = loc.id
    LEFT JOIN designations des ON u.designation_id = des.id
    LEFT JOIN employment_types et ON u.employment_type_id = et.id
    LEFT JOIN users mgr ON u.manager_id = mgr.id`;

const DIRECTORY_SELECT = `
    SELECT u.employee_id as employee_id, u.name as user_name, u.email as email, u.gender as gender,
           u.date_of_birth as date_of_birth, u.status as status, u.joining_date as joining_date, u.exit_date as exit_date,
           d.name as department_name, loc.name as branch_name, des.name as designation_name,
           et.name as employment_type_name, mgr.name as manager_name`;

// Shared core for Employee Master / Directory / Active / Inactive / New
// Joiners (#1-5) — same roster query, differing only in `dateColumn` (which
// physical column dateFrom/dateTo filters against) and the fixedFilters /
// columns each registry entry layers on top. `mode: 'table'`, so this
// returns (never runs) the SELECT — the route layer paginates/sorts it.
function buildDirectoryQuery(tenantId, { scope, requesterId, filters = {} }, dateColumn) {
    const whereParts = [`u.tenant_id = @tenantId`, `u.role != 'super_admin'`];
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'u.id');

    const columnMap = { ...BASE_COLUMN_MAP, date: dateColumn };
    const { whereSql, params: filterParams } = buildDimensionFilters(filters, columnMap);
    Object.assign(params, filterParams);

    const baseSelect = `${DIRECTORY_SELECT} ${DIRECTORY_JOINS} WHERE ${whereParts.join(' AND ')} ${whereSql}`;
    return { baseSelect, params };
}

// Employee Master, Employee Directory, Active Employees, Inactive Employees,
// New Joiners all share this — they differ only via registry-level
// fixedFilters/columns, not query shape.
function listEmployees(tenantId, ctx) {
    return buildDirectoryQuery(tenantId, ctx, 'u.joining_date');
}

// Exit Employees — same roster, but dateFrom/dateTo filter against
// exit_date instead of joining_date, so it needs its own exported fnName
// (a registry entry can't parameterize which repo function it calls).
function listExitedEmployees(tenantId, ctx) {
    return buildDirectoryQuery(tenantId, ctx, 'u.exit_date');
}

// Shared engine for the five "Summary" reports (#7-11): headcount + status
// breakdown grouped by one org-structure dimension. Uses a LEFT JOIN off
// `users` (not the lookup table) so scope narrows which *employees* count —
// a `.team`-scoped manager viewing Department Summary only sees rows for
// departments their subtree actually has people in, per the spec's example.
const GROUP_DIMENSIONS = {
    department: { column: 'u.department_id', table: 'departments', idField: 'department_id', nameField: 'department_name' },
    branch: { column: 'u.location_id', table: 'locations', idField: 'branch_id', nameField: 'branch_name' },
    designation: { column: 'u.designation_id', table: 'designations', idField: 'designation_id', nameField: 'designation_name' },
    employmentType: { column: 'u.employment_type_id', table: 'employment_types', idField: 'employment_type_id', nameField: 'employment_type_name' },
};

function groupByDimension(tenantId, { scope, requesterId, filters = {} }, dim) {
    const whereParts = [`u.tenant_id = @tenantId`, `u.role != 'super_admin'`];
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'u.id');

    const { whereSql, params: filterParams } = buildDimensionFilters(filters, BASE_COLUMN_MAP);
    Object.assign(params, filterParams);

    const baseSelect = `
        SELECT ISNULL(${dim.column}, 0) as ${dim.idField}, ISNULL(lk.name, 'Unassigned') as ${dim.nameField},
               COUNT(*) as total_count,
               SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END) as active_count,
               SUM(CASE WHEN u.status = 'disabled' THEN 1 ELSE 0 END) as inactive_count,
               SUM(CASE WHEN u.status = 'exited' THEN 1 ELSE 0 END) as exited_count
        FROM users u
        LEFT JOIN ${dim.table} lk ON ${dim.column} = lk.id
        WHERE ${whereParts.join(' AND ')} ${whereSql}
        GROUP BY ${dim.column}, lk.name
    `;
    return { baseSelect, params };
}

function groupByDepartment(tenantId, ctx) { return groupByDimension(tenantId, ctx, GROUP_DIMENSIONS.department); }
function groupByBranch(tenantId, ctx) { return groupByDimension(tenantId, ctx, GROUP_DIMENSIONS.branch); }
function groupByDesignation(tenantId, ctx) { return groupByDimension(tenantId, ctx, GROUP_DIMENSIONS.designation); }
function groupByEmploymentType(tenantId, ctx) { return groupByDimension(tenantId, ctx, GROUP_DIMENSIONS.employmentType); }

// Manager Hierarchy (#12, bespoke). Returns a flat list with `manager_id` +
// `depth` (sort_path keeps siblings grouped under their parent) rather than
// a nested tree — the client can build the tree client-side from parent_id,
// same idiom the spec allows as an alternative to a literal nested object.
// Root(s): the requester alone for 'own'/'team' scope (their subtree is
// walked from there via manager_id, same as the recursive-descendants CTE
// in reportScopeSql.js), or every top-level manager (manager_id IS NULL)
// tenant-wide for 'all'.
async function managerHierarchy(tenantId, { scope, requesterId }) {
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    let rootWhere;
    if (scope === 'all') {
        rootWhere = `manager_id IS NULL AND tenant_id = @tenantId AND role != 'super_admin'`;
    } else {
        params.requesterId = { type: sql.Int, value: requesterId };
        rootWhere = `id = @requesterId AND tenant_id = @tenantId AND role != 'super_admin'`;
    }

    return many(
        `WITH hierarchy AS (
            SELECT id, name, employee_id, manager_id, designation_id, department_id, 0 as depth,
                   CAST(RIGHT('000000' + CAST(id AS VARCHAR(6)), 6) AS VARCHAR(MAX)) as sort_path
            FROM users WHERE ${rootWhere}
            UNION ALL
            SELECT u.id, u.name, u.employee_id, u.manager_id, u.designation_id, u.department_id, h.depth + 1,
                   h.sort_path + '.' + RIGHT('000000' + CAST(u.id AS VARCHAR(6)), 6)
            FROM users u JOIN hierarchy h ON u.manager_id = h.id
            WHERE u.tenant_id = @tenantId AND u.role != 'super_admin'
         )
         SELECT h.id as user_id, h.name as user_name, h.employee_id as employee_id, h.manager_id as manager_id,
                h.depth as depth, des.name as designation_name, d.name as department_name
         FROM hierarchy h
         LEFT JOIN designations des ON h.designation_id = des.id
         LEFT JOIN departments d ON h.department_id = d.id
         ORDER BY h.sort_path`,
        params
    );
}

// Birthday / Anniversary reports (#13-14, mode: 'table'). Reuses the exact
// DATEADD(YEAR, DATEDIFF(YEAR, col, @today), col) "recurrence this year"
// idiom already used in dashboardReports.repository.js's upcomingBirthdays/
// upcomingAnniversaries KPIs, so both places treat the Feb-29-on-a-
// non-leap-year edge case identically. `daysAhead` is an ad-hoc filter (not
// part of reportFilters.js's standard set) read directly off `filters`.
// Judgment call: both default to `status = 'active'` via fixedFilters at the
// registry level — reminders for exited staff aren't useful.
function birthdayReport(tenantId, { scope, requesterId, filters = {} }) {
    const daysAhead = Math.max(1, Math.min(365, parseInt(filters.daysAhead, 10) || 30));
    const today = new Date().toISOString().slice(0, 10);
    const whereParts = [
        `u.tenant_id = @tenantId`, `u.role != 'super_admin'`, `u.date_of_birth IS NOT NULL`,
        `(DATEADD(YEAR, DATEDIFF(YEAR, u.date_of_birth, @today), u.date_of_birth)) BETWEEN @today AND DATEADD(DAY, @daysAhead, @today)`,
    ];
    const params = {
        tenantId: { type: sql.Int, value: tenantId },
        today: { type: sql.Date, value: today },
        daysAhead: { type: sql.Int, value: daysAhead },
    };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'u.id');

    const { whereSql, params: filterParams } = buildDimensionFilters(filters, BASE_COLUMN_MAP);
    Object.assign(params, filterParams);

    const baseSelect = `
        SELECT u.employee_id as employee_id, u.name as user_name, u.date_of_birth as date_of_birth,
               d.name as department_name, loc.name as branch_name, des.name as designation_name
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN locations loc ON u.location_id = loc.id
        LEFT JOIN designations des ON u.designation_id = des.id
        WHERE ${whereParts.join(' AND ')} ${whereSql}
    `;
    return { baseSelect, params };
}

function anniversaryReport(tenantId, { scope, requesterId, filters = {} }) {
    const daysAhead = Math.max(1, Math.min(365, parseInt(filters.daysAhead, 10) || 30));
    const today = new Date().toISOString().slice(0, 10);
    const whereParts = [
        `u.tenant_id = @tenantId`, `u.role != 'super_admin'`, `u.joining_date IS NOT NULL`,
        `(DATEADD(YEAR, DATEDIFF(YEAR, u.joining_date, @today), u.joining_date)) BETWEEN @today AND DATEADD(DAY, @daysAhead, @today)`,
    ];
    const params = {
        tenantId: { type: sql.Int, value: tenantId },
        today: { type: sql.Date, value: today },
        daysAhead: { type: sql.Int, value: daysAhead },
    };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'u.id');

    const { whereSql, params: filterParams } = buildDimensionFilters(filters, BASE_COLUMN_MAP);
    Object.assign(params, filterParams);

    const baseSelect = `
        SELECT u.employee_id as employee_id, u.name as user_name, u.joining_date as joining_date,
               DATEDIFF(YEAR, u.joining_date, GETDATE()) as years_of_service,
               d.name as department_name, loc.name as branch_name, des.name as designation_name
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN locations loc ON u.location_id = loc.id
        LEFT JOIN designations des ON u.designation_id = des.id
        WHERE ${whereParts.join(' AND ')} ${whereSql}
    `;
    return { baseSelect, params };
}

// Gender Distribution (#15, bespoke).
async function genderDistribution(tenantId, { scope, requesterId }) {
    const whereParts = [`u.tenant_id = @tenantId`, `u.role != 'super_admin'`];
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'u.id');

    return many(
        `SELECT ISNULL(u.gender, 'Not specified') as gender, COUNT(*) as count
         FROM users u WHERE ${whereParts.join(' AND ')}
         GROUP BY ISNULL(u.gender, 'Not specified')`,
        params
    );
}

// Age Distribution (#16, bespoke). sort_order rides along in the result so
// buckets come back in a sensible order for the bar chart — the frontend
// isn't required to use it, but it's there rather than leaving bucket order
// to whatever GROUP BY happens to produce.
async function ageDistribution(tenantId, { scope, requesterId }) {
    const whereParts = [`u.tenant_id = @tenantId`, `u.role != 'super_admin'`];
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'u.id');

    const bucket = `CASE
        WHEN u.date_of_birth IS NULL THEN 'Unknown'
        WHEN DATEDIFF(YEAR, u.date_of_birth, GETDATE()) < 25 THEN 'Under 25'
        WHEN DATEDIFF(YEAR, u.date_of_birth, GETDATE()) BETWEEN 25 AND 34 THEN '25-34'
        WHEN DATEDIFF(YEAR, u.date_of_birth, GETDATE()) BETWEEN 35 AND 44 THEN '35-44'
        WHEN DATEDIFF(YEAR, u.date_of_birth, GETDATE()) BETWEEN 45 AND 54 THEN '45-54'
        ELSE '55+' END`;
    const sortOrder = `CASE
        WHEN u.date_of_birth IS NULL THEN 5
        WHEN DATEDIFF(YEAR, u.date_of_birth, GETDATE()) < 25 THEN 0
        WHEN DATEDIFF(YEAR, u.date_of_birth, GETDATE()) BETWEEN 25 AND 34 THEN 1
        WHEN DATEDIFF(YEAR, u.date_of_birth, GETDATE()) BETWEEN 35 AND 44 THEN 2
        WHEN DATEDIFF(YEAR, u.date_of_birth, GETDATE()) BETWEEN 45 AND 54 THEN 3
        ELSE 4 END`;

    return many(
        `SELECT ${bucket} as age_bucket, COUNT(*) as count
         FROM users u WHERE ${whereParts.join(' AND ')}
         GROUP BY ${bucket}, ${sortOrder}
         ORDER BY ${sortOrder}`,
        params
    );
}

// Experience/Tenure Distribution (#17, bespoke) — same bucketing idiom over
// joining_date instead of date_of_birth.
async function experienceDistribution(tenantId, { scope, requesterId }) {
    const whereParts = [`u.tenant_id = @tenantId`, `u.role != 'super_admin'`];
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    applyScope(whereParts, params, scope, { tenantId, requesterId }, 'u.id');

    const bucket = `CASE
        WHEN u.joining_date IS NULL THEN 'Unknown'
        WHEN DATEDIFF(YEAR, u.joining_date, GETDATE()) < 1 THEN 'Under 1 Year'
        WHEN DATEDIFF(YEAR, u.joining_date, GETDATE()) BETWEEN 1 AND 2 THEN '1-3 Years'
        WHEN DATEDIFF(YEAR, u.joining_date, GETDATE()) BETWEEN 3 AND 4 THEN '3-5 Years'
        WHEN DATEDIFF(YEAR, u.joining_date, GETDATE()) BETWEEN 5 AND 9 THEN '5-10 Years'
        ELSE '10+ Years' END`;
    const sortOrder = `CASE
        WHEN u.joining_date IS NULL THEN 5
        WHEN DATEDIFF(YEAR, u.joining_date, GETDATE()) < 1 THEN 0
        WHEN DATEDIFF(YEAR, u.joining_date, GETDATE()) BETWEEN 1 AND 2 THEN 1
        WHEN DATEDIFF(YEAR, u.joining_date, GETDATE()) BETWEEN 3 AND 4 THEN 2
        WHEN DATEDIFF(YEAR, u.joining_date, GETDATE()) BETWEEN 5 AND 9 THEN 3
        ELSE 4 END`;

    return many(
        `SELECT ${bucket} as tenure_bucket, COUNT(*) as count
         FROM users u WHERE ${whereParts.join(' AND ')}
         GROUP BY ${bucket}, ${sortOrder}
         ORDER BY ${sortOrder}`,
        params
    );
}

// Headcount Trend (#18, bespoke). Simplification per the spec's suggestion:
// compute the last N month-end dates in JS and run one small COUNT query
// per month via Promise.all, rather than a numbers-table CTE — headcount
// history is 12-36 tiny queries at most, and this reads far more plainly
// than a recursive calendar CTE for the same result.
async function headcountTrend(tenantId, { scope, requesterId, filters = {} }) {
    const monthsBack = Math.max(1, Math.min(36, parseInt(filters.monthsBack, 10) || 12));
    const now = new Date();
    const monthEnds = [];
    for (let offset = monthsBack - 1; offset >= 0; offset--) {
        monthEnds.push(new Date(now.getFullYear(), now.getMonth() - offset + 1, 0));
    }

    return Promise.all(monthEnds.map(async (end) => {
        const endStr = end.toISOString().slice(0, 10);
        const whereParts = [
            `u.tenant_id = @tenantId`, `u.role != 'super_admin'`, `u.joining_date IS NOT NULL`,
            `u.joining_date <= @monthEnd`, `(u.exit_date IS NULL OR u.exit_date > @monthEnd)`,
        ];
        const params = {
            tenantId: { type: sql.Int, value: tenantId },
            monthEnd: { type: sql.Date, value: endStr },
        };
        applyScope(whereParts, params, scope, { tenantId, requesterId }, 'u.id');
        const row = await one(`SELECT COUNT(*) as total FROM users u WHERE ${whereParts.join(' AND ')}`, params);
        return { month: endStr.slice(0, 7), count: row?.total || 0 };
    }));
}

module.exports = {
    listEmployees,
    listExitedEmployees,
    groupByDepartment,
    groupByBranch,
    groupByDesignation,
    groupByEmploymentType,
    managerHierarchy,
    birthdayReport,
    anniversaryReport,
    genderDistribution,
    ageDistribution,
    experienceDistribution,
    headcountTrend,
};

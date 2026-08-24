const { sql } = require('../db/sql');

// Every dimension a report *might* filter on (Part 8's common filter set).
// A report only reacts to the ones present in its own columnMap — an
// unmapped key is silently ignored (never turned into raw SQL), so filter
// values from the client can never introduce a column/table name.
const EQUALITY_FILTER_TYPES = {
    branchId: sql.Int,
    departmentId: sql.Int,
    designationId: sql.Int,
    employmentTypeId: sql.Int,
    managerId: sql.Int,
    shiftId: sql.Int,
    workModeId: sql.Int,
    status: sql.NVarChar(20),
};

// columnMap: { branchId: 'u.location_id', date: 'a.date', search: 'u.name', ... }
// — maps a filter key to the real SQL column/expression it targets for THIS
// report. filters: the client-supplied { [key]: value } query params.
function buildDimensionFilters(filters = {}, columnMap = {}) {
    const whereParts = [];
    const params = {};
    let n = 0;

    for (const [key, type] of Object.entries(EQUALITY_FILTER_TYPES)) {
        const column = columnMap[key];
        const value = filters[key];
        if (!column || value === undefined || value === null || value === '' || value === 'all') continue;
        const p = `f${n++}`;
        whereParts.push(`${column} = @${p}`);
        params[p] = { type, value };
    }

    if (columnMap.date) {
        if (filters.dateFrom) {
            const p = `f${n++}`;
            whereParts.push(`${columnMap.date} >= @${p}`);
            params[p] = { type: sql.Date, value: filters.dateFrom };
        }
        if (filters.dateTo) {
            const p = `f${n++}`;
            whereParts.push(`${columnMap.date} <= @${p}`);
            params[p] = { type: sql.Date, value: filters.dateTo };
        }
    }

    if (columnMap.search && filters.search) {
        const p = `f${n++}`;
        whereParts.push(`${columnMap.search} LIKE @${p}`);
        params[p] = { type: sql.NVarChar(255), value: `%${filters.search}%` };
    }

    return { whereSql: whereParts.length ? `AND ${whereParts.join(' AND ')}` : '', params };
}

module.exports = { buildDimensionFilters };

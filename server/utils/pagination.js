const { sql } = require('../db/sql');

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

// Every report's SELECT list aliases each output column to match its
// registry `columns[].field` name (the existing SQL style already used
// throughout this codebase, e.g. `u.name as user_name`) — so ORDER BY can
// reference that alias directly and the sort whitelist is just the report's
// own column field list, with no separate field->SQL mapping to maintain.
function parsePagination(query, { allowedSortFields = [], defaultSortField } = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(query.pageSize, 10) || DEFAULT_PAGE_SIZE));
    const requested = query.sortField;
    const sortField = allowedSortFields.includes(requested) ? requested : (defaultSortField || allowedSortFields[0]);
    const sortDir = query.sortDir === 'desc' ? 'DESC' : 'ASC';
    return { page, pageSize, sortField, sortDir };
}

// baseSelect: a full "SELECT ... FROM ... WHERE ..." string with no ORDER BY
// or pagination — the repository's entire job. This wraps it once for the
// paged rows and once (as a derived table) for the matching COUNT(*), so
// every report gets real server-side pagination/sorting/counting for free.
async function runPaginatedQuery({ many, one }, baseSelect, params, { sortField, sortDir, page, pageSize }) {
    const offset = (page - 1) * pageSize;
    const pagedQuery = `${baseSelect} ORDER BY ${sortField} ${sortDir} OFFSET @__offset ROWS FETCH NEXT @__pageSize ROWS ONLY`;
    const countQuery = `SELECT COUNT(*) as total FROM (${baseSelect}) as _report_count`;
    const pagedParams = { ...params, __offset: { type: sql.Int, value: offset }, __pageSize: { type: sql.Int, value: pageSize } };

    const [rows, countRow] = await Promise.all([
        many(pagedQuery, pagedParams),
        one(countQuery, params),
    ]);
    return { rows, total: countRow?.total || 0, page, pageSize };
}

module.exports = { parsePagination, runPaginatedQuery, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };

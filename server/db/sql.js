const { getPool, sql } = require('./pool');

// params values are usually raw JS values (mssql infers the SQL type), but
// pass { type: sql.Int, value: null } when a param can be null — mssql can't
// infer a type from a bare null.
function bindParams(request, params = {}) {
    for (const [key, val] of Object.entries(params)) {
        if (val && typeof val === 'object' && 'type' in val && 'value' in val) {
            request.input(key, val.type, val.value);
        } else {
            request.input(key, val);
        }
    }
}

async function many(query, params) {
    const pool = await getPool();
    const request = pool.request();
    bindParams(request, params);
    const result = await request.query(query);
    return result.recordset;
}

async function one(query, params) {
    const rows = await many(query, params);
    return rows[0] || null;
}

async function run(query, params) {
    const pool = await getPool();
    const request = pool.request();
    bindParams(request, params);
    const result = await request.query(query);
    return { rowsAffected: result.rowsAffected[0], recordset: result.recordset };
}

// Streams rows one at a time instead of buffering the whole recordset —
// used by report exports so a 50k-row CSV/Excel/PDF never holds the entire
// filtered result set in server memory. onRow is called once per row;
// resolves after the last row (or rejects on the first error).
async function streamMany(query, params, onRow) {
    const pool = await getPool();
    const request = pool.request();
    bindParams(request, params);
    request.stream = true;

    return new Promise((resolve, reject) => {
        request.on('row', onRow);
        request.on('error', reject);
        request.on('done', resolve);
        request.query(query);
    });
}

// Runs fn against a single transacted connection; fn receives { one, many, run }
// scoped to that transaction. Commits on success, rolls back on any throw.
async function transaction(fn) {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();

    const scoped = {
        many: async (query, params) => {
            const request = tx.request();
            bindParams(request, params);
            const result = await request.query(query);
            return result.recordset;
        },
        one: async (query, params) => {
            const rows = await scoped.many(query, params);
            return rows[0] || null;
        },
        run: async (query, params) => {
            const request = tx.request();
            bindParams(request, params);
            const result = await request.query(query);
            return { rowsAffected: result.rowsAffected[0], recordset: result.recordset };
        },
    };

    try {
        const result = await fn(scoped);
        await tx.commit();
        return result;
    } catch (err) {
        await tx.rollback();
        throw err;
    }
}

// SQL Server error numbers for a UNIQUE constraint / unique index violation.
function isUniqueViolation(err) {
    return err && (err.number === 2627 || err.number === 2601);
}

module.exports = { one, many, run, streamMany, transaction, isUniqueViolation, sql };

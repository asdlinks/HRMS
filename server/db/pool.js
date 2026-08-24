const sql = require('mssql');
const { getEnv } = require('../config/env');

let poolPromise = null;

// Lazy singleton: the pool connects once on first use and is reused across
// every request/repository call for the lifetime of the process.
function getPool() {
    if (!poolPromise) {
        poolPromise = new sql.ConnectionPool(getEnv().db).connect().catch((err) => {
            poolPromise = null; // allow a retry on the next call instead of caching a dead connection
            throw err;
        });
    }
    return poolPromise;
}

module.exports = { getPool, sql };

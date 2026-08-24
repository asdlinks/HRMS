const { one, run, sql, isUniqueViolation } = require('../db/sql');

function findResponse(tenantId, idempotencyKey) {
    return one('SELECT response_json FROM idempotency_keys WHERE tenant_id = @tenantId AND idempotency_key = @key', {
        tenantId: { type: sql.Int, value: tenantId },
        key: { type: sql.NVarChar(200), value: idempotencyKey },
    }).then((row) => (row ? JSON.parse(row.response_json) : null));
}

// Claims a key before doing the underlying write. Returns true if this call
// won the race (proceed with the write); false if the key was already
// claimed (a concurrent/replayed call — caller should look up the stored
// response instead of writing again).
async function tryClaim(tenantId, idempotencyKey) {
    try {
        await run('INSERT INTO idempotency_keys (tenant_id, idempotency_key) VALUES (@tenantId, @key)', {
            tenantId: { type: sql.Int, value: tenantId },
            key: { type: sql.NVarChar(200), value: idempotencyKey },
        });
        return true;
    } catch (err) {
        if (isUniqueViolation(err)) return false;
        throw err;
    }
}

function storeResponse(tenantId, idempotencyKey, response) {
    return run(
        'UPDATE idempotency_keys SET response_json = @response WHERE tenant_id = @tenantId AND idempotency_key = @key',
        {
            tenantId: { type: sql.Int, value: tenantId },
            key: { type: sql.NVarChar(200), value: idempotencyKey },
            response: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(response) },
        }
    );
}

module.exports = { findResponse, tryClaim, storeResponse };

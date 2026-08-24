const { many, transaction, sql } = require('../db/sql');

function listSettings(tenantId) {
    return many('SELECT [key], value FROM settings WHERE tenant_id = @tenantId', {
        tenantId: { type: sql.Int, value: tenantId },
    });
}

// Upserts every key in `entries` ({ key: value }) inside one transaction —
// the T-SQL equivalent of the original INSERT OR REPLACE.
function bulkUpsert(tenantId, entries) {
    return transaction(async (tx) => {
        for (const [key, value] of Object.entries(entries)) {
            const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
            const params = {
                tenantId: { type: sql.Int, value: tenantId },
                key: { type: sql.NVarChar(100), value: key },
                value: { type: sql.NVarChar(sql.MAX), value: valStr },
            };
            await tx.run(
                `IF EXISTS (SELECT 1 FROM settings WHERE tenant_id = @tenantId AND [key] = @key)
                    UPDATE settings SET value = @value WHERE tenant_id = @tenantId AND [key] = @key
                 ELSE
                    INSERT INTO settings (tenant_id, [key], value) VALUES (@tenantId, @key, @value)`,
                params
            );
        }
    });
}

module.exports = { listSettings, bulkUpsert };

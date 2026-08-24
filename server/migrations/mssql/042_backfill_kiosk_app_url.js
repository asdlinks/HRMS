// One-time, idempotent backfill: sets kiosk_app_url for every tenant that
// doesn't already have one — same shared kiosk deployment for all tenants
// (see config/env.js's kioskAppUrl comment). Only new tenants get this
// automatically now (tenantProvisioning.service.js); tenants created before
// that change need this run once.
//
// Usage:
//   MSSQL_CONNECTION_STRING="Server=host,port;Database=db;User Id=user;Password=pass;" \
//     KIOSK_APP_URL="https://kiosk.mywetechnologies.com" \
//     node server/migrations/mssql/042_backfill_kiosk_app_url.js
const path = require('path');
const sql = require('mssql');
const { getDbConfig } = require(path.join(__dirname, '..', '..', 'config', 'env'));

async function main() {
    const kioskAppUrl = process.env.KIOSK_APP_URL;

    if (!kioskAppUrl) {
        console.error('KIOSK_APP_URL is required.');
        process.exit(1);
    }

    const pool = await new sql.ConnectionPool(getDbConfig()).connect();
    try {
        const tenants = await pool.request().query('SELECT id FROM tenants');

        for (const { id: tenantId } of tenants.recordset) {
            const existing = await pool.request()
                .input('tenantId', sql.Int, tenantId)
                .query('SELECT kiosk_app_url FROM kiosk_app_config WHERE tenant_id = @tenantId');

            if (existing.recordset.length > 0) {
                if (!existing.recordset[0].kiosk_app_url) {
                    await pool.request()
                        .input('tenantId', sql.Int, tenantId)
                        .input('kioskAppUrl', sql.NVarChar(500), kioskAppUrl)
                        .query('UPDATE kiosk_app_config SET kiosk_app_url = @kioskAppUrl, updated_at = SYSUTCDATETIME() WHERE tenant_id = @tenantId');
                    console.log(`Tenant ${tenantId}: filled in blank kiosk_app_url.`);
                } else {
                    console.log(`Tenant ${tenantId}: already has a kiosk_app_url — left untouched.`);
                }
            } else {
                await pool.request()
                    .input('tenantId', sql.Int, tenantId)
                    .input('kioskAppUrl', sql.NVarChar(500), kioskAppUrl)
                    .query('INSERT INTO kiosk_app_config (tenant_id, kiosk_app_url) VALUES (@tenantId, @kioskAppUrl)');
                console.log(`Tenant ${tenantId}: created kiosk_app_config row.`);
            }
        }

        console.log('Done.');
    } finally {
        await pool.close();
    }
}

main().catch((err) => {
    console.error('Kiosk app URL backfill failed:', err.message);
    process.exit(1);
});

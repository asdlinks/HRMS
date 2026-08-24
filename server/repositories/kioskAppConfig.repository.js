const { one, run, sql } = require('../db/sql');

function getKioskAppConfig(tenantId) {
    return one('SELECT kiosk_app_url FROM kiosk_app_config WHERE tenant_id = @tenantId', {
        tenantId: { type: sql.Int, value: tenantId },
    });
}

function setKioskAppUrl(tenantId, kioskAppUrl) {
    return run(
        `IF EXISTS (SELECT 1 FROM kiosk_app_config WHERE tenant_id = @tenantId)
            UPDATE kiosk_app_config SET kiosk_app_url = @kioskAppUrl, updated_at = SYSUTCDATETIME() WHERE tenant_id = @tenantId
         ELSE
            INSERT INTO kiosk_app_config (tenant_id, kiosk_app_url) VALUES (@tenantId, @kioskAppUrl)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            kioskAppUrl: { type: sql.NVarChar(500), value: kioskAppUrl },
        }
    );
}

module.exports = { getKioskAppConfig, setKioskAppUrl };

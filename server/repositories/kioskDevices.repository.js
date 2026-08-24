const { one, many, run, sql } = require('../db/sql');

function listDevices(tenantId) {
    return many(
        `SELECT d.*, l.name AS location_name FROM kiosk_devices d
         LEFT JOIN locations l ON d.location_id = l.id
         WHERE d.tenant_id = @tenantId ORDER BY d.device_name`,
        { tenantId: { type: sql.Int, value: tenantId } }
    );
}

function getDevice(tenantId, id) {
    return one('SELECT * FROM kiosk_devices WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

// No tenant filter — only used by the kiosk-refresh flow, where the device
// id already came from a device_sessions row resolved by token hash (so the
// tenant scope was already established when that session was created).
function getDeviceById(id) {
    return one('SELECT * FROM kiosk_devices WHERE id = @id', { id: { type: sql.Int, value: id } });
}

// Used by kiosk-login, which only knows the device's tenant slug + device
// name (there's no tenant_id yet at that point in the request).
function findActiveDeviceByName(tenantId, deviceName) {
    return one(
        `SELECT * FROM kiosk_devices WHERE tenant_id = @tenantId AND device_name = @deviceName AND status = 'Active'`,
        { tenantId: { type: sql.Int, value: tenantId }, deviceName: { type: sql.NVarChar(150), value: deviceName } }
    );
}

async function createDevice(tenantId, { deviceName, locationId, deviceKeyHash }) {
    const result = await run(
        `INSERT INTO kiosk_devices (tenant_id, device_name, location_id, device_key_hash)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @deviceName, @locationId, @deviceKeyHash)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            deviceName: { type: sql.NVarChar(150), value: deviceName },
            locationId: { type: sql.Int, value: locationId || null },
            deviceKeyHash: { type: sql.NVarChar(255), value: deviceKeyHash },
        }
    );
    return result.recordset[0].id;
}

function rotateDeviceKey(tenantId, id, deviceKeyHash) {
    return run('UPDATE kiosk_devices SET device_key_hash = @deviceKeyHash WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
        deviceKeyHash: { type: sql.NVarChar(255), value: deviceKeyHash },
    });
}

function setDeviceStatus(tenantId, id, status) {
    return run('UPDATE kiosk_devices SET status = @status WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
        status: { type: sql.NVarChar(20), value: status },
    });
}

function touchLastSync(deviceId) {
    return run('UPDATE kiosk_devices SET last_sync_at = SYSUTCDATETIME() WHERE id = @deviceId', {
        deviceId: { type: sql.Int, value: deviceId },
    });
}

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

async function registerFailedLogin(deviceId) {
    await run(
        `UPDATE kiosk_devices SET
            locked_until = CASE WHEN failed_login_attempts + 1 >= @maxAttempts
                THEN DATEADD(MINUTE, @lockoutMinutes, SYSUTCDATETIME()) ELSE locked_until END,
            failed_login_attempts = CASE WHEN failed_login_attempts + 1 >= @maxAttempts
                THEN 0 ELSE failed_login_attempts + 1 END
         WHERE id = @deviceId`,
        {
            deviceId: { type: sql.Int, value: deviceId },
            maxAttempts: { type: sql.Int, value: MAX_FAILED_LOGIN_ATTEMPTS },
            lockoutMinutes: { type: sql.Int, value: LOCKOUT_MINUTES },
        }
    );
}

function clearFailedLogins(deviceId) {
    return run('UPDATE kiosk_devices SET failed_login_attempts = 0, locked_until = NULL WHERE id = @deviceId', {
        deviceId: { type: sql.Int, value: deviceId },
    });
}

module.exports = {
    listDevices,
    getDevice,
    getDeviceById,
    findActiveDeviceByName,
    createDevice,
    rotateDeviceKey,
    setDeviceStatus,
    touchLastSync,
    registerFailedLogin,
    clearFailedLogins,
};

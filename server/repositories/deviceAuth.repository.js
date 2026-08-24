const { one, run, sql } = require('../db/sql');

// Mirrors auth.repository.js's refresh-token functions, but scoped to a
// kiosk device instead of a user — kept as its own table/repository rather
// than overloading refresh_tokens, whose rotation/theft-detection logic is
// security-critical and assumes a real user_id.

async function createDeviceSession({ deviceId, tokenHash, expiresAt }) {
    const result = await run(
        `INSERT INTO device_sessions (device_id, token_hash, expires_at)
         OUTPUT INSERTED.id
         VALUES (@deviceId, @tokenHash, @expiresAt)`,
        {
            deviceId: { type: sql.Int, value: deviceId },
            tokenHash: { type: sql.NVarChar(255), value: tokenHash },
            expiresAt: { type: sql.DateTime2, value: expiresAt },
        }
    );
    return result.recordset[0].id;
}

function findDeviceSessionByHash(tokenHash) {
    return one('SELECT * FROM device_sessions WHERE token_hash = @tokenHash', {
        tokenHash: { type: sql.NVarChar(255), value: tokenHash },
    });
}

function revokeDeviceSession(id, replacedById = null) {
    return run(
        'UPDATE device_sessions SET revoked_at = SYSUTCDATETIME(), replaced_by = @replacedById WHERE id = @id',
        { id: { type: sql.Int, value: id }, replacedById: { type: sql.Int, value: replacedById } }
    );
}

function revokeAllDeviceSessions(deviceId) {
    return run(
        'UPDATE device_sessions SET revoked_at = SYSUTCDATETIME() WHERE device_id = @deviceId AND revoked_at IS NULL',
        { deviceId: { type: sql.Int, value: deviceId } }
    );
}

module.exports = {
    createDeviceSession,
    findDeviceSessionByHash,
    revokeDeviceSession,
    revokeAllDeviceSessions,
};

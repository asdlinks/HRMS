const { one, run, sql } = require('../db/sql');

// Mirrors auth.repository.js's shape against platform_admins /
// platform_admin_refresh_tokens instead of users / refresh_tokens — same
// lockout thresholds, same opaque-refresh-token-hash pattern, just with no
// tenant_id anywhere (platform admins aren't tenant-scoped).

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// Full row, including the password hash — only for the login handler's own
// bcrypt.compare call. Never forward this row to a response.
function findByEmail(email) {
    return one('SELECT * FROM platform_admins WHERE email = @email', {
        email: { type: sql.NVarChar(255), value: email },
    });
}

function getById(id) {
    return one('SELECT id, name, email, is_active, created_at FROM platform_admins WHERE id = @id', {
        id: { type: sql.Int, value: id },
    });
}

// Full row, including the password hash — only for the change-password
// route's own bcrypt.compare call. Never forward this row to a response.
function getByIdWithPassword(id) {
    return one('SELECT * FROM platform_admins WHERE id = @id', {
        id: { type: sql.Int, value: id },
    });
}

async function registerFailedLogin(platformAdminId) {
    await run(
        `UPDATE platform_admins SET
            locked_until = CASE WHEN failed_login_attempts + 1 >= @maxAttempts
                THEN DATEADD(MINUTE, @lockoutMinutes, SYSUTCDATETIME()) ELSE locked_until END,
            failed_login_attempts = CASE WHEN failed_login_attempts + 1 >= @maxAttempts
                THEN 0 ELSE failed_login_attempts + 1 END
         WHERE id = @id`,
        {
            id: { type: sql.Int, value: platformAdminId },
            maxAttempts: { type: sql.Int, value: MAX_FAILED_LOGIN_ATTEMPTS },
            lockoutMinutes: { type: sql.Int, value: LOCKOUT_MINUTES },
        }
    );
}

function clearFailedLogins(platformAdminId) {
    return run('UPDATE platform_admins SET failed_login_attempts = 0, locked_until = NULL WHERE id = @id', {
        id: { type: sql.Int, value: platformAdminId },
    });
}

async function createRefreshToken({ platformAdminId, tokenHash, expiresAt, createdByIp, userAgent }) {
    const result = await run(
        `INSERT INTO platform_admin_refresh_tokens (platform_admin_id, token_hash, expires_at, created_by_ip, user_agent)
         OUTPUT INSERTED.id
         VALUES (@platformAdminId, @tokenHash, @expiresAt, @createdByIp, @userAgent)`,
        {
            platformAdminId: { type: sql.Int, value: platformAdminId },
            tokenHash: { type: sql.NVarChar(255), value: tokenHash },
            expiresAt: { type: sql.DateTime2, value: expiresAt },
            createdByIp: { type: sql.NVarChar(64), value: createdByIp || null },
            userAgent: { type: sql.NVarChar(255), value: userAgent || null },
        }
    );
    return result.recordset[0].id;
}

function findRefreshTokenByHash(tokenHash) {
    return one('SELECT * FROM platform_admin_refresh_tokens WHERE token_hash = @tokenHash', {
        tokenHash: { type: sql.NVarChar(255), value: tokenHash },
    });
}

function revokeRefreshToken(id, replacedById = null) {
    return run(
        'UPDATE platform_admin_refresh_tokens SET revoked_at = SYSUTCDATETIME(), replaced_by = @replacedById WHERE id = @id',
        {
            id: { type: sql.Int, value: id },
            replacedById: { type: sql.Int, value: replacedById },
        }
    );
}

function revokeAllRefreshTokens(platformAdminId) {
    return run(
        'UPDATE platform_admin_refresh_tokens SET revoked_at = SYSUTCDATETIME() WHERE platform_admin_id = @platformAdminId AND revoked_at IS NULL',
        { platformAdminId: { type: sql.Int, value: platformAdminId } }
    );
}

function updatePassword(platformAdminId, passwordHash) {
    return run('UPDATE platform_admins SET password = @passwordHash, updated_at = SYSUTCDATETIME() WHERE id = @id', {
        id: { type: sql.Int, value: platformAdminId },
        passwordHash: { type: sql.NVarChar(255), value: passwordHash },
    });
}

module.exports = {
    findByEmail,
    getById,
    getByIdWithPassword,
    registerFailedLogin,
    clearFailedLogins,
    createRefreshToken,
    findRefreshTokenByHash,
    revokeRefreshToken,
    revokeAllRefreshTokens,
    updatePassword,
};

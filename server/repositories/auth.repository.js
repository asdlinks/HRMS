const { one, many, run, sql } = require('../db/sql');

function findTenantBySlug(slug) {
    return one('SELECT id, name, slug, status FROM tenants WHERE slug = @slug', {
        slug: { type: sql.NVarChar(100), value: slug },
    });
}

// Re-check point for an already-authenticated session (JWT carries only the
// tenantId, not the tenant's current status) — see middleware/authorize.js's
// requireActiveTenant, and /refresh's own check.
function getTenantStatusById(tenantId) {
    return one('SELECT id, status FROM tenants WHERE id = @tenantId', {
        tenantId: { type: sql.Int, value: tenantId },
    });
}

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// Increments the failed-attempt counter; once it reaches the threshold, locks
// the account for LOCKOUT_MINUTES and resets the counter (so the account gets
// a fresh set of attempts once the lock expires).
async function registerFailedLogin(userId) {
    await run(
        `UPDATE users SET
            locked_until = CASE WHEN failed_login_attempts + 1 >= @maxAttempts
                THEN DATEADD(MINUTE, @lockoutMinutes, SYSUTCDATETIME()) ELSE locked_until END,
            failed_login_attempts = CASE WHEN failed_login_attempts + 1 >= @maxAttempts
                THEN 0 ELSE failed_login_attempts + 1 END
         WHERE id = @userId`,
        {
            userId: { type: sql.Int, value: userId },
            maxAttempts: { type: sql.Int, value: MAX_FAILED_LOGIN_ATTEMPTS },
            lockoutMinutes: { type: sql.Int, value: LOCKOUT_MINUTES },
        }
    );
}

function clearFailedLogins(userId) {
    return run('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = SYSUTCDATETIME() WHERE id = @userId', {
        userId: { type: sql.Int, value: userId },
    });
}

// Admin-initiated unlock — same effect as clearFailedLogins but scoped to a
// tenant so an admin can't unlock a user outside their own company, and
// exposed as its own repository function so the route layer's intent
// (`users.unlock`) is explicit rather than reusing the post-login helper.
function adminUnlockUser(tenantId, userId) {
    return run(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = @userId AND tenant_id = @tenantId',
        { userId: { type: sql.Int, value: userId }, tenantId: { type: sql.Int, value: tenantId } }
    );
}

// Full row, including the password hash — only for the login handler's own
// bcrypt.compare call. Never forward this row to a response.
function findUserByTenantAndEmail(tenantId, email) {
    return one('SELECT * FROM users WHERE tenant_id = @tenantId AND email = @email', {
        tenantId: { type: sql.Int, value: tenantId },
        email: { type: sql.NVarChar(255), value: email },
    });
}

// Every user column except the password hash, which must never leave this layer.
function getUserPublicProfile(userId) {
    return one(
        `SELECT id, tenant_id, employee_id, name, email, role, designation, department_id,
                manager_id, location_id, profile_photo, joining_date, created_at,
                probation_period, probation_message_shown, status
         FROM users WHERE id = @userId`,
        { userId: { type: sql.Int, value: userId } }
    );
}

async function createRefreshToken({ userId, tenantId, tokenHash, expiresAt, createdByIp, userAgent }) {
    const result = await run(
        `INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, expires_at, created_by_ip, user_agent)
         OUTPUT INSERTED.id
         VALUES (@userId, @tenantId, @tokenHash, @expiresAt, @createdByIp, @userAgent)`,
        {
            userId: { type: sql.Int, value: userId },
            tenantId: { type: sql.Int, value: tenantId },
            tokenHash: { type: sql.NVarChar(255), value: tokenHash },
            expiresAt: { type: sql.DateTime2, value: expiresAt },
            createdByIp: { type: sql.NVarChar(64), value: createdByIp || null },
            userAgent: { type: sql.NVarChar(255), value: userAgent || null },
        }
    );
    return result.recordset[0].id;
}

function findRefreshTokenByHash(tokenHash) {
    return one('SELECT * FROM refresh_tokens WHERE token_hash = @tokenHash', {
        tokenHash: { type: sql.NVarChar(255), value: tokenHash },
    });
}

function revokeRefreshToken(id, replacedById = null) {
    return run(
        'UPDATE refresh_tokens SET revoked_at = SYSUTCDATETIME(), replaced_by = @replacedById WHERE id = @id',
        {
            id: { type: sql.Int, value: id },
            replacedById: { type: sql.Int, value: replacedById },
        }
    );
}

// Used on password change and on refresh-token-reuse detection (theft
// response) to kill every active session for a user in one shot.
function revokeAllUserRefreshTokens(userId) {
    return run(
        'UPDATE refresh_tokens SET revoked_at = SYSUTCDATETIME() WHERE user_id = @userId AND revoked_at IS NULL',
        { userId: { type: sql.Int, value: userId } }
    );
}

function updateUserPassword(userId, passwordHash) {
    return run('UPDATE users SET password = @passwordHash WHERE id = @userId', {
        userId: { type: sql.Int, value: userId },
        passwordHash: { type: sql.NVarChar(255), value: passwordHash },
    });
}

module.exports = {
    findTenantBySlug,
    getTenantStatusById,
    registerFailedLogin,
    clearFailedLogins,
    adminUnlockUser,
    findUserByTenantAndEmail,
    getUserPublicProfile,
    createRefreshToken,
    findRefreshTokenByHash,
    revokeRefreshToken,
    revokeAllUserRefreshTokens,
    updateUserPassword,
};

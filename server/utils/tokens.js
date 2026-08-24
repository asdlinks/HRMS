const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getEnv } = require('../config/env');

function signAccessToken({ userId, tenantId, permissions }) {
    return jwt.sign({ sub: userId, tenantId, permissions }, getEnv().jwtAccessSecret, {
        expiresIn: getEnv().jwtAccessTtl,
    });
}

// Kiosk devices get a short-lived (5 minute) access token instead of a
// user's 15-minute one, so a revoked device (kiosk_devices.status set to
// 'Revoked') is locked out quickly without needing to blocklist an
// already-issued stateless JWT — it just fails to refresh next time.
// Permissions are fixed at issuance, not looked up from role_permissions —
// a kiosk has no user row to hold a role assignment.
const KIOSK_ACCESS_TTL = '5m';
const KIOSK_PERMISSIONS = ['attendance.checkin.kiosk', 'attendance.face.sync'];

function signDeviceAccessToken({ deviceId, tenantId }) {
    return jwt.sign({ deviceId, tenantId, permissions: KIOSK_PERMISSIONS }, getEnv().jwtAccessSecret, {
        expiresIn: KIOSK_ACCESS_TTL,
    });
}

// Opaque random value — the raw value is only ever held by the client (in
// the httpOnly cookie); the server stores only its hash, so a database leak
// alone can't be used to forge a session.
function generateRefreshTokenValue() {
    return crypto.randomBytes(64).toString('hex');
}

function hashToken(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function refreshTokenExpiry() {
    const days = getEnv().refreshTokenTtlDays;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// Kiosks are physically secured, admin-provisioned devices (not a personal
// session), so a longer 90-day refresh window is acceptable — device
// revocation happens by flipping kiosk_devices.status, not by waiting out
// a short refresh TTL.
function deviceRefreshTokenExpiry() {
    return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
}

// Platform admins (Phase 9) are a third, entirely separate principal type —
// signed with their own secret and no `permissions`/`tenantId` claim at all,
// since Platform Admin authorization never runs through requirePermission
// (see middleware/platformAdminAuth.js).
function signPlatformAdminAccessToken({ platformAdminId }) {
    return jwt.sign({ sub: platformAdminId, type: 'platform_admin' }, getEnv().platformAdminJwtSecret, {
        expiresIn: getEnv().platformAdminAccessTtl,
    });
}

function platformAdminRefreshTokenExpiry() {
    const days = getEnv().platformAdminRefreshTokenTtlDays;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

module.exports = {
    signAccessToken,
    signDeviceAccessToken,
    generateRefreshTokenValue,
    hashToken,
    refreshTokenExpiry,
    deviceRefreshTokenExpiry,
    signPlatformAdminAccessToken,
    platformAdminRefreshTokenExpiry,
};

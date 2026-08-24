const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const authRepo = require('../repositories/auth.repository');
const rbacRepo = require('../repositories/rbac.repository');
const usersRepo = require('../repositories/users.repository');
const kioskDevicesRepo = require('../repositories/kioskDevices.repository');
const deviceAuthRepo = require('../repositories/deviceAuth.repository');
const {
    signAccessToken,
    signDeviceAccessToken,
    generateRefreshTokenValue,
    hashToken,
    refreshTokenExpiry,
    deviceRefreshTokenExpiry,
} = require('../utils/tokens');
const { authenticate } = require('../middleware/auth');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { changePasswordSchema, kioskLoginSchema } = require('../schemas');

const router = express.Router();

const REFRESH_COOKIE = 'mywe_refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';
const DEVICE_REFRESH_COOKIE = 'mywe_device_refresh_token';

// IP-based defense in depth on top of the per-account lockout above — an
// attacker spreading guesses across many accounts (or many tenants) from one
// IP isn't stopped by per-account lockout alone.
const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts from this location. Please try again later.' },
});

function refreshCookieOptions() {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        path: REFRESH_COOKIE_PATH,
        maxAge: 1000 * 60 * 60 * 24 * (parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10)),
    };
}

function deviceRefreshCookieOptions() {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        path: REFRESH_COOKIE_PATH,
        maxAge: 1000 * 60 * 60 * 24 * 90,
    };
}

async function issueDeviceSession(res, device) {
    const accessToken = signDeviceAccessToken({ deviceId: device.id, tenantId: device.tenant_id });

    const refreshValue = generateRefreshTokenValue();
    await deviceAuthRepo.createDeviceSession({
        deviceId: device.id,
        tokenHash: hashToken(refreshValue),
        expiresAt: deviceRefreshTokenExpiry(),
    });

    res.cookie(DEVICE_REFRESH_COOKIE, refreshValue, deviceRefreshCookieOptions());
    return { accessToken, device: { id: device.id, deviceName: device.device_name, tenantId: device.tenant_id } };
}

async function issueSession(res, user) {
    const permissions = await rbacRepo.getPermissionCodesForUser(user.id);
    const accessToken = signAccessToken({ userId: user.id, tenantId: user.tenant_id, permissions });

    const refreshValue = generateRefreshTokenValue();
    await authRepo.createRefreshToken({
        userId: user.id,
        tenantId: user.tenant_id,
        tokenHash: hashToken(refreshValue),
        expiresAt: refreshTokenExpiry(),
    });

    res.cookie(REFRESH_COOKIE, refreshValue, refreshCookieOptions());

    const { password, ...publicUser } = user;
    return { accessToken, user: publicUser, permissions };
}

function assertTenantActive(tenant) {
    if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
        throw new HttpError(403, "This company's account is currently suspended. Contact support.");
    }
}

// POST /api/auth/login — { tenantCode, email, password }
router.post('/login', loginRateLimiter, async (req, res) => {
    const { tenantCode, email, password } = req.body;
    if (!tenantCode || !email || !password) {
        throw new HttpError(400, 'Company code, email and password are required');
    }

    const tenant = await authRepo.findTenantBySlug(tenantCode);
    // Generic message for both "tenant not found" and "user not found" —
    // don't leak which part of the credential triple was wrong.
    if (!tenant) throw new HttpError(401, 'Invalid company code, email or password');
    assertTenantActive(tenant);

    const user = await authRepo.findUserByTenantAndEmail(tenant.id, email);
    if (!user) throw new HttpError(401, 'Invalid company code, email or password');

    if (user.status && user.status !== 'active') {
        throw new HttpError(403, 'This account has been disabled. Contact your administrator.');
    }

    // Lockout is checked before the account exists further in the flow —
    // this necessarily reveals the account exists (a distinct message from
    // "invalid credentials"), a standard, accepted trade-off for lockout
    // messaging.
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
        throw new HttpError(429, 'Too many failed login attempts. Please try again in a few minutes.');
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
        await authRepo.registerFailedLogin(user.id);
        throw new HttpError(401, 'Invalid company code, email or password');
    }
    await authRepo.clearFailedLogins(user.id);

    const session = await issueSession(res, user);
    res.json(session);
});

// POST /api/auth/refresh — reads the refresh cookie, rotates it, issues a new access token.
router.post('/refresh', async (req, res) => {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (!presented) throw new HttpError(401, 'Not authenticated');

    const tokenHash = hashToken(presented);
    const stored = await authRepo.findRefreshTokenByHash(tokenHash);

    if (!stored) throw new HttpError(401, 'Session expired, please log in again');

    if (stored.revoked_at) {
        // A revoked token being presented again means it was already rotated
        // (or logged out) and someone is replaying an old value — treat as
        // theft and kill every session for this user.
        await authRepo.revokeAllUserRefreshTokens(stored.user_id);
        res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
        throw new HttpError(401, 'Session invalidated, please log in again');
    }

    if (new Date(stored.expires_at) < new Date()) {
        throw new HttpError(401, 'Session expired, please log in again');
    }

    const user = await authRepo.getUserPublicProfile(stored.user_id);
    if (!user) throw new HttpError(401, 'Session expired, please log in again');
    if (user.status && user.status !== 'active') {
        res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
        throw new HttpError(403, 'This account has been disabled. Contact your administrator.');
    }

    const tenant = await authRepo.getTenantStatusById(user.tenant_id);
    if (!tenant || tenant.status === 'suspended' || tenant.status === 'cancelled') {
        res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
        throw new HttpError(403, "This company's account is currently suspended. Contact support.");
    }

    const permissions = await rbacRepo.getPermissionCodesForUser(user.id);
    const accessToken = signAccessToken({ userId: user.id, tenantId: user.tenant_id, permissions });

    const newRefreshValue = generateRefreshTokenValue();
    const newRefreshId = await authRepo.createRefreshToken({
        userId: user.id,
        tenantId: user.tenant_id,
        tokenHash: hashToken(newRefreshValue),
        expiresAt: refreshTokenExpiry(),
    });
    await authRepo.revokeRefreshToken(stored.id, newRefreshId);

    res.cookie(REFRESH_COOKIE, newRefreshValue, refreshCookieOptions());
    res.json({ accessToken, user, permissions });
});

// POST /api/auth/logout — revokes the current session's refresh token.
router.post('/logout', async (req, res) => {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (presented) {
        const stored = await authRepo.findRefreshTokenByHash(hashToken(presented));
        if (stored && !stored.revoked_at) {
            await authRepo.revokeRefreshToken(stored.id);
        }
    }
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    res.json({ success: true });
});

// POST /api/auth/kiosk-login — { tenantCode, deviceName, deviceKey }. A kiosk
// device is its own principal, not an employee — see
// utils/tokens.js::signDeviceAccessToken and repositories/deviceAuth.repository.js.
router.post('/kiosk-login', loginRateLimiter, validateBody(kioskLoginSchema), async (req, res) => {
    const { tenantCode, deviceName, deviceKey } = req.body;

    const tenant = await authRepo.findTenantBySlug(tenantCode);
    // Generic message, same rationale as /login: don't leak which part of
    // the credential triple was wrong.
    if (!tenant) throw new HttpError(401, 'Invalid company code, device name or device key');
    assertTenantActive(tenant);

    const device = await kioskDevicesRepo.findActiveDeviceByName(tenant.id, deviceName);
    if (!device) throw new HttpError(401, 'Invalid company code, device name or device key');

    if (device.locked_until && new Date(device.locked_until) > new Date()) {
        throw new HttpError(429, 'Too many failed login attempts. Please try again in a few minutes.');
    }

    const keyMatches = await bcrypt.compare(deviceKey, device.device_key_hash);
    if (!keyMatches) {
        await kioskDevicesRepo.registerFailedLogin(device.id);
        throw new HttpError(401, 'Invalid company code, device name or device key');
    }
    await kioskDevicesRepo.clearFailedLogins(device.id);

    const session = await issueDeviceSession(res, device);
    res.json(session);
});

// POST /api/auth/kiosk-refresh — reads the device refresh cookie, rotates it,
// issues a new short-lived device access token. Mirrors /refresh's rotation
// and theft-detection pattern against device_sessions instead of refresh_tokens.
router.post('/kiosk-refresh', async (req, res) => {
    const presented = req.cookies?.[DEVICE_REFRESH_COOKIE];
    if (!presented) throw new HttpError(401, 'Not authenticated');

    const tokenHash = hashToken(presented);
    const stored = await deviceAuthRepo.findDeviceSessionByHash(tokenHash);

    if (!stored) throw new HttpError(401, 'Session expired, please pair this device again');

    if (stored.revoked_at) {
        await deviceAuthRepo.revokeAllDeviceSessions(stored.device_id);
        res.clearCookie(DEVICE_REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
        throw new HttpError(401, 'Session invalidated, please pair this device again');
    }

    if (new Date(stored.expires_at) < new Date()) {
        throw new HttpError(401, 'Session expired, please pair this device again');
    }

    const device = await kioskDevicesRepo.getDeviceById(stored.device_id);
    if (!device || device.status !== 'Active') {
        res.clearCookie(DEVICE_REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
        throw new HttpError(401, 'This device has been revoked. Contact your administrator.');
    }

    const tenant = await authRepo.getTenantStatusById(device.tenant_id);
    if (!tenant || tenant.status === 'suspended' || tenant.status === 'cancelled') {
        res.clearCookie(DEVICE_REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
        throw new HttpError(403, "This company's account is currently suspended. Contact support.");
    }

    const newRefreshValue = generateRefreshTokenValue();
    const newSessionId = await deviceAuthRepo.createDeviceSession({
        deviceId: device.id,
        tokenHash: hashToken(newRefreshValue),
        expiresAt: deviceRefreshTokenExpiry(),
    });
    await deviceAuthRepo.revokeDeviceSession(stored.id, newSessionId);
    await kioskDevicesRepo.touchLastSync(device.id);

    res.cookie(DEVICE_REFRESH_COOKIE, newRefreshValue, deviceRefreshCookieOptions());
    const accessToken = signDeviceAccessToken({ deviceId: device.id, tenantId: device.tenant_id });
    res.json({ accessToken, device: { id: device.id, deviceName: device.device_name, tenantId: device.tenant_id } });
});

// POST /api/auth/change-password — identity comes from the verified token, not the body.
router.post('/change-password', authenticate, validateBody(changePasswordSchema), async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const fullUser = await usersRepo.getUserWithPassword(req.auth.userId);
    if (!fullUser) throw new HttpError(404, 'User not found');

    const matches = await bcrypt.compare(currentPassword, fullUser.password);
    if (!matches) throw new HttpError(400, 'Current password is incorrect');

    const hash = await bcrypt.hash(newPassword, 10);
    await authRepo.updateUserPassword(req.auth.userId, hash);

    // Force re-login everywhere else after a self-service password change.
    await authRepo.revokeAllUserRefreshTokens(req.auth.userId);

    res.json({ success: true, message: 'Password updated successfully' });
});

module.exports = router;

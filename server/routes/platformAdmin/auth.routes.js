const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const platformAdminRepo = require('../../repositories/platformAdmin.repository');
const {
    signPlatformAdminAccessToken,
    generateRefreshTokenValue,
    hashToken,
    platformAdminRefreshTokenExpiry,
} = require('../../utils/tokens');
const { authenticatePlatformAdmin } = require('../../middleware/platformAdminAuth');
const { HttpError } = require('../../middleware/errorHandler');
const { validateBody } = require('../../middleware/validate');
const { platformAdminLoginSchema, platformAdminChangePasswordSchema } = require('../../schemas');

const router = express.Router();

const REFRESH_COOKIE = 'mywe_platform_admin_refresh_token';
const REFRESH_COOKIE_PATH = '/api/platform-admin/auth';

// Far fewer legitimate platform admins than HRMS users, so a stricter
// per-IP window than the HRMS login's 20/15min is appropriate here.
const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
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
        maxAge: 1000 * 60 * 60 * 24 * parseInt(process.env.PLATFORM_ADMIN_REFRESH_TOKEN_TTL_DAYS || '7', 10),
    };
}

async function issueSession(res, admin) {
    const accessToken = signPlatformAdminAccessToken({ platformAdminId: admin.id });

    const refreshValue = generateRefreshTokenValue();
    await platformAdminRepo.createRefreshToken({
        platformAdminId: admin.id,
        tokenHash: hashToken(refreshValue),
        expiresAt: platformAdminRefreshTokenExpiry(),
    });

    res.cookie(REFRESH_COOKIE, refreshValue, refreshCookieOptions());

    const { password, ...publicAdmin } = admin;
    void password;
    return { accessToken, admin: publicAdmin };
}

// POST /api/platform-admin/auth/login — { email, password }
router.post('/login', loginRateLimiter, validateBody(platformAdminLoginSchema), async (req, res) => {
    const { email, password } = req.body;

    const admin = await platformAdminRepo.findByEmail(email);
    if (!admin || !admin.is_active) throw new HttpError(401, 'Invalid email or password');

    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
        throw new HttpError(429, 'Too many failed login attempts. Please try again in a few minutes.');
    }

    const passwordMatches = await bcrypt.compare(password, admin.password);
    if (!passwordMatches) {
        await platformAdminRepo.registerFailedLogin(admin.id);
        throw new HttpError(401, 'Invalid email or password');
    }
    await platformAdminRepo.clearFailedLogins(admin.id);

    const session = await issueSession(res, admin);
    res.json(session);
});

// POST /api/platform-admin/auth/refresh
router.post('/refresh', async (req, res) => {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (!presented) throw new HttpError(401, 'Not authenticated');

    const tokenHash = hashToken(presented);
    const stored = await platformAdminRepo.findRefreshTokenByHash(tokenHash);

    if (!stored) throw new HttpError(401, 'Session expired, please log in again');

    if (stored.revoked_at) {
        // Reuse of an already-rotated/logged-out token — treat as theft.
        await platformAdminRepo.revokeAllRefreshTokens(stored.platform_admin_id);
        res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
        throw new HttpError(401, 'Session invalidated, please log in again');
    }

    if (new Date(stored.expires_at) < new Date()) {
        throw new HttpError(401, 'Session expired, please log in again');
    }

    const admin = await platformAdminRepo.getById(stored.platform_admin_id);
    if (!admin || !admin.is_active) throw new HttpError(401, 'Session expired, please log in again');

    const accessToken = signPlatformAdminAccessToken({ platformAdminId: admin.id });

    const newRefreshValue = generateRefreshTokenValue();
    const newRefreshId = await platformAdminRepo.createRefreshToken({
        platformAdminId: admin.id,
        tokenHash: hashToken(newRefreshValue),
        expiresAt: platformAdminRefreshTokenExpiry(),
    });
    await platformAdminRepo.revokeRefreshToken(stored.id, newRefreshId);

    res.cookie(REFRESH_COOKIE, newRefreshValue, refreshCookieOptions());
    res.json({ accessToken, admin });
});

// POST /api/platform-admin/auth/logout
router.post('/logout', async (req, res) => {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (presented) {
        const stored = await platformAdminRepo.findRefreshTokenByHash(hashToken(presented));
        if (stored && !stored.revoked_at) {
            await platformAdminRepo.revokeRefreshToken(stored.id);
        }
    }
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    res.json({ success: true });
});

// POST /api/platform-admin/auth/change-password
router.post('/change-password', authenticatePlatformAdmin, validateBody(platformAdminChangePasswordSchema), async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const admin = await platformAdminRepo.getByIdWithPassword(req.platformAdmin.id);
    if (!admin) throw new HttpError(404, 'Platform admin not found');
    const matches = await bcrypt.compare(currentPassword, admin.password);
    if (!matches) throw new HttpError(400, 'Current password is incorrect');

    const hash = await bcrypt.hash(newPassword, 10);
    await platformAdminRepo.updatePassword(req.platformAdmin.id, hash);
    await platformAdminRepo.revokeAllRefreshTokens(req.platformAdmin.id);

    res.json({ success: true, message: 'Password updated successfully' });
});

module.exports = router;

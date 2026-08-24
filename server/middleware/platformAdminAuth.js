const jwt = require('jsonwebtoken');
const { getEnv } = require('../config/env');

// Verifies a Platform Admin access token — signed with its own secret
// (platformAdminJwtSecret), entirely separate from the HRMS's
// jwtAccessSecret (see middleware/auth.js). A platform admin has no
// `permissions` claim and no `tenantId`: authorization for this whole API
// surface is "is this a valid platform admin token", nothing finer-grained
// (see server/routes/platformAdmin — no requirePermission-style checks).
function authenticatePlatformAdmin(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const payload = jwt.verify(token, getEnv().platformAdminJwtSecret);
        if (payload.type !== 'platform_admin') {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        req.platformAdmin = { id: payload.sub };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

module.exports = { authenticatePlatformAdmin };

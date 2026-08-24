const jwt = require('jsonwebtoken');
const { getEnv } = require('../config/env');

// Verifies the access token and attaches the real, server-verified identity
// to req.auth. Nothing downstream should ever trust a client-supplied
// userId/role/tenantId again — this is the fix for the pre-Milestone-1 bug
// where every route trusted requesterId/requesterRole from the client.
//
// Two kinds of principal can hold a valid access token: a human user (`sub`
// set, from POST /api/auth/login|refresh) or a kiosk device (`deviceId`
// set, from POST /api/auth/kiosk-login|kiosk-refresh — see
// utils/tokens.js::signDeviceAccessToken). They're mutually exclusive by
// construction (only one of the two signing functions is ever used per
// token), so req.auth.userId is null for a device and req.auth.deviceId is
// null for a human.
function authenticate(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const payload = jwt.verify(token, getEnv().jwtAccessSecret);
        req.auth = payload.deviceId
            ? { userId: null, deviceId: payload.deviceId, tenantId: payload.tenantId, permissions: payload.permissions || [] }
            : { userId: payload.sub, deviceId: null, tenantId: payload.tenantId, permissions: payload.permissions || [] };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

module.exports = { authenticate };

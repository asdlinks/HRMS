// requirePermission/requireAnyPermission must run after authenticate() —
// they read req.auth.permissions, which authenticate() populates from the
// verified JWT (never from client-supplied data).

function requirePermission(code) {
    return (req, res, next) => {
        if (!req.auth?.permissions?.includes(code)) {
            return res.status(403).json({ error: 'You do not have permission to perform this action' });
        }
        next();
    };
}

function requireAnyPermission(codes) {
    return (req, res, next) => {
        const granted = req.auth?.permissions || [];
        if (!codes.some((code) => granted.includes(code))) {
            return res.status(403).json({ error: 'You do not have permission to perform this action' });
        }
        next();
    };
}

// Gates an entire route file on a menu_items.module row's is_feature_enabled
// flag (Settings > Menu Management) — distinct from a permission check: a
// tenant admin can turn a whole module off for everyone, not just hide it
// from the nav for one role. Short in-process TTL cache so this doesn't add
// a DB round-trip to every request in a module (permissions are free —
// baked into the JWT — this flag isn't, since it can change at any time).
const menuRepo = require('../repositories/menu.repository');
const FEATURE_FLAG_CACHE_TTL_MS = 30_000;
const featureFlagCache = new Map(); // `${tenantId}:${module}` -> { enabled, expiresAt }

function requireFeatureEnabled(moduleTag) {
    return async (req, res, next) => {
        const cacheKey = `${req.auth.tenantId}:${moduleTag}`;
        const cached = featureFlagCache.get(cacheKey);
        let enabled;
        if (cached && cached.expiresAt > Date.now()) {
            enabled = cached.enabled;
        } else {
            const row = await menuRepo.getModuleFeatureFlag(req.auth.tenantId, moduleTag);
            enabled = !row || row.is_feature_enabled !== false;
            featureFlagCache.set(cacheKey, { enabled, expiresAt: Date.now() + FEATURE_FLAG_CACHE_TTL_MS });
        }
        if (!enabled) {
            return res.status(403).json({ error: 'This feature is not enabled for your organization' });
        }
        next();
    };
}

// Re-checks tenant.status on every authenticated request, not just at
// login/refresh — a tenant suspended/cancelled mid-session would otherwise
// keep full API access until its access token naturally expires. Same short
// in-process TTL cache pattern as requireFeatureEnabled above, since tenant
// status is likewise not baked into the JWT.
const authRepo = require('../repositories/auth.repository');
const TENANT_STATUS_CACHE_TTL_MS = 30_000;
const tenantStatusCache = new Map(); // tenantId -> { status, expiresAt }

function requireActiveTenant() {
    return async (req, res, next) => {
        const tenantId = req.auth.tenantId;
        const cached = tenantStatusCache.get(tenantId);
        let status;
        if (cached && cached.expiresAt > Date.now()) {
            status = cached.status;
        } else {
            const tenant = await authRepo.getTenantStatusById(tenantId);
            status = tenant?.status;
            tenantStatusCache.set(tenantId, { status, expiresAt: Date.now() + TENANT_STATUS_CACHE_TTL_MS });
        }
        if (status === 'suspended' || status === 'cancelled') {
            return res.status(403).json({ error: 'This company\'s account is currently suspended. Contact support.' });
        }
        next();
    };
}

// Belt-and-suspenders guards on top of permission checks: kiosk-only routes
// (face check-in, embedding sync) and human-only routes (enrollment,
// policy/device administration) reject the other principal type even if a
// permission code were ever misconfigured to overlap between them.
function requireDevice() {
    return (req, res, next) => {
        if (!req.auth?.deviceId) {
            return res.status(403).json({ error: 'This endpoint is only accessible to a registered kiosk device' });
        }
        next();
    };
}

function requireHuman() {
    return (req, res, next) => {
        if (!req.auth?.userId) {
            return res.status(403).json({ error: 'This endpoint is not accessible to a kiosk device' });
        }
        next();
    };
}

module.exports = { requirePermission, requireAnyPermission, requireDevice, requireHuman, requireFeatureEnabled, requireActiveTenant };

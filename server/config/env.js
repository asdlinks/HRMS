require('dotenv').config();

// Parses the same ADO-style connection string format used by the migration
// scripts ("Server=host,port;Database=db;User Id=user;Password=pass;").
function parseConnectionString(connStr) {
    const parts = Object.fromEntries(
        connStr.split(';').filter(Boolean).map((kv) => {
            const idx = kv.indexOf('=');
            return [kv.slice(0, idx).trim().toLowerCase(), kv.slice(idx + 1).trim()];
        })
    );
    const [server, port] = (parts['server'] || '').split(',');
    return {
        server,
        port: port ? parseInt(port, 10) : 1433,
        database: parts['database'],
        user: parts['user id'] || parts['uid'],
        password: parts['password'] || parts['pwd'],
    };
}

function getDbConfig() {
    const base = process.env.MSSQL_CONNECTION_STRING
        ? parseConnectionString(process.env.MSSQL_CONNECTION_STRING)
        : {
            server: process.env.MSSQL_SERVER,
            port: process.env.MSSQL_PORT ? parseInt(process.env.MSSQL_PORT, 10) : 1433,
            database: process.env.MSSQL_DATABASE,
            user: process.env.MSSQL_USER,
            password: process.env.MSSQL_PASSWORD,
        };

    if (!base.server || !base.database || !base.user || !base.password) {
        throw new Error(
            'Missing SQL Server connection details. Set MSSQL_CONNECTION_STRING or MSSQL_SERVER/MSSQL_DATABASE/MSSQL_USER/MSSQL_PASSWORD.'
        );
    }

    return {
        ...base,
        options: {
            encrypt: process.env.MSSQL_ENCRYPT !== 'false',
            trustServerCertificate: process.env.MSSQL_TRUST_CERT !== 'false',
        },
    };
}

function required(name) {
    const val = process.env[name];
    if (!val) throw new Error(`Missing required environment variable: ${name}`);
    return val;
}

let cachedEnv = null;

// Validated once, at boot, so a misconfigured deployment fails immediately
// instead of failing unpredictably on the first request that needs a secret.
function getEnv() {
    if (cachedEnv) return cachedEnv;

    cachedEnv = {
        nodeEnv: process.env.NODE_ENV || 'development',
        isProduction: process.env.NODE_ENV === 'production',
        port: parseInt(process.env.PORT || '5001', 10),
        corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
        jwtAccessSecret: required('JWT_ACCESS_SECRET'),
        jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
        jwtAccessTtl: process.env.JWT_ACCESS_TTL || '15m',
        refreshTokenTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10),
        cookieSecret: required('COOKIE_SECRET'),
        // Platform Admin (Phase 9) uses an entirely separate JWT secret from
        // the HRMS's own jwtAccessSecret, so a leaked token from one portal is
        // structurally unusable against the other.
        platformAdminJwtSecret: required('PLATFORM_ADMIN_JWT_SECRET'),
        platformAdminAccessTtl: process.env.PLATFORM_ADMIN_ACCESS_TTL || '15m',
        platformAdminRefreshTokenTtlDays: parseInt(process.env.PLATFORM_ADMIN_REFRESH_TOKEN_TTL_DAYS || '7', 10),
        // Single shared Face Recognition kiosk deployment used by every tenant
        // (tenant identity comes from the company code entered at kiosk
        // pairing time, not the URL) — defaults new tenants' kiosk_app_config
        // so admins never have to know/enter it themselves. Optional: a
        // tenant without this set just sees a blank field, same as before.
        kioskAppUrl: process.env.KIOSK_APP_URL || null,
        db: getDbConfig(),
    };
    return cachedEnv;
}

module.exports = { getEnv, getDbConfig, parseConnectionString };

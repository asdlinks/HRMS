const { one, sql } = require('../db/sql');

// System Health (Part 8) — a concise, honest snapshot. This codebase has no
// job scheduler/cron infrastructure today, so "Background Jobs" and "Failed
// Scheduled Jobs" report that true state rather than fabricating a job
// runner that doesn't exist (confirmed decision — out of scope for this
// phase).
async function getSystemHealth() {
    const dbStart = process.hrtime.bigint();
    await one('SELECT 1 AS ok', {});
    const dbLatencyMs = Number(process.hrtime.bigint() - dbStart) / 1e6;

    const [tenantCounts, storage] = await Promise.all([
        one(
            `SELECT COUNT(*) AS active_tenants FROM tenants WHERE status = 'active'`,
            {}
        ),
        one(
            `SELECT ISNULL(SUM(size_bytes), 0) AS total_storage_bytes FROM company_document_versions`,
            {}
        ),
    ]);

    return {
        database: { status: 'ok', latencyMs: Math.round(dbLatencyMs) },
        api: { status: 'ok', uptimeSeconds: Math.round(process.uptime()) },
        backgroundJobs: { status: 'not_configured', message: 'No scheduled jobs configured', failedJobs: 0 },
        storageUsedBytes: storage.total_storage_bytes || 0,
        activeTenants: tenantCounts.active_tenants || 0,
    };
}

module.exports = { getSystemHealth };

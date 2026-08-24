const { many, run, sql } = require('../db/sql');

// Deliberately uses the plain (non-transactional) `run()` helper, never
// `transaction()` — this is written AFTER tenantProvisioning.service.js's own
// transaction has already committed or rolled back, so it must be a genuinely
// separate unit of work: if it were inside that same transaction, a rollback
// would erase the very row meant to record the failure that caused it.
function writeProvisioningLog({
    tenantId, requestedCompanyName, requestedSlug, platformAdminId,
    status, steps, errorMessage, startedAt, finishedAt,
}) {
    return run(
        `INSERT INTO provisioning_logs
            (tenant_id, requested_company_name, requested_slug, platform_admin_id, status, steps, error_message, started_at, finished_at)
         VALUES
            (@tenantId, @requestedCompanyName, @requestedSlug, @platformAdminId, @status, @steps, @errorMessage, @startedAt, @finishedAt)`,
        {
            tenantId: { type: sql.Int, value: tenantId || null },
            requestedCompanyName: { type: sql.NVarChar(255), value: requestedCompanyName },
            requestedSlug: { type: sql.NVarChar(100), value: requestedSlug },
            platformAdminId: { type: sql.Int, value: platformAdminId },
            status: { type: sql.NVarChar(20), value: status },
            steps: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(steps) },
            errorMessage: { type: sql.NVarChar(sql.MAX), value: errorMessage || null },
            startedAt: { type: sql.DateTime2, value: startedAt },
            finishedAt: { type: sql.DateTime2, value: finishedAt },
        }
    );
}

function listProvisioningLogs(tenantId) {
    return many(
        `SELECT pl.id, pl.tenant_id, pl.requested_company_name, pl.requested_slug, pl.status, pl.steps,
                pl.error_message, pl.started_at, pl.finished_at, pl.created_at,
                pa.name as platform_admin_name, pa.email as platform_admin_email
         FROM provisioning_logs pl
         JOIN platform_admins pa ON pa.id = pl.platform_admin_id
         WHERE pl.tenant_id = @tenantId
         ORDER BY pl.created_at DESC`,
        { tenantId: { type: sql.Int, value: tenantId } }
    );
}

module.exports = { writeProvisioningLog, listProvisioningLogs };

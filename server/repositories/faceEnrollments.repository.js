const { one, many, run, sql } = require('../db/sql');

// All active embeddings for a tenant — what the kiosk PWA caches locally
// for offline-capable client-side matching.
function listActiveForTenant(tenantId) {
    return many(
        `SELECT id, user_id, embedding, model_version, updated_at
         FROM face_enrollments WHERE tenant_id = @tenantId AND is_active = 1`,
        { tenantId: { type: sql.Int, value: tenantId } }
    );
}

function listForUser(tenantId, userId) {
    return many('SELECT * FROM face_enrollments WHERE tenant_id = @tenantId AND user_id = @userId ORDER BY created_at', {
        tenantId: { type: sql.Int, value: tenantId },
        userId: { type: sql.Int, value: userId },
    });
}

async function enroll(tenantId, userId, { embedding, modelVersion }) {
    const result = await run(
        `INSERT INTO face_enrollments (tenant_id, user_id, embedding, model_version)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @userId, @embedding, @modelVersion)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            userId: { type: sql.Int, value: userId },
            embedding: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(embedding) },
            modelVersion: { type: sql.NVarChar(50), value: modelVersion },
        }
    );
    return result.recordset[0].id;
}

function deactivate(tenantId, id) {
    return run('UPDATE face_enrollments SET is_active = 0, updated_at = SYSUTCDATETIME() WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

function deactivateAllForUser(tenantId, userId) {
    return run(
        'UPDATE face_enrollments SET is_active = 0, updated_at = SYSUTCDATETIME() WHERE tenant_id = @tenantId AND user_id = @userId AND is_active = 1',
        { tenantId: { type: sql.Int, value: tenantId }, userId: { type: sql.Int, value: userId } }
    );
}

module.exports = { listActiveForTenant, listForUser, enroll, deactivate, deactivateAllForUser };

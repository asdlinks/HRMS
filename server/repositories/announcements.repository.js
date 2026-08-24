const { many, run, sql } = require('../db/sql');

function listActive(tenantId) {
    return many(
        `SELECT a.id, a.title, a.body, a.created_at, u.name as author_name
         FROM announcements a
         JOIN users u ON a.created_by = u.id
         WHERE a.tenant_id = @tenantId AND a.is_active = 1
         ORDER BY a.created_at DESC`,
        { tenantId: { type: sql.Int, value: tenantId } }
    );
}

async function create(tenantId, createdBy, { title, body }) {
    const result = await run(
        `INSERT INTO announcements (tenant_id, title, body, created_by)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @title, @body, @createdBy)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            title: { type: sql.NVarChar(200), value: title },
            body: { type: sql.NVarChar(sql.MAX), value: body },
            createdBy: { type: sql.Int, value: createdBy },
        }
    );
    return result.recordset[0].id;
}

function retire(tenantId, id) {
    return run('UPDATE announcements SET is_active = 0 WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

module.exports = { listActive, create, retire };

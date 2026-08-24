const { one, many, run, sql } = require('../db/sql');

function listWorkModes(tenantId) {
    return many('SELECT * FROM work_modes WHERE tenant_id = @tenantId ORDER BY sort_order, name', {
        tenantId: { type: sql.Int, value: tenantId },
    });
}

function getWorkMode(tenantId, id) {
    return one('SELECT * FROM work_modes WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

// Resolves a free-text work-mode code (as already used by attendance.work_mode
// / workModeSelectSchema, e.g. 'WFH', 'Office') to its work_modes row for this
// tenant — case-insensitive so 'wfh'/'WFH' both match. Null if no match, in
// which case the caller simply leaves attendance.work_mode_id null.
function findByCode(tenantId, code) {
    if (!code) return null;
    return one('SELECT * FROM work_modes WHERE tenant_id = @tenantId AND LOWER(code) = LOWER(@code)', {
        tenantId: { type: sql.Int, value: tenantId },
        code: { type: sql.NVarChar(30), value: code },
    });
}

async function createWorkMode(tenantId, data) {
    const result = await run(
        `INSERT INTO work_modes (tenant_id, code, name, description, sort_order, is_active)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @code, @name, @description, @sortOrder, @isActive)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            code: { type: sql.NVarChar(30), value: data.code },
            name: { type: sql.NVarChar(100), value: data.name },
            description: { type: sql.NVarChar(255), value: data.description || null },
            sortOrder: { type: sql.Int, value: data.sort_order ?? 0 },
            isActive: { type: sql.Bit, value: data.is_active !== false },
        }
    );
    return result.recordset[0].id;
}

function updateWorkMode(tenantId, id, data) {
    return run(
        `UPDATE work_modes SET code = @code, name = @name, description = @description, sort_order = @sortOrder, is_active = @isActive
         WHERE tenant_id = @tenantId AND id = @id`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
            code: { type: sql.NVarChar(30), value: data.code },
            name: { type: sql.NVarChar(100), value: data.name },
            description: { type: sql.NVarChar(255), value: data.description || null },
            sortOrder: { type: sql.Int, value: data.sort_order ?? 0 },
            isActive: { type: sql.Bit, value: data.is_active !== false },
        }
    );
}

async function isWorkModeReferenced(tenantId, id) {
    const row = await one(
        `SELECT
            (SELECT COUNT(*) FROM users WHERE tenant_id = @tenantId AND default_work_mode_id = @id) +
            (SELECT COUNT(*) FROM attendance WHERE tenant_id = @tenantId AND work_mode_id = @id) AS refCount`,
        { tenantId: { type: sql.Int, value: tenantId }, id: { type: sql.Int, value: id } }
    );
    return row.refCount > 0;
}

function deleteWorkMode(tenantId, id) {
    return run('DELETE FROM work_modes WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

function assignDefaultWorkModeToUser(tenantId, userId, workModeId) {
    return run('UPDATE users SET default_work_mode_id = @workModeId WHERE tenant_id = @tenantId AND id = @userId', {
        tenantId: { type: sql.Int, value: tenantId },
        userId: { type: sql.Int, value: userId },
        workModeId: { type: sql.Int, value: workModeId },
    });
}

module.exports = {
    listWorkModes,
    getWorkMode,
    findByCode,
    createWorkMode,
    updateWorkMode,
    isWorkModeReferenced,
    deleteWorkMode,
    assignDefaultWorkModeToUser,
};

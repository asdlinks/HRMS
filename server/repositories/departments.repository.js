const { one, many, run, sql, isUniqueViolation } = require('../db/sql');

function listDepartments(tenantId) {
    return many('SELECT * FROM departments WHERE tenant_id = @tenantId', {
        tenantId: { type: sql.Int, value: tenantId },
    });
}

async function createDepartment(tenantId, name) {
    const result = await run(
        'INSERT INTO departments (tenant_id, name) OUTPUT INSERTED.id VALUES (@tenantId, @name)',
        { tenantId: { type: sql.Int, value: tenantId }, name: { type: sql.NVarChar(255), value: name } }
    );
    return result.recordset[0].id;
}

function countUsersInDepartment(tenantId, id) {
    return one('SELECT COUNT(*) as count FROM users WHERE tenant_id = @tenantId AND department_id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

function deleteDepartment(tenantId, id) {
    return run('DELETE FROM departments WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

module.exports = { listDepartments, createDepartment, countUsersInDepartment, deleteDepartment, isUniqueViolation };

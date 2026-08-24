const { one, many, run, sql } = require('../db/sql');

function listPolicies(tenantId) {
    return many('SELECT * FROM attendance_policies WHERE tenant_id = @tenantId ORDER BY name', {
        tenantId: { type: sql.Int, value: tenantId },
    });
}

function getPolicy(tenantId, id) {
    return one('SELECT * FROM attendance_policies WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

// The policy assigned to a user, joined off users.attendance_policy_id —
// null if the employee has no policy assigned yet.
function getPolicyForUser(tenantId, userId) {
    return one(
        `SELECT p.* FROM attendance_policies p
         JOIN users u ON u.attendance_policy_id = p.id
         WHERE u.tenant_id = @tenantId AND u.id = @userId AND p.is_active = 1`,
        { tenantId: { type: sql.Int, value: tenantId }, userId: { type: sql.Int, value: userId } }
    );
}

async function createPolicy(tenantId, data) {
    const result = await run(
        `INSERT INTO attendance_policies (tenant_id, name, policy_type, allowed_methods, config, is_active)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @name, @policyType, @allowedMethods, @config, @isActive)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            name: { type: sql.NVarChar(150), value: data.name },
            policyType: { type: sql.NVarChar(20), value: data.policy_type },
            allowedMethods: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(data.allowed_methods || []) },
            config: { type: sql.NVarChar(sql.MAX), value: data.config ? JSON.stringify(data.config) : null },
            isActive: { type: sql.Bit, value: data.is_active !== false },
        }
    );
    return result.recordset[0].id;
}

async function updatePolicy(tenantId, id, data) {
    const result = await run(
        `UPDATE attendance_policies
         SET name = @name, policy_type = @policyType, allowed_methods = @allowedMethods,
             config = @config, is_active = @isActive
         WHERE tenant_id = @tenantId AND id = @id`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
            name: { type: sql.NVarChar(150), value: data.name },
            policyType: { type: sql.NVarChar(20), value: data.policy_type },
            allowedMethods: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(data.allowed_methods || []) },
            config: { type: sql.NVarChar(sql.MAX), value: data.config ? JSON.stringify(data.config) : null },
            isActive: { type: sql.Bit, value: data.is_active !== false },
        }
    );
    return result.rowsAffected;
}

function deletePolicy(tenantId, id) {
    return run('DELETE FROM attendance_policies WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

function assignPolicyToUser(tenantId, userId, policyId) {
    return run('UPDATE users SET attendance_policy_id = @policyId WHERE tenant_id = @tenantId AND id = @userId', {
        tenantId: { type: sql.Int, value: tenantId },
        userId: { type: sql.Int, value: userId },
        policyId: { type: sql.Int, value: policyId },
    });
}

module.exports = {
    listPolicies,
    getPolicy,
    getPolicyForUser,
    createPolicy,
    updatePolicy,
    deletePolicy,
    assignPolicyToUser,
};

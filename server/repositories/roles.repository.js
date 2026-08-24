const { one, many, run, transaction, sql } = require('../db/sql');

function listPermissions() {
    return many('SELECT id, code, module, description FROM permissions ORDER BY module, code');
}

function listRoles(tenantId) {
    return many(
        `SELECT r.id, r.code, r.name, r.description, r.is_system,
                (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) as user_count
         FROM roles r WHERE r.tenant_id = @tenantId ORDER BY r.name`,
        { tenantId: { type: sql.Int, value: tenantId } }
    );
}

function getRolePermissionCodes(roleId) {
    return many(
        `SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = @roleId`,
        { roleId: { type: sql.Int, value: roleId } }
    ).then((rows) => rows.map((r) => r.code));
}

// cloneFromRoleId, when provided (and belonging to the same tenant), copies
// the source role's entire permission set into the newly created role — the
// "Clone from existing role" option in the New Role dialog.
async function createRole(tenantId, { name, description, cloneFromRoleId }) {
    const code = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 50);
    return transaction(async (tx) => {
        const result = await tx.run(
            `INSERT INTO roles (tenant_id, code, name, description, is_system)
             OUTPUT INSERTED.id VALUES (@tenantId, @code, @name, @description, 0)`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                code: { type: sql.NVarChar(50), value: code },
                name: { type: sql.NVarChar(100), value: name },
                description: { type: sql.NVarChar(500), value: description || null },
            }
        );
        const newRoleId = result.recordset[0].id;

        if (cloneFromRoleId) {
            const source = await tx.one('SELECT id FROM roles WHERE id = @sourceId AND tenant_id = @tenantId', {
                sourceId: { type: sql.Int, value: cloneFromRoleId },
                tenantId: { type: sql.Int, value: tenantId },
            });
            if (source) {
                await tx.run(
                    `INSERT INTO role_permissions (role_id, permission_id)
                     SELECT @newRoleId, permission_id FROM role_permissions WHERE role_id = @sourceRoleId`,
                    {
                        newRoleId: { type: sql.Int, value: newRoleId },
                        sourceRoleId: { type: sql.Int, value: cloneFromRoleId },
                    }
                );
            }
        }

        return newRoleId;
    });
}

// Looks up a role by its `code` (e.g. the legacy role string still
// collected on the user-creation form) so a brand-new user can be seeded
// into user_roles immediately — see users.routes.js POST / for why this
// matters: without it, a newly created user held zero real permissions
// until a second, separate PUT /users/:id/roles call.
function getRoleByCode(tenantId, code) {
    return one('SELECT id FROM roles WHERE tenant_id = @tenantId AND code = @code', {
        tenantId: { type: sql.Int, value: tenantId },
        code: { type: sql.NVarChar(50), value: code },
    });
}

function roleBelongsToTenant(tenantId, roleId) {
    return one('SELECT id, is_system FROM roles WHERE id = @roleId AND tenant_id = @tenantId', {
        tenantId: { type: sql.Int, value: tenantId },
        roleId: { type: sql.Int, value: roleId },
    });
}

// Replaces the full permission set for a role in one transaction.
function setRolePermissions(roleId, permissionCodes) {
    return transaction(async (tx) => {
        await tx.run('DELETE FROM role_permissions WHERE role_id = @roleId', {
            roleId: { type: sql.Int, value: roleId },
        });
        if (permissionCodes.length === 0) return;

        const permissions = await tx.many(
            `SELECT id, code FROM permissions WHERE code IN (${permissionCodes.map((_, i) => `@code${i}`).join(',')})`,
            Object.fromEntries(permissionCodes.map((code, i) => [`code${i}`, { type: sql.NVarChar(100), value: code }]))
        );
        for (const p of permissions) {
            await tx.run('INSERT INTO role_permissions (role_id, permission_id) VALUES (@roleId, @permissionId)', {
                roleId: { type: sql.Int, value: roleId },
                permissionId: { type: sql.Int, value: p.id },
            });
        }
    });
}

function deleteRole(tenantId, roleId) {
    return run('DELETE FROM roles WHERE id = @roleId AND tenant_id = @tenantId AND is_system = 0', {
        tenantId: { type: sql.Int, value: tenantId },
        roleId: { type: sql.Int, value: roleId },
    });
}

// Assigns one or more roles to a user, replacing any roles they currently
// hold (full-replace, matching setRolePermissions's own delete-all/insert-all
// pattern above) — the schema (user_roles's composite PK) and the login
// permission-union query have always supported multiple roles per user; this
// is the one place that used to artificially collapse it to one.
function setUserRoles(tenantId, userId, roleIds) {
    return transaction(async (tx) => {
        const { HttpError } = require('../middleware/errorHandler');

        // Without this check a caller could assign a role from a different
        // tenant — userId is verified the same way below.
        const uniqueRoleIds = [...new Set(roleIds.map(Number))];
        if (uniqueRoleIds.length > 0) {
            const roles = await tx.many(
                `SELECT id FROM roles WHERE tenant_id = @tenantId AND id IN (${uniqueRoleIds.map((_, i) => `@role${i}`).join(',')})`,
                Object.fromEntries([
                    ['tenantId', { type: sql.Int, value: tenantId }],
                    ...uniqueRoleIds.map((id, i) => [`role${i}`, { type: sql.Int, value: id }]),
                ])
            );
            if (roles.length !== uniqueRoleIds.length) throw new HttpError(404, 'One or more roles not found');
        }

        const user = await tx.one('SELECT id FROM users WHERE id = @userId AND tenant_id = @tenantId', {
            tenantId: { type: sql.Int, value: tenantId },
            userId: { type: sql.Int, value: userId },
        });
        if (!user) throw new HttpError(404, 'User not found');

        await tx.run('DELETE FROM user_roles WHERE user_id = @userId', { userId: { type: sql.Int, value: userId } });
        for (const roleId of uniqueRoleIds) {
            await tx.run('INSERT INTO user_roles (user_id, role_id) VALUES (@userId, @roleId)', {
                userId: { type: sql.Int, value: userId },
                roleId: { type: sql.Int, value: roleId },
            });
        }
    });
}

module.exports = {
    listPermissions,
    listRoles,
    getRolePermissionCodes,
    createRole,
    getRoleByCode,
    roleBelongsToTenant,
    setRolePermissions,
    deleteRole,
    setUserRoles,
};

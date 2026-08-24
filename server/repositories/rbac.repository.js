const { many, sql } = require('../db/sql');

// Flat set of permission codes granted to a user across all their roles.
async function getPermissionCodesForUser(userId) {
    const rows = await many(
        `SELECT DISTINCT p.code
         FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE ur.user_id = @userId`,
        { userId: { type: sql.Int, value: userId } }
    );
    return rows.map((r) => r.code);
}

module.exports = { getPermissionCodesForUser };

// One-time, idempotent seed: creates the 4 default tenant roles matching the
// pre-Milestone-1 users.role values, grants each the permission set that
// reproduces today's actual route/menu access exactly (verified against
// server/index.js and every client role check), and assigns each existing
// user to the role matching their current users.role — so nobody's access
// changes as a direct result of the RBAC cutover. Safe to re-run: every
// insert is guarded by an existence check.
//
// Usage:
//   MSSQL_CONNECTION_STRING="Server=host,port;Database=db;User Id=user;Password=pass;" \
//     node server/migrations/mssql/005_seed_rbac_assignments.js
const path = require('path');
const sql = require('mssql');
const { getDbConfig } = require(path.join(__dirname, '..', '..', 'config', 'env'));

// Permissions granted to each legacy role. Derived from the pre-cutover
// route guards (server/index.js) and client role checks (App.jsx routes,
// Sidebar.jsx links) — this is a parity mapping, not a redesign. A System
// Administrator can freely edit role_permissions after this seed runs.
const ROLE_PERMISSIONS = {
    employee: [
        'leaves.view.own', 'leaves.apply.own', 'attendance.checkin',
        'users.view.directory', 'notifications.manage', 'voice.use',
    ],
    manager: [
        'leaves.view.own', 'leaves.view.team', 'leaves.apply.own', 'leaves.approve', 'leaves.cancel.any',
        'attendance.checkin', 'attendance.view.team',
        'users.view.directory', 'users.view.team', 'users.manage',
        'holidays.manage', 'settings.manage', 'reports.view', 'notifications.manage', 'voice.use',
    ],
    hr: [
        'leaves.view.own', 'leaves.view.all', 'leaves.apply.own', 'leaves.approve', 'leaves.cancel.any',
        'attendance.checkin', 'attendance.view.team',
        'users.view.directory', 'users.view.all', 'users.manage', 'users.password.reset',
        'departments.manage', 'locations.manage', 'holidays.manage',
        'settings.manage', 'reports.view', 'notifications.manage', 'voice.use',
    ],
    super_admin: [
        'leaves.view.own', 'leaves.view.team', 'leaves.view.all', 'leaves.apply.own', 'leaves.apply.any',
        'leaves.approve', 'leaves.cancel.any',
        'attendance.checkin', 'attendance.view.team',
        'users.view.directory', 'users.view.team', 'users.view.all', 'users.manage', 'users.password.reset',
        'departments.manage', 'locations.manage', 'holidays.manage',
        'settings.manage', 'reports.view', 'notifications.manage', 'voice.use',
    ],
};

const ROLE_NAMES = {
    employee: 'Employee',
    manager: 'Manager',
    hr: 'HR',
    super_admin: 'Super Admin',
};

async function main() {
    const pool = await new sql.ConnectionPool(getDbConfig()).connect();

    try {
        const tenants = (await pool.request().query('SELECT id, slug FROM tenants')).recordset;
        if (tenants.length === 0) {
            console.log('No tenants found — nothing to seed.');
            return;
        }

        const permissions = (await pool.request().query('SELECT id, code FROM permissions')).recordset;
        const permissionIdByCode = new Map(permissions.map((p) => [p.code, p.id]));

        for (const tenant of tenants) {
            console.log(`Seeding RBAC for tenant "${tenant.slug}" (id ${tenant.id})...`);
            const roleIdByCode = {};

            for (const [roleCode, name] of Object.entries(ROLE_NAMES)) {
                let role = await pool.request()
                    .input('tenantId', sql.Int, tenant.id)
                    .input('code', sql.NVarChar(50), roleCode)
                    .query('SELECT id FROM roles WHERE tenant_id = @tenantId AND code = @code');

                let roleId;
                if (role.recordset.length === 0) {
                    const inserted = await pool.request()
                        .input('tenantId', sql.Int, tenant.id)
                        .input('code', sql.NVarChar(50), roleCode)
                        .input('name', sql.NVarChar(100), name)
                        .query(
                            'INSERT INTO roles (tenant_id, code, name, is_system) OUTPUT INSERTED.id VALUES (@tenantId, @code, @name, 1)'
                        );
                    roleId = inserted.recordset[0].id;
                    console.log(`  created role "${name}" (id ${roleId})`);
                } else {
                    roleId = role.recordset[0].id;
                }
                roleIdByCode[roleCode] = roleId;

                const grantedCodes = ROLE_PERMISSIONS[roleCode];
                for (const code of grantedCodes) {
                    const permissionId = permissionIdByCode.get(code);
                    if (!permissionId) {
                        console.warn(`  WARNING: permission code "${code}" not found in permissions table, skipping`);
                        continue;
                    }
                    const existing = await pool.request()
                        .input('roleId', sql.Int, roleId)
                        .input('permissionId', sql.Int, permissionId)
                        .query('SELECT 1 FROM role_permissions WHERE role_id = @roleId AND permission_id = @permissionId');
                    if (existing.recordset.length === 0) {
                        await pool.request()
                            .input('roleId', sql.Int, roleId)
                            .input('permissionId', sql.Int, permissionId)
                            .query('INSERT INTO role_permissions (role_id, permission_id) VALUES (@roleId, @permissionId)');
                    }
                }
            }

            const users = (await pool.request()
                .input('tenantId', sql.Int, tenant.id)
                .query('SELECT id, role FROM users WHERE tenant_id = @tenantId')).recordset;

            let assigned = 0;
            for (const user of users) {
                const roleId = roleIdByCode[user.role];
                if (!roleId) {
                    console.warn(`  WARNING: user ${user.id} has unrecognized legacy role "${user.role}", not assigned`);
                    continue;
                }
                const existing = await pool.request()
                    .input('userId', sql.Int, user.id)
                    .input('roleId', sql.Int, roleId)
                    .query('SELECT 1 FROM user_roles WHERE user_id = @userId AND role_id = @roleId');
                if (existing.recordset.length === 0) {
                    await pool.request()
                        .input('userId', sql.Int, user.id)
                        .input('roleId', sql.Int, roleId)
                        .query('INSERT INTO user_roles (user_id, role_id) VALUES (@userId, @roleId)');
                    assigned++;
                }
            }
            console.log(`  ${users.length} users checked, ${assigned} new role assignment(s) created`);
        }

        console.log('RBAC seed complete.');
    } finally {
        await pool.close();
    }
}

main().catch((err) => {
    console.error('RBAC seed failed:', err.message);
    process.exit(1);
});

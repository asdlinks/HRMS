const { one, many, run, transaction, sql, isUniqueViolation } = require('../db/sql');

// Every user column except the password hash, which must never be selected
// into a list/detail response — only getUserWithPassword (used solely for
// bcrypt.compare) is allowed to touch that column. `designation` (the legacy
// free-text column) is deliberately EXCLUDED here — the mssql/tedious driver
// returns duplicate column names as an array rather than "last one wins", so
// selecting both `users.designation` and `designations.name as designation`
// would corrupt the field. ORG_STRUCTURE_JOIN_COLUMNS below is the only
// source of the `designation` field in every query that uses this constant.
// aadhaar_number/pan_number are deliberately EXCLUDED here, same reasoning
// as the password hash — only getUserPii (gated by users.pii.manage in the
// route layer) may select them.
const SAFE_USER_COLUMNS = `id, tenant_id, employee_id, name, email, role, department_id,
    manager_id, probation_period, joining_date, date_of_birth, profile_photo, location_id, created_at, probation_message_shown,
    attendance_policy_id, status, exit_date, locked_until,
    designation_id, employment_type_id`;

// Appended after SAFE_USER_COLUMNS in every SELECT below. `designation` is
// sourced from the FK join, not the (excluded) legacy text column — this
// keeps every existing consumer of `.designation` (CSV export, OrgTree,
// managerOptions, profile page) working unchanged now that Designation is
// FK-backed (031_org_structure.sql) instead of free text.
const ORG_STRUCTURE_JOIN_COLUMNS = `designations.name as designation,
    employment_types.name as employment_type_name`;

function orgStructureJoins(alias) {
    return `LEFT JOIN designations ON ${alias}.designation_id = designations.id
        LEFT JOIN employment_types ON ${alias}.employment_type_id = employment_types.id`;
}

// Comma-separated role ids/names for a user, sourced from user_roles now
// that a user can hold more than one. `alias` is the outer query's row
// reference (`users` in the flat query, `descendants` inside the team CTE).
// role_ids lets the client pre-select a user's current roles by id (names
// alone aren't a safe key to round-trip); role_names is for display.
//
// This is the FOR XML PATH string-concatenation idiom, not STRING_AGG — the
// dev/prod target here is SQL Server 2016 (compatibility level 130), and
// STRING_AGG only exists from SQL Server 2017 onward. The `TYPE` +
// `.value('.', 'NVARCHAR(MAX)')` pair avoids FOR XML PATH's default HTML-
// entity-escaping of role names containing &, <, > etc.
function roleNamesSubquery(alias) {
    return `(SELECT STUFF((
            SELECT ',' + CAST(ur.role_id AS NVARCHAR(20))
            FROM user_roles ur WHERE ur.user_id = ${alias}.id
            FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 1, '')) as role_ids,
        (SELECT STUFF((
            SELECT ', ' + r.name
            FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ${alias}.id
            FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')) as role_names`;
}

// Minimal id/name list — used to resolve names mentioned in voice commands.
// Employee-limit enforcement (Phase 13E, Part 10) — same super_admin
// exclusion convention used throughout this file (listUsers, listForReport,
// etc.), since the seeded Organization Administrator account isn't counted
// as an "employee" anywhere else either.
async function countEmployees(tenantId) {
    const row = await one(`SELECT COUNT(*) as count FROM users WHERE tenant_id = @tenantId AND role != 'super_admin'`, {
        tenantId: { type: sql.Int, value: tenantId },
    });
    return row.count;
}

function listIdName(tenantId) {
    return many('SELECT id, name FROM users WHERE tenant_id = @tenantId', {
        tenantId: { type: sql.Int, value: tenantId },
    });
}

function getUserWithPassword(id) {
    return one('SELECT * FROM users WHERE id = @id', { id: { type: sql.Int, value: id } });
}

// scope: 'all' lists everyone in the tenant; 'team' walks the manager
// hierarchy under requesterId (direct + indirect reports), mirroring the
// pre-Milestone-1 WITH RECURSIVE query. Both exclude super_admin from the
// results, matching existing behavior.
async function listUsers(tenantId, { scope, requesterId, departmentId } = {}) {
    if (scope === 'team') {
        let query = `
            WITH descendants AS (
                SELECT ${SAFE_USER_COLUMNS} FROM users WHERE id = @requesterId AND tenant_id = @tenantId
                UNION ALL
                SELECT ${SAFE_USER_COLUMNS.split(',').map((c) => `u.${c.trim()}`).join(', ')} FROM users u
                JOIN descendants d ON u.manager_id = d.id
                WHERE u.tenant_id = @tenantId
            )
            SELECT descendants.*, departments.name as department_name, m.name as manager_name, locations.name as location_name,
                   attendance_policies.name as attendance_policy_name,
                   ${ORG_STRUCTURE_JOIN_COLUMNS},
                   CAST(CASE WHEN EXISTS (
                       SELECT 1 FROM face_enrollments fe WHERE fe.user_id = descendants.id AND fe.is_active = 1
                   ) THEN 1 ELSE 0 END AS BIT) as has_face_enrollment,
                   ${roleNamesSubquery('descendants')}
            FROM descendants
            LEFT JOIN departments ON descendants.department_id = departments.id
            LEFT JOIN users as m ON descendants.manager_id = m.id
            LEFT JOIN locations ON descendants.location_id = locations.id
            LEFT JOIN attendance_policies ON descendants.attendance_policy_id = attendance_policies.id
            ${orgStructureJoins('descendants')}
            WHERE descendants.role != 'super_admin'
        `;
        const params = {
            tenantId: { type: sql.Int, value: tenantId },
            requesterId: { type: sql.Int, value: requesterId },
        };
        if (departmentId && departmentId !== 'all') {
            query += ' AND descendants.department_id = @departmentId';
            params.departmentId = { type: sql.Int, value: departmentId };
        }
        return many(query, params);
    }

    let query = `
        SELECT ${SAFE_USER_COLUMNS.split(',').map((c) => `users.${c.trim()}`).join(', ')},
               departments.name as department_name, manager.name as manager_name, locations.name as location_name,
               attendance_policies.name as attendance_policy_name,
               ${ORG_STRUCTURE_JOIN_COLUMNS},
               CAST(CASE WHEN EXISTS (
                   SELECT 1 FROM face_enrollments fe WHERE fe.user_id = users.id AND fe.is_active = 1
               ) THEN 1 ELSE 0 END AS BIT) as has_face_enrollment,
               ${roleNamesSubquery('users')}
        FROM users
        LEFT JOIN departments ON users.department_id = departments.id
        LEFT JOIN users as manager ON users.manager_id = manager.id
        LEFT JOIN locations ON users.location_id = locations.id
        LEFT JOIN attendance_policies ON users.attendance_policy_id = attendance_policies.id
        ${orgStructureJoins('users')}
        WHERE users.tenant_id = @tenantId AND users.role != 'super_admin'
    `;
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    if (departmentId && departmentId !== 'all') {
        query += ' AND users.department_id = @departmentId';
        params.departmentId = { type: sql.Int, value: departmentId };
    }
    return many(query, params);
}

// Slim user list for the monthly report: everyone in the tenant (optionally
// filtered by department), or just managerUserId + their direct reports
// when the caller only has team-level report access.
function listForReport(tenantId, { departmentId, managerUserId, branchId, employmentTypeId } = {}) {
    let query = `SELECT id as user_id, name as user_name, employee_id, location_id, department_id, employment_type_id
                 FROM users WHERE tenant_id = @tenantId AND role != 'super_admin'`;
    const params = { tenantId: { type: sql.Int, value: tenantId } };

    if (departmentId && departmentId !== 'all') {
        query += ' AND department_id = @departmentId';
        params.departmentId = { type: sql.Int, value: departmentId };
    }
    if (branchId && branchId !== 'all') {
        query += ' AND location_id = @branchId';
        params.branchId = { type: sql.Int, value: branchId };
    }
    if (employmentTypeId && employmentTypeId !== 'all') {
        query += ' AND employment_type_id = @employmentTypeId';
        params.employmentTypeId = { type: sql.Int, value: employmentTypeId };
    }
    if (managerUserId) {
        query += ' AND (manager_id = @managerUserId OR id = @managerUserId)';
        params.managerUserId = { type: sql.Int, value: managerUserId };
    }
    return many(query, params);
}

function getUserById(tenantId, id) {
    return one(
        `SELECT ${SAFE_USER_COLUMNS.split(',').map((c) => `users.${c.trim()}`).join(', ')},
                departments.name as department_name, locations.name as location_name,
                ${ORG_STRUCTURE_JOIN_COLUMNS},
                ${roleNamesSubquery('users')}
         FROM users
         LEFT JOIN departments ON users.department_id = departments.id
         LEFT JOIN locations ON users.location_id = locations.id
         ${orgStructureJoins('users')}
         WHERE users.tenant_id = @tenantId AND users.id = @id`,
        { tenantId: { type: sql.Int, value: tenantId }, id: { type: sql.Int, value: id } }
    );
}

// Disable/re-enable/offboard a user. Deliberately separate from updateUser's
// UPDATABLE_COLUMNS allowlist — status changes go through this one purpose-
// built function (and its own permission-adjacent route) rather than the
// general PATCH, mirroring why `role` is excluded from that same allowlist.
function updateUserStatus(tenantId, id, status, exitDate) {
    return run(
        `UPDATE users SET status = @status, exit_date = @exitDate WHERE id = @id AND tenant_id = @tenantId`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
            status: { type: sql.NVarChar(20), value: status },
            exitDate: { type: sql.Date, value: status === 'exited' ? (exitDate || new Date()) : null },
        }
    );
}

async function createUser(tenantId, data, passwordHash) {
    const result = await run(
        `INSERT INTO users (tenant_id, name, email, password, role, designation, department_id, manager_id,
                             employee_id, probation_period, joining_date, date_of_birth, profile_photo, location_id,
                             designation_id, employment_type_id, aadhaar_number, pan_number)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @name, @email, @password, @role, @designation, @departmentId, @managerId,
                 @employeeId, @probationPeriod, @joiningDate, @dateOfBirth, @profilePhoto, @locationId,
                 @designationId, @employmentTypeId, @aadhaarNumber, @panNumber)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            name: { type: sql.NVarChar(255), value: data.name },
            email: { type: sql.NVarChar(255), value: data.email },
            password: { type: sql.NVarChar(255), value: passwordHash },
            role: { type: sql.NVarChar(20), value: data.role },
            designation: { type: sql.NVarChar(255), value: data.designation || null },
            departmentId: { type: sql.Int, value: data.department_id || null },
            managerId: { type: sql.Int, value: data.manager_id || null },
            employeeId: { type: sql.NVarChar(50), value: data.employee_id || null },
            probationPeriod: { type: sql.Int, value: data.probation_period || 0 },
            joiningDate: { type: sql.Date, value: data.joining_date || null },
            dateOfBirth: { type: sql.Date, value: data.date_of_birth || null },
            profilePhoto: { type: sql.NVarChar(500), value: data.profile_photo || null },
            locationId: { type: sql.Int, value: data.location_id || null },
            designationId: { type: sql.Int, value: data.designation_id || null },
            employmentTypeId: { type: sql.Int, value: data.employment_type_id || null },
            aadhaarNumber: { type: sql.NVarChar(20), value: data.aadhaar_number || null },
            panNumber: { type: sql.NVarChar(20), value: data.pan_number || null },
        }
    );
    return result.recordset[0].id;
}

// aadhaar_number/pan_number live outside SAFE_USER_COLUMNS — only reachable
// through this function, called from the route layer when the requester
// holds users.pii.manage.
function getUserPii(tenantId, id) {
    return one('SELECT id, aadhaar_number, pan_number FROM users WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

// Separate UPDATE statement, not folded into updateUser/UPDATABLE_COLUMNS —
// the general PATCH /users/:id route must never be able to reach these two
// columns; only PATCH /users/:id/pii (users.pii.manage) calls this.
function updateUserPii(tenantId, id, data) {
    return run(
        `UPDATE users SET aadhaar_number = @aadhaarNumber, pan_number = @panNumber
         WHERE id = @id AND tenant_id = @tenantId`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
            aadhaarNumber: { type: sql.NVarChar(20), value: data.aadhaar_number || null },
            panNumber: { type: sql.NVarChar(20), value: data.pan_number || null },
        }
    );
}

// Banking fields (Phase 13B) — like aadhaar_number/pan_number, deliberately
// excluded from SAFE_USER_COLUMNS (sensitive financial data never belongs in
// the directory/list response). Reachable only through these functions,
// called from the route layer when the requester holds payroll.assign — the
// same permission that always gated bank details before they moved here.
function getUserBanking(tenantId, id) {
    return one(
        `SELECT id, bank_account_holder_name, bank_name, bank_branch, bank_account_number, bank_ifsc_code, bank_upi_id
         FROM users WHERE tenant_id = @tenantId AND id = @id`,
        { tenantId: { type: sql.Int, value: tenantId }, id: { type: sql.Int, value: id } }
    );
}

// Batch variant for the payroll pre-flight completeness check — one query
// for every employee in a run instead of one per employee.
function listBankingByUserIds(tenantId, userIds) {
    if (!userIds.length) return Promise.resolve([]);
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    const placeholders = userIds.map((id, i) => {
        const key = `id${i}`;
        params[key] = { type: sql.Int, value: id };
        return `@${key}`;
    });
    return many(
        `SELECT id, name, bank_account_holder_name, bank_name, bank_branch, bank_account_number, bank_ifsc_code, bank_upi_id
         FROM users WHERE tenant_id = @tenantId AND id IN (${placeholders.join(', ')})`,
        params
    );
}

// Separate UPDATE statement, not folded into updateUser/UPDATABLE_COLUMNS —
// the general PATCH /users/:id route must never be able to reach these
// columns; only PATCH /users/:id/banking (payroll.assign) calls this.
function updateUserBanking(tenantId, id, data) {
    return run(
        `UPDATE users SET
            bank_account_holder_name = @bankAccountHolderName,
            bank_name = @bankName,
            bank_branch = @bankBranch,
            bank_account_number = @bankAccountNumber,
            bank_ifsc_code = @bankIfscCode,
            bank_upi_id = @bankUpiId
         WHERE id = @id AND tenant_id = @tenantId`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
            bankAccountHolderName: { type: sql.NVarChar(150), value: data.bank_account_holder_name || null },
            bankName: { type: sql.NVarChar(150), value: data.bank_name || null },
            bankBranch: { type: sql.NVarChar(150), value: data.bank_branch || null },
            bankAccountNumber: { type: sql.NVarChar(50), value: data.bank_account_number || null },
            bankIfscCode: { type: sql.NVarChar(20), value: data.bank_ifsc_code || null },
            bankUpiId: { type: sql.NVarChar(100), value: data.bank_upi_id || null },
        }
    );
}

// Columns a client is allowed to update directly; anything else (join
// aliases, ids, etc.) sent in the request body is silently dropped.
// `role` is deliberately NOT here — it must only change via
// PUT /users/:id/roles (roles.manage), otherwise any users.manage holder
// could PATCH themselves or anyone else to super_admin.
const UPDATABLE_COLUMNS = new Set([
    'employee_id', 'name', 'email', 'designation', 'department_id', 'manager_id',
    'probation_period', 'joining_date', 'date_of_birth', 'profile_photo', 'location_id', 'probation_message_shown',
    'designation_id', 'employment_type_id',
]);

async function updateUser(tenantId, id, updates) {
    const entries = Object.entries(updates).filter(([key]) => UPDATABLE_COLUMNS.has(key));
    if (entries.length === 0) {
        throw new (require('../middleware/errorHandler').HttpError)(400, 'No update data provided');
    }

    const setClauses = [];
    const params = { tenantId: { type: sql.Int, value: tenantId }, id: { type: sql.Int, value: id } };
    entries.forEach(([key, value], idx) => {
        const paramName = `p${idx}`;
        setClauses.push(`${key} = @${paramName}`);
        // '' is how an unset MUI Select reaches here (e.g. no employment type
        // chosen) — for an INT FK column SQL Server implicitly converts '' to
        // 0, which then fails the FK constraint since there's no id=0 row.
        // Treat it the same as null/undefined instead of passing it through.
        params[paramName] = value === null || value === undefined || value === ''
            ? { type: sql.NVarChar(sql.MAX), value: null }
            : value;
    });

    const result = await run(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = @id AND tenant_id = @tenantId`,
        params
    );
    return result.rowsAffected;
}

function deleteUser(tenantId, id) {
    return transaction(async (tx) => {
        const params = { tenantId: { type: sql.Int, value: tenantId }, id: { type: sql.Int, value: id } };
        await tx.run('DELETE FROM notifications WHERE user_id = @id AND tenant_id = @tenantId', params);
        await tx.run('DELETE FROM attendance WHERE user_id = @id AND tenant_id = @tenantId', params);
        await tx.run('DELETE FROM leaves WHERE user_id = @id AND tenant_id = @tenantId', params);
        await tx.run('UPDATE users SET manager_id = NULL WHERE manager_id = @id AND tenant_id = @tenantId', params);
        await tx.run('DELETE FROM refresh_tokens WHERE user_id = @id', params);
        await tx.run('DELETE FROM user_roles WHERE user_id = @id', params);
        const result = await tx.run('DELETE FROM users WHERE id = @id AND tenant_id = @tenantId', params);
        return result.rowsAffected;
    });
}

module.exports = {
    getUserWithPassword,
    listIdName,
    listUsers,
    listForReport,
    getUserById,
    createUser,
    updateUser,
    updateUserStatus,
    deleteUser,
    getUserPii,
    updateUserPii,
    getUserBanking,
    updateUserBanking,
    listBankingByUserIds,
    countEmployees,
    isUniqueViolation,
};

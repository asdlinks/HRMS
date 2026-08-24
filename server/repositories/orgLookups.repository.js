const { one, many, run, sql, isUniqueViolation } = require('../db/sql');

// Shared CRUD shape for the flat org-structure lookup tables (designations,
// employment_types, employee_categories) — all identical
// (tenant_id, name, code, description, is_active), same pattern as
// departments.repository.js/locations.repository.js but parameterized so
// the 4 modules don't need 4 copy-pasted files. `tableName`/`userFkColumn`
// are internal constants (never client input), so string-interpolating them
// into the query is safe — same precedent as users.repository.js's
// roleNamesSubquery.
function createLookupRepo(tableName, userFkColumn) {
    function list(tenantId) {
        return many(`SELECT * FROM ${tableName} WHERE tenant_id = @tenantId ORDER BY name ASC`, {
            tenantId: { type: sql.Int, value: tenantId },
        });
    }

    function get(tenantId, id) {
        return one(`SELECT * FROM ${tableName} WHERE tenant_id = @tenantId AND id = @id`, {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
        });
    }

    async function create(tenantId, data) {
        const result = await run(
            `INSERT INTO ${tableName} (tenant_id, name, code, description, is_active)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @name, @code, @description, @isActive)`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                name: { type: sql.NVarChar(150), value: data.name },
                code: { type: sql.NVarChar(20), value: data.code || null },
                description: { type: sql.NVarChar(500), value: data.description || null },
                isActive: { type: sql.Bit, value: data.is_active ?? true },
            }
        );
        return result.recordset[0].id;
    }

    function update(tenantId, id, data) {
        return run(
            `UPDATE ${tableName} SET name = @name, code = @code, description = @description,
                is_active = @isActive, updated_at = SYSUTCDATETIME()
             WHERE tenant_id = @tenantId AND id = @id`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                id: { type: sql.Int, value: id },
                name: { type: sql.NVarChar(150), value: data.name },
                code: { type: sql.NVarChar(20), value: data.code || null },
                description: { type: sql.NVarChar(500), value: data.description || null },
                isActive: { type: sql.Bit, value: data.is_active ?? true },
            }
        );
    }

    function countUsersReferencing(tenantId, id) {
        return one(`SELECT COUNT(*) as count FROM users WHERE tenant_id = @tenantId AND ${userFkColumn} = @id`, {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
        });
    }

    function remove(tenantId, id) {
        return run(`DELETE FROM ${tableName} WHERE tenant_id = @tenantId AND id = @id`, {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
        });
    }

    return { list, get, create, update, remove, countUsersReferencing, isUniqueViolation };
}

module.exports = {
    createLookupRepo,
    designationsRepo: createLookupRepo('designations', 'designation_id'),
    employmentTypesRepo: createLookupRepo('employment_types', 'employment_type_id'),
};

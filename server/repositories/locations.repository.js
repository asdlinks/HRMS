const { one, many, run, sql, isUniqueViolation } = require('../db/sql');

function listLocations(tenantId) {
    return many('SELECT * FROM locations WHERE tenant_id = @tenantId ORDER BY name ASC', {
        tenantId: { type: sql.Int, value: tenantId },
    });
}

function getLocation(tenantId, id) {
    return one('SELECT * FROM locations WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

// `name` kept as a plain positional arg (rather than folded into `data`) so
// every pre-existing call site — including the bare-name path other modules
// might still use — keeps working; Branch's richer fields are optional.
async function createLocation(tenantId, name, data = {}) {
    const result = await run(
        `INSERT INTO locations (tenant_id, name, code, address, city, state, country, is_active)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @name, @code, @address, @city, @state, @country, @isActive)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            name: { type: sql.NVarChar(255), value: name },
            code: { type: sql.NVarChar(20), value: data.code || null },
            address: { type: sql.NVarChar(500), value: data.address || null },
            city: { type: sql.NVarChar(100), value: data.city || null },
            state: { type: sql.NVarChar(100), value: data.state || null },
            country: { type: sql.NVarChar(100), value: data.country || null },
            isActive: { type: sql.Bit, value: data.is_active ?? true },
        }
    );
    return result.recordset[0].id;
}

function updateLocation(tenantId, id, data) {
    return run(
        `UPDATE locations SET name = @name, code = @code, address = @address, city = @city,
            state = @state, country = @country, is_active = @isActive
         WHERE tenant_id = @tenantId AND id = @id`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
            name: { type: sql.NVarChar(255), value: data.name },
            code: { type: sql.NVarChar(20), value: data.code || null },
            address: { type: sql.NVarChar(500), value: data.address || null },
            city: { type: sql.NVarChar(100), value: data.city || null },
            state: { type: sql.NVarChar(100), value: data.state || null },
            country: { type: sql.NVarChar(100), value: data.country || null },
            isActive: { type: sql.Bit, value: data.is_active ?? true },
        }
    );
}

function countUsersInLocation(tenantId, id) {
    return one('SELECT COUNT(*) as count FROM users WHERE tenant_id = @tenantId AND location_id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

function deleteLocation(tenantId, id) {
    return run('DELETE FROM locations WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

module.exports = { listLocations, getLocation, createLocation, updateLocation, countUsersInLocation, deleteLocation, isUniqueViolation };

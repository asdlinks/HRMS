const { many, run, sql } = require('../db/sql');

// Both holidays and flexi_holidays are structurally identical, so one set
// of functions serves both — pass the table name ('holidays' | 'flexi_holidays').

function list(table, tenantId, locationId) {
    let query = `SELECT t.*, locations.name as location_name
                 FROM ${table} t
                 LEFT JOIN locations ON t.location_id = locations.id
                 WHERE t.tenant_id = @tenantId`;
    const params = { tenantId: { type: sql.Int, value: tenantId } };
    if (locationId) {
        query += ' AND (t.location_id = @locationId OR t.location_id IS NULL)';
        params.locationId = { type: sql.Int, value: locationId };
    }
    query += ' ORDER BY t.date ASC';
    return many(query, params);
}

async function createForLocations(table, tenantId, name, date, locationIds) {
    const ids = locationIds.length > 0 ? locationIds : [null];
    for (const locationId of ids) {
        await run(
            `INSERT INTO ${table} (tenant_id, name, date, location_id) VALUES (@tenantId, @name, @date, @locationId)`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                name: { type: sql.NVarChar(255), value: name },
                date: { type: sql.Date, value: date },
                locationId: { type: sql.Int, value: locationId },
            }
        );
    }
    return ids.length;
}

function remove(table, tenantId, id) {
    return run(`DELETE FROM ${table} WHERE tenant_id = @tenantId AND id = @id`, {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

function listBetween(table, tenantId, startDate, endDate) {
    return many(`SELECT * FROM ${table} WHERE tenant_id = @tenantId AND date BETWEEN @startDate AND @endDate`, {
        tenantId: { type: sql.Int, value: tenantId },
        startDate: { type: sql.Date, value: startDate },
        endDate: { type: sql.Date, value: endDate },
    });
}

module.exports = { list, createForLocations, remove, listBetween };

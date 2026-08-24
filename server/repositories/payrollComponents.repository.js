const { one, many, run, sql } = require('../db/sql');

function listComponents(tenantId, { activeOnly } = {}) {
    let query = 'SELECT * FROM salary_components WHERE tenant_id = @tenantId';
    if (activeOnly) query += ' AND is_active = 1';
    query += ' ORDER BY sort_order, name';
    return many(query, { tenantId: { type: sql.Int, value: tenantId } });
}

function getComponent(tenantId, id) {
    return one('SELECT * FROM salary_components WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

async function createComponent(tenantId, data) {
    const result = await run(
        `INSERT INTO salary_components
            (tenant_id, code, name, component_type, calculation_type, value, base_component_id, config, is_prorated_on_lop, is_active, sort_order)
         OUTPUT INSERTED.id
         VALUES
            (@tenantId, @code, @name, @componentType, @calculationType, @value, @baseComponentId, @config, @isProratedOnLop, @isActive, @sortOrder)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            code: { type: sql.NVarChar(50), value: data.code },
            name: { type: sql.NVarChar(150), value: data.name },
            componentType: { type: sql.NVarChar(20), value: data.component_type },
            calculationType: { type: sql.NVarChar(30), value: data.calculation_type },
            value: { type: sql.Decimal(18, 4), value: data.value ?? null },
            baseComponentId: { type: sql.Int, value: data.base_component_id ?? null },
            config: { type: sql.NVarChar(sql.MAX), value: data.config ? JSON.stringify(data.config) : null },
            isProratedOnLop: { type: sql.Bit, value: data.is_prorated_on_lop !== false },
            isActive: { type: sql.Bit, value: data.is_active !== false },
            sortOrder: { type: sql.Int, value: data.sort_order || 0 },
        }
    );
    return result.recordset[0].id;
}

async function updateComponent(tenantId, id, data) {
    const result = await run(
        `UPDATE salary_components SET
            code = @code, name = @name, component_type = @componentType, calculation_type = @calculationType,
            value = @value, base_component_id = @baseComponentId, config = @config,
            is_prorated_on_lop = @isProratedOnLop, is_active = @isActive, sort_order = @sortOrder,
            updated_at = SYSUTCDATETIME()
         WHERE tenant_id = @tenantId AND id = @id`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
            code: { type: sql.NVarChar(50), value: data.code },
            name: { type: sql.NVarChar(150), value: data.name },
            componentType: { type: sql.NVarChar(20), value: data.component_type },
            calculationType: { type: sql.NVarChar(30), value: data.calculation_type },
            value: { type: sql.Decimal(18, 4), value: data.value ?? null },
            baseComponentId: { type: sql.Int, value: data.base_component_id ?? null },
            config: { type: sql.NVarChar(sql.MAX), value: data.config ? JSON.stringify(data.config) : null },
            isProratedOnLop: { type: sql.Bit, value: data.is_prorated_on_lop !== false },
            isActive: { type: sql.Bit, value: data.is_active !== false },
            sortOrder: { type: sql.Int, value: data.sort_order || 0 },
        }
    );
    return result.rowsAffected;
}

async function isComponentReferenced(tenantId, id) {
    const row = await one(
        `SELECT
            (SELECT COUNT(*) FROM salary_structure_components WHERE tenant_id = @tenantId AND component_id = @id) +
            (SELECT COUNT(*) FROM payroll_run_line_components WHERE component_id = @id) +
            (SELECT COUNT(*) FROM salary_components WHERE tenant_id = @tenantId AND base_component_id = @id) AS refCount`,
        { tenantId: { type: sql.Int, value: tenantId }, id: { type: sql.Int, value: id } }
    );
    return row.refCount > 0;
}

function deactivateComponent(tenantId, id) {
    return run('UPDATE salary_components SET is_active = 0, updated_at = SYSUTCDATETIME() WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

function deleteComponent(tenantId, id) {
    return run('DELETE FROM salary_components WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

module.exports = {
    listComponents,
    getComponent,
    createComponent,
    updateComponent,
    isComponentReferenced,
    deactivateComponent,
    deleteComponent,
};

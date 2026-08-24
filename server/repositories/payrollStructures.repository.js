const { one, many, run, transaction, sql } = require('../db/sql');

function listStructures(tenantId) {
    return many('SELECT * FROM salary_structures WHERE tenant_id = @tenantId ORDER BY name', {
        tenantId: { type: sql.Int, value: tenantId },
    });
}

function getStructure(tenantId, id) {
    return one('SELECT * FROM salary_structures WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

async function createStructure(tenantId, data) {
    const result = await run(
        `INSERT INTO salary_structures (tenant_id, name, description, is_active, grade_id)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @name, @description, @isActive, @gradeId)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            name: { type: sql.NVarChar(150), value: data.name },
            description: { type: sql.NVarChar(500), value: data.description || null },
            isActive: { type: sql.Bit, value: data.is_active !== false },
            gradeId: { type: sql.Int, value: data.grade_id ?? null },
        }
    );
    return result.recordset[0].id;
}

function updateStructure(tenantId, id, data) {
    return run(
        `UPDATE salary_structures SET name = @name, description = @description, is_active = @isActive, grade_id = @gradeId, updated_at = SYSUTCDATETIME()
         WHERE tenant_id = @tenantId AND id = @id`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
            name: { type: sql.NVarChar(150), value: data.name },
            description: { type: sql.NVarChar(500), value: data.description || null },
            isActive: { type: sql.Bit, value: data.is_active !== false },
            gradeId: { type: sql.Int, value: data.grade_id ?? null },
        }
    );
}

async function isStructureReferenced(tenantId, id) {
    const row = await one(
        `SELECT
            (SELECT COUNT(*) FROM employee_salary_assignments WHERE tenant_id = @tenantId AND structure_id = @id) AS refCount`,
        { tenantId: { type: sql.Int, value: tenantId }, id: { type: sql.Int, value: id } }
    );
    return row.refCount > 0;
}

function deleteStructure(tenantId, id) {
    return run('DELETE FROM salary_structures WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

function listStructureComponents(tenantId, structureId) {
    return many(
        `SELECT sc.id, sc.structure_id, sc.component_id, sc.override_value, sc.sort_order,
                comp.code, comp.name, comp.component_type, comp.calculation_type, comp.value, comp.base_component_id, comp.config, comp.is_prorated_on_lop
         FROM salary_structure_components sc
         JOIN salary_components comp ON sc.component_id = comp.id
         WHERE sc.tenant_id = @tenantId AND sc.structure_id = @structureId
         ORDER BY sc.sort_order, comp.name`,
        { tenantId: { type: sql.Int, value: tenantId }, structureId: { type: sql.Int, value: structureId } }
    );
}

// Replace-all: the structure builder always submits the full component list
// for a structure, so it's simplest and safest to delete then re-insert
// inside one transaction (mirrors the menu_items replace-all pattern).
function setStructureComponents(tenantId, structureId, items) {
    return transaction(async (tx) => {
        await tx.run('DELETE FROM salary_structure_components WHERE tenant_id = @tenantId AND structure_id = @structureId', {
            tenantId: { type: sql.Int, value: tenantId },
            structureId: { type: sql.Int, value: structureId },
        });
        for (const item of items) {
            await tx.run(
                `INSERT INTO salary_structure_components (tenant_id, structure_id, component_id, override_value, sort_order)
                 VALUES (@tenantId, @structureId, @componentId, @overrideValue, @sortOrder)`,
                {
                    tenantId: { type: sql.Int, value: tenantId },
                    structureId: { type: sql.Int, value: structureId },
                    componentId: { type: sql.Int, value: item.component_id },
                    overrideValue: { type: sql.Decimal(18, 4), value: item.override_value ?? null },
                    sortOrder: { type: sql.Int, value: item.sort_order || 0 },
                }
            );
        }
    });
}

module.exports = {
    listStructures,
    getStructure,
    createStructure,
    updateStructure,
    isStructureReferenced,
    deleteStructure,
    listStructureComponents,
    setStructureComponents,
};

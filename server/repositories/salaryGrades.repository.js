const { one, many, run, sql } = require('../db/sql');

function listGrades(tenantId) {
    return many('SELECT * FROM salary_grades WHERE tenant_id = @tenantId ORDER BY name', {
        tenantId: { type: sql.Int, value: tenantId },
    });
}

function getGrade(tenantId, id) {
    return one('SELECT * FROM salary_grades WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

async function createGrade(tenantId, data) {
    const result = await run(
        `INSERT INTO salary_grades (tenant_id, code, name, description, min_amount, mid_amount, max_amount, default_structure_id, is_active)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @code, @name, @description, @minAmount, @midAmount, @maxAmount, @defaultStructureId, @isActive)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            code: { type: sql.NVarChar(50), value: data.code },
            name: { type: sql.NVarChar(150), value: data.name },
            description: { type: sql.NVarChar(500), value: data.description || null },
            minAmount: { type: sql.Decimal(18, 2), value: data.min_amount ?? null },
            midAmount: { type: sql.Decimal(18, 2), value: data.mid_amount ?? null },
            maxAmount: { type: sql.Decimal(18, 2), value: data.max_amount ?? null },
            defaultStructureId: { type: sql.Int, value: data.default_structure_id ?? null },
            isActive: { type: sql.Bit, value: data.is_active !== false },
        }
    );
    return result.recordset[0].id;
}

function updateGrade(tenantId, id, data) {
    return run(
        `UPDATE salary_grades SET
            code = @code, name = @name, description = @description,
            min_amount = @minAmount, mid_amount = @midAmount, max_amount = @maxAmount,
            default_structure_id = @defaultStructureId, is_active = @isActive, updated_at = SYSUTCDATETIME()
         WHERE tenant_id = @tenantId AND id = @id`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
            code: { type: sql.NVarChar(50), value: data.code },
            name: { type: sql.NVarChar(150), value: data.name },
            description: { type: sql.NVarChar(500), value: data.description || null },
            minAmount: { type: sql.Decimal(18, 2), value: data.min_amount ?? null },
            midAmount: { type: sql.Decimal(18, 2), value: data.mid_amount ?? null },
            maxAmount: { type: sql.Decimal(18, 2), value: data.max_amount ?? null },
            defaultStructureId: { type: sql.Int, value: data.default_structure_id ?? null },
            isActive: { type: sql.Bit, value: data.is_active !== false },
        }
    );
}

async function isGradeReferenced(tenantId, id) {
    const row = await one(
        `SELECT
            (SELECT COUNT(*) FROM salary_structures WHERE tenant_id = @tenantId AND grade_id = @id) +
            (SELECT COUNT(*) FROM employee_salary_assignments WHERE tenant_id = @tenantId AND grade_id = @id) AS refCount`,
        { tenantId: { type: sql.Int, value: tenantId }, id: { type: sql.Int, value: id } }
    );
    return row.refCount > 0;
}

function deleteGrade(tenantId, id) {
    return run('DELETE FROM salary_grades WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

function listStructuresForGrade(tenantId, gradeId) {
    return many('SELECT * FROM salary_structures WHERE tenant_id = @tenantId AND grade_id = @gradeId ORDER BY name', {
        tenantId: { type: sql.Int, value: tenantId },
        gradeId: { type: sql.Int, value: gradeId },
    });
}

module.exports = { listGrades, getGrade, createGrade, updateGrade, isGradeReferenced, deleteGrade, listStructuresForGrade };

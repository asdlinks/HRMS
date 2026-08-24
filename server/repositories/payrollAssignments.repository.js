const { one, many, transaction, sql } = require('../db/sql');

function getOpenAssignment(tenantId, userId) {
    return one(
        `SELECT * FROM employee_salary_assignments WHERE tenant_id = @tenantId AND user_id = @userId AND effective_to IS NULL`,
        { tenantId: { type: sql.Int, value: tenantId }, userId: { type: sql.Int, value: userId } }
    );
}

// The assignment in effect on a given date — used by the calculation engine
// to resolve which structure/CTC applied during a (possibly past) run cycle.
function getAssignmentAsOf(tenantId, userId, date) {
    return one(
        `SELECT TOP 1 * FROM employee_salary_assignments
         WHERE tenant_id = @tenantId AND user_id = @userId
           AND effective_from <= @date AND (effective_to IS NULL OR effective_to >= @date)
         ORDER BY effective_from DESC`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            userId: { type: sql.Int, value: userId },
            date: { type: sql.Date, value: date },
        }
    );
}

function listHistory(tenantId, userId) {
    return many(
        `SELECT esa.*, ss.name as structure_name
         FROM employee_salary_assignments esa
         JOIN salary_structures ss ON esa.structure_id = ss.id
         WHERE esa.tenant_id = @tenantId AND esa.user_id = @userId
         ORDER BY esa.effective_from DESC`,
        { tenantId: { type: sql.Int, value: tenantId }, userId: { type: sql.Int, value: userId } }
    );
}

// One row per employee whose assignment covers `date` — the set of
// employees a payroll run for that cycle should include, with their
// resolved structure/CTC already joined in (avoids an N+1 lookup per
// employee when processing a run).
function listActiveAsOf(tenantId, date) {
    return many(
        `SELECT esa.user_id, esa.structure_id, esa.ctc_annual, u.name as user_name, u.employee_id, u.location_id
         FROM employee_salary_assignments esa
         JOIN users u ON esa.user_id = u.id
         WHERE esa.tenant_id = @tenantId
           AND esa.effective_from <= @date AND (esa.effective_to IS NULL OR esa.effective_to >= @date)`,
        { tenantId: { type: sql.Int, value: tenantId }, date: { type: sql.Date, value: date } }
    );
}

function listAllOpen(tenantId) {
    const query = `SELECT esa.*, ss.name as structure_name, u.name as user_name, u.employee_id
                 FROM employee_salary_assignments esa
                 JOIN salary_structures ss ON esa.structure_id = ss.id
                 JOIN users u ON esa.user_id = u.id
                 WHERE esa.tenant_id = @tenantId AND esa.effective_to IS NULL
                 ORDER BY u.name`;
    return many(query, { tenantId: { type: sql.Int, value: tenantId } });
}

// Closes any currently-open assignment the day before the new one starts,
// then inserts the new one — giving a real CTC/structure history for free.
function createAssignment(tenantId, data, createdBy) {
    return transaction(async (tx) => {
        await tx.run(
            `UPDATE employee_salary_assignments
             SET effective_to = DATEADD(day, -1, @effectiveFrom)
             WHERE tenant_id = @tenantId AND user_id = @userId AND effective_to IS NULL`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                userId: { type: sql.Int, value: data.user_id },
                effectiveFrom: { type: sql.Date, value: data.effective_from },
            }
        );

        const result = await tx.run(
            `INSERT INTO employee_salary_assignments
                (tenant_id, user_id, structure_id, grade_id, ctc_annual, effective_from, effective_to, created_by)
             OUTPUT INSERTED.id
             VALUES
                (@tenantId, @userId, @structureId, @gradeId, @ctcAnnual, @effectiveFrom, NULL, @createdBy)`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                userId: { type: sql.Int, value: data.user_id },
                structureId: { type: sql.Int, value: data.structure_id },
                gradeId: { type: sql.Int, value: data.grade_id ?? null },
                ctcAnnual: { type: sql.Decimal(18, 2), value: data.ctc_annual },
                effectiveFrom: { type: sql.Date, value: data.effective_from },
                createdBy: { type: sql.Int, value: createdBy },
            }
        );
        return result.recordset[0].id;
    });
}

module.exports = {
    getOpenAssignment,
    getAssignmentAsOf,
    listHistory,
    listActiveAsOf,
    listAllOpen,
    createAssignment,
};

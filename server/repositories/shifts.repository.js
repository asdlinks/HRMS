const { one, many, run, transaction, sql } = require('../db/sql');

function listShifts(tenantId) {
    return many('SELECT * FROM shifts WHERE tenant_id = @tenantId ORDER BY name', {
        tenantId: { type: sql.Int, value: tenantId },
    });
}

function getShift(tenantId, id) {
    return one('SELECT * FROM shifts WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

function shiftParams(tenantId, data) {
    return {
        tenantId: { type: sql.Int, value: tenantId },
        name: { type: sql.NVarChar(150), value: data.name },
        shiftType: { type: sql.NVarChar(20), value: data.shift_type },
        startTime: { type: sql.VarChar(8), value: data.start_time || null },
        endTime: { type: sql.VarChar(8), value: data.end_time || null },
        isOvernight: { type: sql.Bit, value: !!data.is_overnight },
        timeWindows: { type: sql.NVarChar(sql.MAX), value: data.time_windows ? JSON.stringify(data.time_windows) : null },
        expectedWorkMinutes: { type: sql.Int, value: data.expected_work_minutes ?? 480 },
        gracePeriodMinutes: { type: sql.Int, value: data.grace_period_minutes ?? 0 },
        earlyExitThresholdMinutes: { type: sql.Int, value: data.early_exit_threshold_minutes ?? 0 },
        breakType: { type: sql.NVarChar(20), value: data.break_type || 'none' },
        breakDurationMinutes: { type: sql.Int, value: data.break_duration_minutes ?? null },
        breakWindowStart: { type: sql.VarChar(8), value: data.break_window_start || null },
        breakWindowEnd: { type: sql.VarChar(8), value: data.break_window_end || null },
        otEnabled: { type: sql.Bit, value: !!data.ot_enabled },
        otTriggerAfterMinutes: { type: sql.Int, value: data.ot_trigger_after_minutes ?? null },
        otRequiresApproval: { type: sql.Bit, value: data.ot_requires_approval !== false },
        rotationNote: { type: sql.NVarChar(500), value: data.rotation_note || null },
        isActive: { type: sql.Bit, value: data.is_active !== false },
    };
}

async function createShift(tenantId, data) {
    const result = await run(
        `INSERT INTO shifts (
            tenant_id, name, shift_type, start_time, end_time, is_overnight, time_windows,
            expected_work_minutes, grace_period_minutes, early_exit_threshold_minutes,
            break_type, break_duration_minutes, break_window_start, break_window_end,
            ot_enabled, ot_trigger_after_minutes, ot_requires_approval, rotation_note, is_active
         )
         OUTPUT INSERTED.id
         VALUES (
            @tenantId, @name, @shiftType, @startTime, @endTime, @isOvernight, @timeWindows,
            @expectedWorkMinutes, @gracePeriodMinutes, @earlyExitThresholdMinutes,
            @breakType, @breakDurationMinutes, @breakWindowStart, @breakWindowEnd,
            @otEnabled, @otTriggerAfterMinutes, @otRequiresApproval, @rotationNote, @isActive
         )`,
        shiftParams(tenantId, data)
    );
    return result.recordset[0].id;
}

function updateShift(tenantId, id, data) {
    return run(
        `UPDATE shifts SET
            name = @name, shift_type = @shiftType, start_time = @startTime, end_time = @endTime,
            is_overnight = @isOvernight, time_windows = @timeWindows,
            expected_work_minutes = @expectedWorkMinutes, grace_period_minutes = @gracePeriodMinutes,
            early_exit_threshold_minutes = @earlyExitThresholdMinutes, break_type = @breakType,
            break_duration_minutes = @breakDurationMinutes, break_window_start = @breakWindowStart,
            break_window_end = @breakWindowEnd, ot_enabled = @otEnabled,
            ot_trigger_after_minutes = @otTriggerAfterMinutes, ot_requires_approval = @otRequiresApproval,
            rotation_note = @rotationNote, is_active = @isActive, updated_at = SYSUTCDATETIME()
         WHERE tenant_id = @tenantId AND id = @id`,
        { ...shiftParams(tenantId, data), id: { type: sql.Int, value: id } }
    );
}

async function isShiftReferenced(tenantId, id) {
    const row = await one(
        `SELECT (SELECT COUNT(*) FROM employee_shift_assignments WHERE tenant_id = @tenantId AND shift_id = @id) AS refCount`,
        { tenantId: { type: sql.Int, value: tenantId }, id: { type: sql.Int, value: id } }
    );
    return row.refCount > 0;
}

function deleteShift(tenantId, id) {
    return run('DELETE FROM shifts WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

// The shift in effect for a user on `date` — null if no shift is assigned
// (attendanceEngine falls back to today's pre-Phase-7 behavior in that case).
function getActiveShiftForUser(tenantId, userId, date) {
    return one(
        `SELECT s.* FROM employee_shift_assignments esa
         JOIN shifts s ON esa.shift_id = s.id
         WHERE esa.tenant_id = @tenantId AND esa.user_id = @userId
           AND esa.effective_from <= @date AND (esa.effective_to IS NULL OR esa.effective_to >= @date)
           AND s.is_active = 1`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            userId: { type: sql.Int, value: userId },
            date: { type: sql.Date, value: date },
        }
    );
}

function listShiftAssignmentHistory(tenantId, userId) {
    return many(
        `SELECT esa.*, s.name as shift_name, s.shift_type
         FROM employee_shift_assignments esa
         JOIN shifts s ON esa.shift_id = s.id
         WHERE esa.tenant_id = @tenantId AND esa.user_id = @userId
         ORDER BY esa.effective_from DESC`,
        { tenantId: { type: sql.Int, value: tenantId }, userId: { type: sql.Int, value: userId } }
    );
}

// Closes any currently-open assignment the day before the new one starts,
// then inserts the new one — mirrors payrollAssignments.repository.js
// ::createAssignment exactly, giving a real shift history for free
// (Rotational shifts are just a sequence of these short-lived assignments).
function createShiftAssignment(tenantId, data, createdBy) {
    return transaction(async (tx) => {
        await tx.run(
            `UPDATE employee_shift_assignments
             SET effective_to = DATEADD(day, -1, @effectiveFrom)
             WHERE tenant_id = @tenantId AND user_id = @userId AND effective_to IS NULL`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                userId: { type: sql.Int, value: data.user_id },
                effectiveFrom: { type: sql.Date, value: data.effective_from },
            }
        );

        const result = await tx.run(
            `INSERT INTO employee_shift_assignments (tenant_id, user_id, shift_id, effective_from, effective_to, created_by)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @userId, @shiftId, @effectiveFrom, NULL, @createdBy)`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                userId: { type: sql.Int, value: data.user_id },
                shiftId: { type: sql.Int, value: data.shift_id },
                effectiveFrom: { type: sql.Date, value: data.effective_from },
                createdBy: { type: sql.Int, value: createdBy },
            }
        );
        return result.recordset[0].id;
    });
}

module.exports = {
    listShifts,
    getShift,
    createShift,
    updateShift,
    isShiftReferenced,
    deleteShift,
    getActiveShiftForUser,
    listShiftAssignmentHistory,
    createShiftAssignment,
};

const { one, many, run, sql } = require('../db/sql');

function getUserLocationId(tenantId, userId) {
    return one('SELECT location_id FROM users WHERE tenant_id = @tenantId AND id = @userId', {
        tenantId: { type: sql.Int, value: tenantId },
        userId: { type: sql.Int, value: userId },
    });
}

function listForUserBetween(tenantId, userId, startDate, endDate) {
    return many(
        'SELECT * FROM attendance WHERE tenant_id = @tenantId AND user_id = @userId AND date BETWEEN @startDate AND @endDate',
        {
            tenantId: { type: sql.Int, value: tenantId },
            userId: { type: sql.Int, value: userId },
            startDate: { type: sql.Date, value: startDate },
            endDate: { type: sql.Date, value: endDate },
        }
    );
}

function listForTenantBetween(tenantId, startDate, endDate) {
    return many('SELECT * FROM attendance WHERE tenant_id = @tenantId AND date BETWEEN @startDate AND @endDate', {
        tenantId: { type: sql.Int, value: tenantId },
        startDate: { type: sql.Date, value: startDate },
        endDate: { type: sql.Date, value: endDate },
    });
}

function listToday(tenantId, today) {
    return many(
        `SELECT user_id, date, status, check_in_time, check_out_time, method, work_mode, device_id
         FROM attendance WHERE tenant_id = @tenantId AND date = @today`,
        { tenantId: { type: sql.Int, value: tenantId }, today: { type: sql.Date, value: today } }
    );
}

function getUserTrackingDates(tenantId, userId) {
    return one('SELECT created_at, joining_date FROM users WHERE tenant_id = @tenantId AND id = @userId', {
        tenantId: { type: sql.Int, value: tenantId },
        userId: { type: sql.Int, value: userId },
    });
}

// The single INSERT path for every attendance method (manual, kiosk face
// scan, WFH, client visit, field work). `extra` fields are all optional —
// callers only pass what their method captures. `status`/`lateMinutes`/
// `shiftId`/`workModeId` are resolved by attendanceEngine.service.js from
// the employee's active shift/work-mode (Phase 7) — an employee with
// neither assigned keeps the pre-Phase-7 default of always 'Present'.
// `checkInTime` is bound explicitly (rather than left to the column's
// SYSUTCDATETIME() default) so the persisted timestamp is the exact same
// instant attendanceEngine used to compute `status`/`lateMinutes` — the app
// server and DB server clocks are not guaranteed to agree.
async function checkIn(tenantId, userId, date, extra = {}) {
    const {
        method = 'Manual',
        workMode = null,
        deviceId = null,
        locationLat = null,
        locationLng = null,
        locationAddress = null,
        clientName = null,
        notes = null,
        status = 'Present',
        lateMinutes = null,
        shiftId = null,
        workModeId = null,
        checkInTime = null,
        confidence = null,
    } = extra;

    const result = await run(
        `INSERT INTO attendance (
            tenant_id, user_id, date, check_in_time, status, method, work_mode, device_id,
            location_lat, location_lng, location_address, client_name, notes,
            late_minutes, shift_id, work_mode_id, confidence
         )
         OUTPUT INSERTED.id
         VALUES (
            @tenantId, @userId, @date, COALESCE(@checkInTime, SYSUTCDATETIME()), @status, @method, @workMode, @deviceId,
            @locationLat, @locationLng, @locationAddress, @clientName, @notes,
            @lateMinutes, @shiftId, @workModeId, @confidence
         )`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            userId: { type: sql.Int, value: userId },
            date: { type: sql.Date, value: date },
            checkInTime: { type: sql.DateTime2, value: checkInTime },
            status: { type: sql.NVarChar(20), value: status },
            method: { type: sql.NVarChar(30), value: method },
            workMode: { type: sql.NVarChar(20), value: workMode },
            deviceId: { type: sql.Int, value: deviceId },
            locationLat: { type: sql.Decimal(9, 6), value: locationLat },
            locationLng: { type: sql.Decimal(9, 6), value: locationLng },
            locationAddress: { type: sql.NVarChar(255), value: locationAddress },
            clientName: { type: sql.NVarChar(200), value: clientName },
            notes: { type: sql.NVarChar(1000), value: notes },
            lateMinutes: { type: sql.Int, value: lateMinutes },
            shiftId: { type: sql.Int, value: shiftId },
            workModeId: { type: sql.Int, value: workModeId },
            confidence: { type: sql.Decimal(4, 3), value: confidence },
        }
    );
    return result.recordset[0].id;
}

function getToday(tenantId, userId, date) {
    return one('SELECT * FROM attendance WHERE tenant_id = @tenantId AND user_id = @userId AND date = @date', {
        tenantId: { type: sql.Int, value: tenantId },
        userId: { type: sql.Int, value: userId },
        date: { type: sql.Date, value: date },
    });
}

// Straight UPDATE on the existing day's row — never a second attendance row —
// so Payroll/Reports' row-count-based "present days" is never affected by
// check-out. Idempotent: re-checking-out a day that's already checked out is
// a no-op (the WHERE clause simply matches nothing). `workedMinutes`/
// `isEarlyExit`/`overtimeMinutes` are resolved by attendanceEngine.service.js
// from the employee's active shift (Phase 7) — null when no shift is
// assigned, so pre-Phase-7 checkout behavior is unchanged either way.
async function updateCheckOut(tenantId, userId, date, { workSummary = null, workedMinutes = null, isEarlyExit = null, overtimeMinutes = null, checkOutTime = null } = {}) {
    const result = await run(
        `UPDATE attendance
         SET check_out_time = COALESCE(@checkOutTime, SYSUTCDATETIME()),
             work_summary = COALESCE(@workSummary, work_summary),
             worked_minutes = @workedMinutes,
             is_early_exit = @isEarlyExit,
             overtime_minutes = @overtimeMinutes
         WHERE tenant_id = @tenantId AND user_id = @userId AND date = @date AND check_out_time IS NULL`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            userId: { type: sql.Int, value: userId },
            date: { type: sql.Date, value: date },
            checkOutTime: { type: sql.DateTime2, value: checkOutTime },
            workSummary: { type: sql.NVarChar(sql.MAX), value: workSummary },
            workedMinutes: { type: sql.Int, value: workedMinutes },
            isEarlyExit: { type: sql.Bit, value: isEarlyExit },
            overtimeMinutes: { type: sql.Int, value: overtimeMinutes },
        }
    );
    return result.rowsAffected;
}

function insertBreak(tenantId, attendanceId) {
    return run(
        `INSERT INTO attendance_breaks (tenant_id, attendance_id) OUTPUT INSERTED.id VALUES (@tenantId, @attendanceId)`,
        { tenantId: { type: sql.Int, value: tenantId }, attendanceId: { type: sql.Int, value: attendanceId } }
    ).then((result) => result.recordset[0].id);
}

// Closes the most recently opened, still-open break for this attendance row.
function closeOpenBreak(tenantId, attendanceId) {
    return run(
        `UPDATE attendance_breaks SET break_end = SYSUTCDATETIME()
         WHERE id = (
             SELECT TOP 1 id FROM attendance_breaks
             WHERE tenant_id = @tenantId AND attendance_id = @attendanceId AND break_end IS NULL
             ORDER BY break_start DESC
         )`,
        { tenantId: { type: sql.Int, value: tenantId }, attendanceId: { type: sql.Int, value: attendanceId } }
    ).then((result) => result.rowsAffected);
}

function getOpenBreak(tenantId, attendanceId) {
    return one(
        `SELECT TOP 1 * FROM attendance_breaks
         WHERE tenant_id = @tenantId AND attendance_id = @attendanceId AND break_end IS NULL
         ORDER BY break_start DESC`,
        { tenantId: { type: sql.Int, value: tenantId }, attendanceId: { type: sql.Int, value: attendanceId } }
    );
}

function listBreaks(tenantId, attendanceId) {
    return many(
        'SELECT * FROM attendance_breaks WHERE tenant_id = @tenantId AND attendance_id = @attendanceId ORDER BY break_start',
        { tenantId: { type: sql.Int, value: tenantId }, attendanceId: { type: sql.Int, value: attendanceId } }
    );
}

module.exports = {
    getUserLocationId,
    listForUserBetween,
    listForTenantBetween,
    listToday,
    getUserTrackingDates,
    checkIn,
    getToday,
    updateCheckOut,
    insertBreak,
    closeOpenBreak,
    getOpenBreak,
    listBreaks,
};

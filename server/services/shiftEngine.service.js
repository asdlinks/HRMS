// Pure functions that turn a shift's configuration + a check-in/out instant
// into late/early-exit/worked-minutes/overtime facts. No I/O here — this is
// genuinely new logic (attendance previously hardcoded status to 'Present'
// and did no time computation at all; see attendance.repository.js::checkIn
// and updateCheckOut before Phase 7), so it's kept in its own pure,
// unit-testable module the same way payrollCalculation.service.js's
// resolveComponentAmounts is.
//
// Wall-clock comparison only: check-in/out instants and shift start/end
// times are compared as raw UTC hours:minutes, with no per-tenant timezone
// conversion — consistent with the rest of the codebase (attendance already
// stores SYSUTCDATETIME() with no timezone adjustment anywhere).

function toMinutesOfDay(value) {
    if (value == null) return null;
    if (value instanceof Date) return value.getUTCHours() * 60 + value.getUTCMinutes();
    // mssql TIME params/values can also arrive as 'HH:MM:SS' strings.
    const [h, m] = String(value).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

function parseTimeWindows(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function getShiftStartMinutes(shift) {
    if (shift.shift_type === 'Split') {
        const windows = parseTimeWindows(shift.time_windows);
        if (windows.length === 0) return null;
        return toMinutesOfDay(windows[0].start);
    }
    return toMinutesOfDay(shift.start_time);
}

function getShiftEndMinutes(shift) {
    let endMinutes;
    if (shift.shift_type === 'Split') {
        const windows = parseTimeWindows(shift.time_windows);
        if (windows.length === 0) return null;
        endMinutes = toMinutesOfDay(windows[windows.length - 1].end);
    } else {
        endMinutes = toMinutesOfDay(shift.end_time);
    }
    if (endMinutes == null) return null;
    const startMinutes = getShiftStartMinutes(shift);
    if (shift.is_overnight && startMinutes != null && endMinutes <= startMinutes) {
        endMinutes += 24 * 60;
    }
    return endMinutes;
}

// { status: 'Present'|'Late', lateMinutes: number|null }. No configured
// start time (e.g. a Flexible shift) always resolves to on-time — there's
// nothing to be late against.
function resolveCheckInStatus(shift, checkInDateTime) {
    if (!shift) return { status: 'Present', lateMinutes: null };
    const scheduledStart = getShiftStartMinutes(shift);
    if (scheduledStart == null) return { status: 'Present', lateMinutes: null };

    const checkInMinutes = checkInDateTime.getUTCHours() * 60 + checkInDateTime.getUTCMinutes();
    const diff = checkInMinutes - scheduledStart;
    const grace = shift.grace_period_minutes || 0;
    if (diff > grace) return { status: 'Late', lateMinutes: diff };
    return { status: 'Present', lateMinutes: null };
}

function resolveBreakMinutes(shift) {
    if (shift.break_type === 'unpaid_duration') return shift.break_duration_minutes || 0;
    if (shift.break_type === 'fixed_window' && shift.break_window_start && shift.break_window_end) {
        const start = toMinutesOfDay(shift.break_window_start);
        const end = toMinutesOfDay(shift.break_window_end);
        return end > start ? end - start : 0;
    }
    return 0; // 'none' and 'paid_duration' don't reduce worked time
}

// { workedMinutes, isEarlyExit, overtimeMinutes }. No shift assigned means
// no facts to compute — caller leaves those attendance columns null,
// preserving today's exact checkout behavior.
function resolveCheckOutFacts(shift, checkInDateTime, checkOutDateTime) {
    if (!shift) return { workedMinutes: null, isEarlyExit: null, overtimeMinutes: null };

    const rawWorkedMinutes = Math.max(0, Math.round((checkOutDateTime.getTime() - checkInDateTime.getTime()) / 60000));
    const workedMinutes = Math.max(0, rawWorkedMinutes - resolveBreakMinutes(shift));

    const scheduledEnd = getShiftEndMinutes(shift);
    let isEarlyExit = null;
    if (scheduledEnd != null) {
        const checkOutMinutes = checkOutDateTime.getUTCHours() * 60 + checkOutDateTime.getUTCMinutes();
        const threshold = shift.early_exit_threshold_minutes || 0;
        isEarlyExit = (scheduledEnd - checkOutMinutes) > threshold;
    }

    let overtimeMinutes = 0;
    if (shift.ot_enabled) {
        const trigger = shift.ot_trigger_after_minutes || 0;
        overtimeMinutes = Math.max(0, rawWorkedMinutes - shift.expected_work_minutes - trigger);
    }

    return { workedMinutes, isEarlyExit, overtimeMinutes };
}

module.exports = { resolveCheckInStatus, resolveCheckOutFacts, parseTimeWindows };

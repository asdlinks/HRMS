// The single write path for every attendance capture method (Face, WFH,
// ClientVisit, FieldWork, Manual, and future Biometric/QRCode/API). Every
// route — the employee's manual check-in, the kiosk's face check-in, and
// the remote work-mode flows — calls through here, so policy eligibility,
// the tracking-start-date window, and duplicate-checkin handling are never
// duplicated or allowed to drift between entry points.
const { HttpError } = require('../middleware/errorHandler');
const { isUniqueViolation } = require('../db/sql');
const attendanceRepo = require('../repositories/attendance.repository');
const policiesRepo = require('../repositories/attendancePolicies.repository');
const idempotencyRepo = require('../repositories/idempotency.repository');
const shiftsRepo = require('../repositories/shifts.repository');
const shiftEngine = require('../services/shiftEngine.service');
const workModesRepo = require('../repositories/workModes.repository');
const overtimeRepo = require('../repositories/overtime.repository');

function parseJson(value, fallback) {
    if (value == null) return fallback;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

// No attendance_policy_id assigned yet falls back to the pre-Phase-6
// behavior (manual check-in only) rather than hard-failing every employee
// the moment this migration runs, before an admin has assigned policies.
async function validateMethodAllowed(tenantId, userId, method) {
    const policy = await policiesRepo.getPolicyForUser(tenantId, userId);
    if (!policy) {
        if (method !== 'Manual') {
            throw new HttpError(403, 'No attendance policy is assigned to you yet — contact HR.');
        }
        return null;
    }
    const allowedMethods = parseJson(policy.allowed_methods, []);
    if (!allowedMethods.includes(method)) {
        throw new HttpError(403, `Your attendance policy does not permit the ${method} method.`);
    }
    return policy;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Only enforced when the policy's config names a geofence center — a policy
// with no center configured (typical for Field Work, which has no fixed
// site) simply skips the check rather than hardcoding a location anywhere.
function validateLocation(policy, lat, lng) {
    const config = parseJson(policy?.config, null);
    if (!config?.geofence_center_lat || !config?.geofence_center_lng || !config?.geofence_radius_meters) return;
    if (lat == null || lng == null) {
        throw new HttpError(400, 'Location is required for this attendance method.');
    }
    const distance = haversineMeters(lat, lng, config.geofence_center_lat, config.geofence_center_lng);
    if (distance > config.geofence_radius_meters) {
        throw new HttpError(400, 'You are outside the allowed location range for this attendance method.');
    }
}

// mssql returns DATE/DATETIME2 columns as JS Date objects, not strings —
// Date.prototype.toString() is locale/timezone text ("Wed Jul 10 2026..."),
// not ISO, so a plain String(value).split('T') (what the original inline
// check-in handler did) silently breaks the string comparisons below for
// any user whose joining_date/created_at actually round-trips as a Date.
function toIsoDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).split('T')[0].split(' ')[0];
}

// The tracking-start-date business rule that used to live inline in
// attendance.routes.js's POST /check-in handler — unchanged logic, just
// shared by every method now instead of only the manual check-in route.
async function validateTrackingWindow(tenantId, userId, date) {
    const year = parseInt(date.split('-')[0], 10);
    const globalStartDate = year > 2026 ? `${year}-01-01` : '2026-05-01';

    const user = await attendanceRepo.getUserTrackingDates(tenantId, userId);
    const userCreatedAt = toIsoDate(user?.created_at);
    const userJoiningDate = toIsoDate(user?.joining_date);

    let trackingStart = userCreatedAt;
    if (userJoiningDate && (!trackingStart || userJoiningDate > trackingStart)) {
        trackingStart = userJoiningDate;
    }
    const effectiveStartDate = trackingStart && trackingStart > globalStartDate ? trackingStart : globalStartDate;

    if (date < effectiveStartDate) {
        throw new HttpError(400, 'Attendance check-in is not available for this period.');
    }
    if (trackingStart === date) {
        throw new HttpError(400, 'You can start check-in from the system by tomorrow, make sure to login everyday.');
    }
}

async function withIdempotency(tenantId, idempotencyKey, fn) {
    if (!idempotencyKey) return fn();

    const claimed = await idempotencyRepo.tryClaim(tenantId, idempotencyKey);
    if (!claimed) {
        const cached = await idempotencyRepo.findResponse(tenantId, idempotencyKey);
        if (cached) return cached;
        // Claimed by a concurrent request that hasn't stored its response
        // yet — extremely narrow window; safe to just re-run since the
        // underlying write itself is still protected by the attendance
        // table's own unique constraint.
    }
    const response = await fn();
    if (claimed) await idempotencyRepo.storeResponse(tenantId, idempotencyKey, response);
    return response;
}

async function recordCheckIn({
    tenantId, userId, method, date, deviceId = null, workMode = null,
    location = null, clientName = null, notes = null, confidence = null, idempotencyKey = null,
}) {
    return withIdempotency(tenantId, idempotencyKey, async () => {
        const policy = await validateMethodAllowed(tenantId, userId, method);
        await validateTrackingWindow(tenantId, userId, date);
        if (location) validateLocation(policy, location.lat, location.lng);

        // Shift/work-mode resolution is additive: an employee with neither
        // assigned gets exactly today's pre-Phase-7 behavior (status always
        // 'Present', shift_id/work_mode_id left null) — see
        // shiftEngine.service.js::resolveCheckInStatus and
        // workModesRepo.findByCode, both of which return a safe "no-op"
        // value when nothing is configured yet.
        const [shift, workModeRow] = await Promise.all([
            shiftsRepo.getActiveShiftForUser(tenantId, userId, date),
            workModesRepo.findByCode(tenantId, workMode || 'Office'),
        ]);
        // `now` is bound as the row's actual check_in_time too (rather than
        // leaving that column to the DB's own SYSUTCDATETIME() default) so
        // the persisted timestamp and the computed status can never
        // disagree, even if the app server and DB server clocks drift.
        const now = new Date();
        const { status, lateMinutes } = shiftEngine.resolveCheckInStatus(shift, now);

        let attendanceId;
        try {
            attendanceId = await attendanceRepo.checkIn(tenantId, userId, date, {
                method,
                workMode,
                deviceId,
                locationLat: location?.lat ?? null,
                locationLng: location?.lng ?? null,
                locationAddress: location?.address ?? null,
                clientName,
                notes,
                status,
                lateMinutes,
                shiftId: shift?.id ?? null,
                workModeId: workModeRow?.id ?? null,
                checkInTime: now,
                confidence,
            });
        } catch (err) {
            if (isUniqueViolation(err)) throw new HttpError(400, 'Already checked in for today');
            throw err;
        }

        return { id: attendanceId, status, method };
    });
}

async function recordCheckOut({ tenantId, userId, date, workSummary = null, idempotencyKey = null }) {
    return withIdempotency(tenantId, idempotencyKey, async () => {
        const existing = await attendanceRepo.getToday(tenantId, userId, date);
        if (!existing) throw new HttpError(400, 'You have not checked in today yet.');

        // Re-resolve the shift that was active on check-in (stored on the
        // row itself) rather than "today's" active shift, so a shift
        // reassignment mid-day can't retroactively change this day's facts.
        const shift = existing.shift_id ? await shiftsRepo.getShift(tenantId, existing.shift_id) : null;
        const now = new Date();
        const { workedMinutes, isEarlyExit, overtimeMinutes: rawOvertimeMinutes } = shiftEngine.resolveCheckOutFacts(
            shift, existing.check_in_time, now
        );

        // A missed checkout can leave this row open for days — the client
        // re-submits checkout against the original open session's `date`,
        // not wall-clock "today", so `now` can be arbitrarily far past
        // check_in_time with no upper bound otherwise. If checkout lands on
        // a different calendar day than check-in, treat the gap as an
        // anomaly: still record (capped) worked time for display, but never
        // fabricate an overtime entry from it — a forgotten checkout must
        // never turn into auto-approved overtime pay.
        const checkInDay = new Date(existing.check_in_time).toISOString().slice(0, 10);
        const checkOutDay = now.toISOString().slice(0, 10);
        const isMultiDayGap = checkInDay !== checkOutDay;
        const cappedWorkedMinutes = isMultiDayGap ? Math.min(workedMinutes, 24 * 60) : workedMinutes;
        const overtimeMinutes = isMultiDayGap ? 0 : rawOvertimeMinutes;

        await attendanceRepo.updateCheckOut(tenantId, userId, date, { workSummary, workedMinutes: cappedWorkedMinutes, isEarlyExit, overtimeMinutes, checkOutTime: now });

        if (shift?.ot_enabled && overtimeMinutes > 0) {
            try {
                await overtimeRepo.createEntry(
                    tenantId,
                    { user_id: userId, work_date: date, hours: Math.round((overtimeMinutes / 60) * 100) / 100, reason: 'Auto-recorded from shift overtime rule' },
                    userId,
                    shift.ot_requires_approval ? 'Pending' : 'Approved'
                );
            } catch (err) {
                // A manual overtime entry already exists for this date
                // (overtime_entries has a UNIQUE(tenant_id, user_id, work_date))
                // — leave it as the source of truth rather than erroring the
                // checkout itself.
                if (!isUniqueViolation(err)) throw err;
            }
        }

        return { id: existing.id, status: 'CheckedOut' };
    });
}

async function recordBreak({ tenantId, userId, date }) {
    const existing = await attendanceRepo.getToday(tenantId, userId, date);
    if (!existing) throw new HttpError(400, 'You have not checked in today yet.');

    const open = await attendanceRepo.getOpenBreak(tenantId, existing.id);
    if (open) throw new HttpError(400, 'A break is already in progress.');

    const id = await attendanceRepo.insertBreak(tenantId, existing.id);
    return { id };
}

async function resumeFromBreak({ tenantId, userId, date }) {
    const existing = await attendanceRepo.getToday(tenantId, userId, date);
    if (!existing) throw new HttpError(400, 'You have not checked in today yet.');

    const open = await attendanceRepo.getOpenBreak(tenantId, existing.id);
    if (!open) throw new HttpError(400, 'No break is currently in progress.');

    await attendanceRepo.closeOpenBreak(tenantId, existing.id);
    return { id: open.id };
}

async function getTodayStatus(tenantId, userId, date) {
    const attendance = await attendanceRepo.getToday(tenantId, userId, date);
    if (!attendance) return { recorded: false };

    const breaks = await attendanceRepo.listBreaks(tenantId, attendance.id);
    return { recorded: true, attendance, breaks, onBreak: breaks.some((b) => !b.break_end) };
}

module.exports = {
    validateMethodAllowed,
    validateLocation,
    validateTrackingWindow,
    recordCheckIn,
    recordCheckOut,
    recordBreak,
    resumeFromBreak,
    getTodayStatus,
};

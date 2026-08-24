// The mssql driver returns SQL `DATE` columns as JS Date objects (UTC
// midnight), but callers here also pass plain 'YYYY-MM-DD' range bounds.
// Comparing a Date directly against a string with </> silently always
// evaluates false (Date's default ToPrimitive hint is "string", so it
// stringifies to a locale-formatted value that doesn't sort like ISO
// dates) — normalize both sides to real Date objects before comparing.
function toUtcDate(value) {
    return value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
}

// Shared by server/routes/reports.routes.js and
// server/services/payrollCalculation.service.js — both need to count how
// many days of a leave request fall inside a given date range.
function getOverlappingLeaveDays(leave, rangeStart, rangeEnd) {
    if (leave.is_half_day) return 0.5;
    const leaveStart = toUtcDate(leave.start_date);
    const leaveEnd = toUtcDate(leave.end_date);
    const rStart = toUtcDate(rangeStart);
    const rEnd = toUtcDate(rangeEnd);
    const lStart = leaveStart < rStart ? rStart : leaveStart;
    const lEnd = leaveEnd > rEnd ? rEnd : leaveEnd;
    if (lStart > lEnd) return 0;
    const diffTime = lEnd - lStart;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

// True if a leave/date-ranged record overlaps [rangeStart, rangeEnd] at all
// (both bounds inclusive). Same Date-vs-string normalization as above.
function rangesOverlap(recordStart, recordEnd, rangeStart, rangeEnd) {
    const rStart = toUtcDate(recordStart);
    const rEnd = toUtcDate(recordEnd);
    const start = toUtcDate(rangeStart);
    const end = toUtcDate(rangeEnd);
    return rStart <= end && rEnd >= start;
}

module.exports = { getOverlappingLeaveDays, toUtcDate, rangesOverlap };

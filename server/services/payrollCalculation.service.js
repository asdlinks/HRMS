// The single place that turns "an employee's assigned salary structure +
// this month's attendance/leave/overtime" into gross/net pay numbers.
// Nothing here is specific to any country's statutory rules — every
// earning/deduction is a generic salary_components row (fixed amount, %
// of CTC, % of gross, % of another component, or a slab table), so an
// admin can model PF/ESI/TDS/anything else without a code change.
const { HttpError } = require('../middleware/errorHandler');
const { getOverlappingLeaveDays, rangesOverlap, toUtcDate } = require('../utils/dateRanges');
const settingsRepo = require('../repositories/settings.repository');
const attendanceRepo = require('../repositories/attendance.repository');
const leavesRepo = require('../repositories/leaves.repository');
const holidaysRepo = require('../repositories/holidays.repository');
const overtimeRepo = require('../repositories/overtime.repository');
const payrollAssignmentsRepo = require('../repositories/payrollAssignments.repository');
const payrollStructuresRepo = require('../repositories/payrollStructures.repository');
const usersRepo = require('../repositories/users.repository');

const DEFAULT_ATTENDANCE_RULES = { weekly_off_days: [0], nth_saturdays_off: [] };

// Part 6's "Payroll should validate banking information before allowing
// salary processing" — UPI ID stays optional per spec, everything else here
// is required. Bank details are entered progressively (see
// userBankingUpdateSchema), so this is the one place completeness is
// actually enforced, not at save time.
const REQUIRED_BANKING_FIELDS = ['bank_account_holder_name', 'bank_name', 'bank_branch', 'bank_account_number', 'bank_ifsc_code'];

async function assertBankingComplete(tenantId, userIds) {
    const rows = await usersRepo.listBankingByUserIds(tenantId, userIds);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const incomplete = userIds
        .map((id) => ({ id, row: byId.get(id) }))
        .filter(({ row }) => !row || REQUIRED_BANKING_FIELDS.some((f) => !row[f]));
    if (incomplete.length) {
        const names = incomplete.map(({ id, row }) => row?.name || `user #${id}`).join(', ');
        throw new HttpError(400, `Cannot process payroll — missing banking information for: ${names}`);
    }
}
const DEFAULT_PAYROLL_SETTINGS = {
    ot_rate_multiplier: 1.5,
    ot_hourly_base_component_code: null,
    standard_monthly_hours: 208,
    rounding_rule: 'nearest_1',
};

function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundNet(value, rule) {
    switch (rule) {
        case 'nearest_1': return Math.round(value);
        case 'nearest_0.5': return Math.round(value * 2) / 2;
        case 'round_up': return Math.ceil(value);
        case 'round_down': return Math.floor(value);
        case 'none':
        default: return round2(value);
    }
}

function parseSettingsMap(rows) {
    const map = {};
    rows.forEach((r) => {
        try { map[r.key] = JSON.parse(r.value); } catch (e) { map[r.key] = r.value; }
    });
    return map;
}

// Calendar days in [cycleStart, cycleEnd] that count as working days: not a
// configured weekly-off weekday, not a configured "nth Saturday off", and
// not a holiday in holidayDateSet (a Set of 'YYYY-MM-DD' strings already
// scoped to the employee's location).
function countWorkingDays(cycleStart, cycleEnd, weeklyOffDays, nthSaturdaysOff, holidayDateSet) {
    const start = toUtcDate(cycleStart);
    const end = toUtcDate(cycleEnd);
    let count = 0;
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const dow = d.getUTCDay();
        if (weeklyOffDays.includes(dow)) continue;
        if (dow === 6) {
            const nth = Math.ceil(d.getUTCDate() / 7);
            if (nthSaturdaysOff.includes(nth)) continue;
        }
        if (holidayDateSet.has(d.toISOString().slice(0, 10))) continue;
        count++;
    }
    return count;
}

// config: { base: 'gross'|'ctc'|'component:<id>', bracket_type: 'flat'|'progressive', slabs: [{min,max,amount,rate}] }
function evaluateSlab(config, baseValue) {
    const slabs = config.slabs || [];
    if (config.bracket_type === 'progressive') {
        let total = 0;
        for (const s of slabs) {
            const upper = s.max == null ? baseValue : Math.min(baseValue, s.max);
            const portion = Math.max(0, upper - s.min);
            total += portion * ((Number(s.rate) || 0) / 100);
        }
        return total;
    }
    // flat: the bracket containing baseValue contributes its flat amount.
    for (const s of slabs) {
        if (baseValue >= s.min && (s.max == null || baseValue <= s.max)) return Number(s.amount) || 0;
    }
    return 0;
}

// Resolves every component's monthly amount for one employee. `components`
// is the employee's structure's component list, each shaped:
//   { id, code, name, component_type: 'earning'|'deduction',
//     calculation_type: 'fixed'|'percent_ctc'|'percent_gross'|'percent_of_component'|'slab',
//     value, base_component_id, config, is_prorated_on_lop }
// Returns a Map<componentId, amount> with every amount already rounded to
// 2 decimals and proration applied where the component opts into it.
// Pure function, no I/O — this is what the unit test exercises directly.
function resolveComponentAmounts(components, { ctcMonthly, prorationFactor }) {
    const byId = new Map(components.map((c) => [c.id, c]));
    const amounts = new Map();
    const remaining = new Set(components.map((c) => c.id));

    const applyProration = (comp, raw) => (comp.is_prorated_on_lop ? raw * prorationFactor : raw);
    const settle = (comp, raw) => {
        amounts.set(comp.id, round2(applyProration(comp, raw)));
        remaining.delete(comp.id);
    };

    // Pass 0: no dependencies.
    for (const comp of components) {
        if (comp.calculation_type === 'fixed') settle(comp, Number(comp.value) || 0);
        else if (comp.calculation_type === 'percent_ctc') settle(comp, (ctcMonthly * (Number(comp.value) || 0)) / 100);
    }

    // Passes: percent_of_component, resolved once its base is known. Capped
    // so a cyclic base_component_id reference fails loudly instead of hanging.
    for (let guard = 0; guard < components.length + 1 && remaining.size; guard++) {
        let progressed = false;
        for (const id of Array.from(remaining)) {
            const comp = byId.get(id);
            if (comp.calculation_type !== 'percent_of_component') continue;
            if (!amounts.has(comp.base_component_id)) continue;
            settle(comp, (amounts.get(comp.base_component_id) * (Number(comp.value) || 0)) / 100);
            progressed = true;
        }
        if (!progressed) break;
    }
    const unresolvedPoc = Array.from(remaining).filter((id) => byId.get(id).calculation_type === 'percent_of_component');
    if (unresolvedPoc.length) {
        const codes = unresolvedPoc.map((id) => byId.get(id).code).join(', ');
        throw new HttpError(400, `Could not resolve component(s) ${codes} — check for a circular or missing base_component_id reference`);
    }

    // percent_gross: uses the gross of everything resolved so far (fixed,
    // percent_ctc, percent_of_component earnings) — not a circular
    // "gross including itself" definition.
    let grossSoFar = 0;
    for (const comp of components) {
        if (comp.component_type === 'earning' && amounts.has(comp.id)) grossSoFar += amounts.get(comp.id);
    }
    const percentGrossIds = Array.from(remaining).filter((id) => byId.get(id).calculation_type === 'percent_gross');
    for (const id of percentGrossIds) {
        const comp = byId.get(id);
        settle(comp, (grossSoFar * (Number(comp.value) || 0)) / 100);
    }
    // Slab components with base:'gross' see the FULL gross, including the
    // percent_gross earnings just resolved above.
    for (const id of percentGrossIds) {
        const comp = byId.get(id);
        if (comp.component_type === 'earning') grossSoFar += amounts.get(id);
    }

    const slabIds = Array.from(remaining).filter((id) => byId.get(id).calculation_type === 'slab');
    for (const id of slabIds) {
        const comp = byId.get(id);
        const config = typeof comp.config === 'string' ? JSON.parse(comp.config) : comp.config;
        let baseValue = grossSoFar;
        if (config.base === 'ctc') baseValue = ctcMonthly;
        else if (config.base && config.base.startsWith('component:')) {
            baseValue = amounts.get(Number(config.base.split(':')[1])) || 0;
        }
        settle(comp, evaluateSlab(config, baseValue));
    }

    if (remaining.size) {
        const codes = Array.from(remaining).map((id) => byId.get(id).code).join(', ');
        throw new HttpError(400, `Could not resolve component(s): ${codes}`);
    }
    return amounts;
}

// Computes every payroll_run_lines row (+ component breakdown + OT) for a
// run, ready to hand to payrollRuns.repository.js::saveComputedLines.
// Fetches shared tenant-wide data once (attendance/leaves/holidays/OT) and
// reuses it across every employee instead of one query per employee.
async function computeRunLines(tenantId, run) {
    const settingsRows = await settingsRepo.listSettings(tenantId);
    const settingsMap = parseSettingsMap(settingsRows);
    const attendanceRules = { ...DEFAULT_ATTENDANCE_RULES, ...(settingsMap.attendance_rules || {}) };
    const payrollSettings = { ...DEFAULT_PAYROLL_SETTINGS, ...(settingsMap.payroll_settings || {}) };

    const cycleStart = run.cycle_start_date;
    const cycleEnd = run.cycle_end_date;

    const activeAssignments = await payrollAssignmentsRepo.listActiveAsOf(tenantId, cycleEnd);
    if (!activeAssignments.length) return [];

    await assertBankingComplete(tenantId, activeAssignments.map((a) => a.user_id));

    const [holidays, tenantAttendance, allLeaves, otEntries] = await Promise.all([
        holidaysRepo.listBetween('holidays', tenantId, cycleStart, cycleEnd),
        attendanceRepo.listForTenantBetween(tenantId, cycleStart, cycleEnd),
        leavesRepo.listLeaves(tenantId, { scope: 'all' }),
        overtimeRepo.listApprovedUnconsumedInRangeForTenant(tenantId, cycleStart, cycleEnd),
    ]);
    const approvedLeaves = allLeaves.filter((l) => l.status === 'Approved');

    const structureComponentsCache = new Map();
    async function getStructureComponents(structureId) {
        if (!structureComponentsCache.has(structureId)) {
            const rows = await payrollStructuresRepo.listStructureComponents(tenantId, structureId);
            structureComponentsCache.set(structureId, rows.map((sc) => ({
                id: sc.component_id,
                code: sc.code,
                name: sc.name,
                component_type: sc.component_type,
                calculation_type: sc.calculation_type,
                value: sc.override_value != null ? sc.override_value : sc.value,
                base_component_id: sc.base_component_id,
                config: sc.config,
                is_prorated_on_lop: !!sc.is_prorated_on_lop,
            })));
        }
        return structureComponentsCache.get(structureId);
    }

    const lines = [];
    for (const assignment of activeAssignments) {
        const holidaySet = new Set(
            holidays
                .filter((h) => h.location_id === null || h.location_id === assignment.location_id)
                .map((h) => toUtcDate(h.date).toISOString().slice(0, 10))
        );
        const workingDays = countWorkingDays(cycleStart, cycleEnd, attendanceRules.weekly_off_days, attendanceRules.nth_saturdays_off, holidaySet);

        const presentDays = tenantAttendance.filter((a) => a.user_id === assignment.user_id).length;
        const paidLeaveDays = approvedLeaves
            .filter((l) => l.user_id === assignment.user_id && rangesOverlap(l.start_date, l.end_date, cycleStart, cycleEnd))
            .reduce((sum, l) => sum + getOverlappingLeaveDays(l, cycleStart, cycleEnd), 0);

        const lopDays = Math.min(Math.max(workingDays - presentDays - paidLeaveDays, 0), workingDays);
        const prorationFactor = workingDays > 0 ? (workingDays - lopDays) / workingDays : 1;

        const ctcMonthly = Number(assignment.ctc_annual) / 12;
        const components = await getStructureComponents(assignment.structure_id);

        const amounts = resolveComponentAmounts(components, { ctcMonthly, prorationFactor });

        let componentGross = 0;
        let totalDeductions = 0;
        const componentBreakdown = [];
        for (const comp of components) {
            const amount = amounts.get(comp.id) || 0;
            componentBreakdown.push({ componentId: comp.id, code: comp.code, name: comp.name, type: comp.component_type, amount });
            if (comp.component_type === 'earning') componentGross += amount;
            else totalDeductions += amount;
        }

        const employeeOtEntries = otEntries.filter((o) => o.user_id === assignment.user_id);
        const otHours = employeeOtEntries.reduce((sum, o) => sum + Number(o.hours), 0);
        let otAmount = 0;
        if (otHours > 0 && payrollSettings.ot_hourly_base_component_code) {
            const baseComp = components.find((c) => c.code === payrollSettings.ot_hourly_base_component_code);
            if (baseComp) {
                // OT rate is always computed off the UNPRORATED base amount —
                // a month with LOP must not also shrink the OT hourly rate.
                const unproratedAmounts = resolveComponentAmounts(components, { ctcMonthly, prorationFactor: 1 });
                const hourlyRate = (unproratedAmounts.get(baseComp.id) || 0) / payrollSettings.standard_monthly_hours;
                otAmount = round2(otHours * hourlyRate * payrollSettings.ot_rate_multiplier);
            }
        }

        const grossEarnings = round2(componentGross + otAmount);
        const netPayRaw = grossEarnings - totalDeductions;

        lines.push({
            userId: assignment.user_id,
            structureId: assignment.structure_id,
            workingDays,
            presentDays,
            paidLeaveDays,
            lopDays,
            otHours,
            otAmount,
            grossEarnings,
            totalDeductions: round2(totalDeductions),
            netPay: roundNet(netPayRaw, payrollSettings.rounding_rule),
            lineStatus: 'Computed',
            componentBreakdown,
            otEntryIds: employeeOtEntries.map((o) => o.id),
        });
    }

    return lines;
}

module.exports = {
    round2,
    roundNet,
    countWorkingDays,
    evaluateSlab,
    resolveComponentAmounts,
    computeRunLines,
};

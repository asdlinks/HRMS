// Worked-example regression test for the payroll calculation engine — see
// the "Verification" section of the Phase 4 payroll plan for the numbers
// this asserts against. Uses Node's built-in test runner (node --test),
// no new dependency needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    round2,
    roundNet,
    countWorkingDays,
    resolveComponentAmounts,
} = require('./payrollCalculation.service');

// Employee: CTC 600000/yr -> 50000/month. Cycle: 26 working days, 22
// present, 2 approved paid-leave days -> 2 LOP days -> prorationFactor =
// 24/26. 5 approved overtime hours.
const CTC_MONTHLY = 50000;
const WORKING_DAYS = 26;
const LOP_DAYS = 2;
const PRORATION_FACTOR = (WORKING_DAYS - LOP_DAYS) / WORKING_DAYS;

const COMPONENTS = [
    { id: 1, code: 'BASIC', name: 'Basic', component_type: 'earning', calculation_type: 'percent_ctc', value: 40, base_component_id: null, config: null, is_prorated_on_lop: true },
    { id: 2, code: 'HRA', name: 'HRA', component_type: 'earning', calculation_type: 'percent_of_component', value: 50, base_component_id: 1, config: null, is_prorated_on_lop: false },
    { id: 3, code: 'CONVEYANCE', name: 'Conveyance', component_type: 'earning', calculation_type: 'fixed', value: 1600, base_component_id: null, config: null, is_prorated_on_lop: false },
    { id: 4, code: 'SPECIAL_ALLOWANCE', name: 'Special Allowance', component_type: 'earning', calculation_type: 'percent_gross', value: 10, base_component_id: null, config: null, is_prorated_on_lop: false },
    { id: 5, code: 'PF_EMPLOYEE', name: 'PF (Employee)', component_type: 'deduction', calculation_type: 'percent_of_component', value: 12, base_component_id: 1, config: null, is_prorated_on_lop: false },
    {
        id: 6, code: 'PT', name: 'Professional Tax', component_type: 'deduction', calculation_type: 'slab', value: null, base_component_id: null,
        config: { base: 'gross', bracket_type: 'flat', slabs: [{ min: 0, max: 15000, amount: 0 }, { min: 15001, max: 20000, amount: 150 }, { min: 20001, max: null, amount: 200 }] },
        is_prorated_on_lop: false,
    },
];

test('resolveComponentAmounts matches the worked example, component by component', () => {
    const amounts = resolveComponentAmounts(COMPONENTS, { ctcMonthly: CTC_MONTHLY, prorationFactor: PRORATION_FACTOR });

    assert.equal(amounts.get(1), 18461.54); // BASIC
    assert.equal(amounts.get(2), 9230.77);  // HRA
    assert.equal(amounts.get(3), 1600.00);  // CONVEYANCE
    assert.equal(amounts.get(4), 2929.23);  // SPECIAL_ALLOWANCE
    assert.equal(amounts.get(5), 2215.38);  // PF_EMPLOYEE
    assert.equal(amounts.get(6), 200.00);   // PT (gross 32221.54 falls in the 20001+ bracket)
});

test('full pipeline (components + OT) matches the worked example net pay', () => {
    const amounts = resolveComponentAmounts(COMPONENTS, { ctcMonthly: CTC_MONTHLY, prorationFactor: PRORATION_FACTOR });
    let componentGross = 0;
    let totalDeductions = 0;
    for (const comp of COMPONENTS) {
        const amount = amounts.get(comp.id);
        if (comp.component_type === 'earning') componentGross += amount;
        else totalDeductions += amount;
    }
    assert.equal(round2(componentGross), 32221.54);
    assert.equal(round2(totalDeductions), 2415.38);

    // OT: 5 hours against the UNPRORATED Basic, 208 standard hours, 1.5x.
    const unprorated = resolveComponentAmounts(COMPONENTS, { ctcMonthly: CTC_MONTHLY, prorationFactor: 1 });
    const hourlyRate = unprorated.get(1) / 208;
    const otAmount = round2(5 * hourlyRate * 1.5);
    assert.equal(otAmount, 721.15);

    const grossEarnings = round2(componentGross + otAmount);
    assert.equal(grossEarnings, 32942.69);

    const netPayRaw = grossEarnings - totalDeductions;
    assert.equal(roundNet(netPayRaw, 'nearest_1'), 30527);
});

test('countWorkingDays excludes weekly-offs, nth-Saturdays-off and holidays', () => {
    // May 2026: Sundays are 3,10,17,24,31 (5 days); 2nd Saturday is May 9.
    const holidaySet = new Set(['2026-05-01']);
    const days = countWorkingDays('2026-05-01', '2026-05-31', [0], [2], holidaySet);
    // 31 calendar days - 5 Sundays - 1 (2nd Saturday) - 1 (May 1 holiday, a Friday) = 24
    assert.equal(days, 24);
});

test('resolveComponentAmounts throws a clear error on a circular base_component_id', () => {
    const cyclic = [
        { id: 1, code: 'A', name: 'A', component_type: 'earning', calculation_type: 'percent_of_component', value: 10, base_component_id: 2, config: null, is_prorated_on_lop: false },
        { id: 2, code: 'B', name: 'B', component_type: 'earning', calculation_type: 'percent_of_component', value: 10, base_component_id: 1, config: null, is_prorated_on_lop: false },
    ];
    assert.throws(() => resolveComponentAmounts(cyclic, { ctcMonthly: CTC_MONTHLY, prorationFactor: 1 }), /circular/i);
});

const { one, many, run, transaction, sql } = require('../db/sql');
const overtimeRepo = require('./overtime.repository');

function listRuns(tenantId) {
    return many(
        `SELECT pr.*, creator.name as created_by_name, approver.name as approved_by_name,
                (SELECT COUNT(*) FROM payroll_run_lines l WHERE l.run_id = pr.id) as employee_count
         FROM payroll_runs pr
         LEFT JOIN users creator ON pr.created_by = creator.id
         LEFT JOIN users approver ON pr.approved_by = approver.id
         WHERE pr.tenant_id = @tenantId
         ORDER BY pr.period_year DESC, pr.period_month DESC`,
        { tenantId: { type: sql.Int, value: tenantId } }
    );
}

function getRun(tenantId, id) {
    return one('SELECT * FROM payroll_runs WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

function getRunByPeriod(tenantId, periodYear, periodMonth) {
    return one('SELECT * FROM payroll_runs WHERE tenant_id = @tenantId AND period_year = @periodYear AND period_month = @periodMonth', {
        tenantId: { type: sql.Int, value: tenantId },
        periodYear: { type: sql.Int, value: periodYear },
        periodMonth: { type: sql.Int, value: periodMonth },
    });
}

async function createRun(tenantId, { periodYear, periodMonth, cycleStartDate, cycleEndDate }, createdBy) {
    const result = await run(
        `INSERT INTO payroll_runs (tenant_id, period_year, period_month, cycle_start_date, cycle_end_date, created_by)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @periodYear, @periodMonth, @cycleStartDate, @cycleEndDate, @createdBy)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            periodYear: { type: sql.Int, value: periodYear },
            periodMonth: { type: sql.Int, value: periodMonth },
            cycleStartDate: { type: sql.Date, value: cycleStartDate },
            cycleEndDate: { type: sql.Date, value: cycleEndDate },
            createdBy: { type: sql.Int, value: createdBy },
        }
    );
    return result.recordset[0].id;
}

function listRunLines(tenantId, runId) {
    return many(
        `SELECT l.*, u.name as user_name, u.employee_id, u.department_id
         FROM payroll_run_lines l JOIN users u ON l.user_id = u.id
         WHERE l.tenant_id = @tenantId AND l.run_id = @runId
         ORDER BY u.name`,
        { tenantId: { type: sql.Int, value: tenantId }, runId: { type: sql.Int, value: runId } }
    );
}

function getRunLine(tenantId, lineId) {
    return one(
        `SELECT l.*, u.name as user_name, u.employee_id
         FROM payroll_run_lines l JOIN users u ON l.user_id = u.id
         WHERE l.tenant_id = @tenantId AND l.id = @lineId`,
        { tenantId: { type: sql.Int, value: tenantId }, lineId: { type: sql.Int, value: lineId } }
    );
}

// Payroll Export (Phase 13D) — one row per employee in the run, enriched
// with their Employee Master banking fields. Selected directly via JOIN
// (not through users.repository.js's permission-gated helpers) since this
// query is reached through its own permission gate (payroll.approve),
// same precedent as payrollReports.repository.js's listBankTransferReport.
function listRunPaymentRows(tenantId, runId) {
    return many(
        `SELECT u.employee_id as employee_id, u.name as employee_name,
                u.bank_account_holder_name as bank_account_holder_name, u.bank_name as bank_name,
                u.bank_branch as bank_branch, u.bank_account_number as bank_account_number,
                u.bank_ifsc_code as bank_ifsc_code, u.bank_upi_id as bank_upi_id,
                l.net_pay as net_pay
         FROM payroll_run_lines l
         JOIN users u ON l.user_id = u.id AND u.tenant_id = @tenantId
         WHERE l.tenant_id = @tenantId AND l.run_id = @runId
         ORDER BY u.name`,
        { tenantId: { type: sql.Int, value: tenantId }, runId: { type: sql.Int, value: runId } }
    );
}

function getRunLineComponents(tenantId, lineId) {
    return many(
        `SELECT * FROM payroll_run_line_components WHERE tenant_id = @tenantId AND run_line_id = @lineId ORDER BY sort_order, component_name`,
        { tenantId: { type: sql.Int, value: tenantId }, lineId: { type: sql.Int, value: lineId } }
    );
}

// Wipes and rewrites every line/component for a Draft/Processing run inside
// one transaction, then stamps every consumed overtime entry with this run's
// id so it can't be double-counted by a later run. `lines` is the array
// returned by payrollCalculation.service.js::computeEmployeePayrollLine, one
// entry per employee.
function saveComputedLines(tenantId, runId, lines, processedBy = null) {
    return transaction(async (tx) => {
        const existing = await tx.many('SELECT id FROM payroll_run_lines WHERE tenant_id = @tenantId AND run_id = @runId', {
            tenantId: { type: sql.Int, value: tenantId },
            runId: { type: sql.Int, value: runId },
        });
        if (existing.length) {
            await tx.run('DELETE FROM payroll_run_lines WHERE tenant_id = @tenantId AND run_id = @runId', {
                tenantId: { type: sql.Int, value: tenantId },
                runId: { type: sql.Int, value: runId },
            });
        }

        for (const line of lines) {
            const lineResult = await tx.run(
                `INSERT INTO payroll_run_lines
                    (tenant_id, run_id, user_id, structure_id, working_days, present_days, paid_leave_days, lop_days,
                     ot_hours, ot_amount, gross_earnings, total_deductions, net_pay, line_status, remarks)
                 OUTPUT INSERTED.id
                 VALUES
                    (@tenantId, @runId, @userId, @structureId, @workingDays, @presentDays, @paidLeaveDays, @lopDays,
                     @otHours, @otAmount, @grossEarnings, @totalDeductions, @netPay, @lineStatus, @remarks)`,
                {
                    tenantId: { type: sql.Int, value: tenantId },
                    runId: { type: sql.Int, value: runId },
                    userId: { type: sql.Int, value: line.userId },
                    structureId: { type: sql.Int, value: line.structureId ?? null },
                    workingDays: { type: sql.Decimal(5, 2), value: line.workingDays },
                    presentDays: { type: sql.Decimal(5, 2), value: line.presentDays },
                    paidLeaveDays: { type: sql.Decimal(5, 2), value: line.paidLeaveDays },
                    lopDays: { type: sql.Decimal(5, 2), value: line.lopDays },
                    otHours: { type: sql.Decimal(6, 2), value: line.otHours },
                    otAmount: { type: sql.Decimal(18, 2), value: line.otAmount },
                    grossEarnings: { type: sql.Decimal(18, 2), value: line.grossEarnings },
                    totalDeductions: { type: sql.Decimal(18, 2), value: line.totalDeductions },
                    netPay: { type: sql.Decimal(18, 2), value: line.netPay },
                    lineStatus: { type: sql.NVarChar(20), value: line.lineStatus || 'Computed' },
                    remarks: { type: sql.NVarChar(sql.MAX), value: line.remarks || null },
                }
            );
            const runLineId = lineResult.recordset[0].id;

            let sortOrder = 0;
            for (const comp of line.componentBreakdown) {
                await tx.run(
                    `INSERT INTO payroll_run_line_components
                        (tenant_id, run_line_id, component_id, component_code, component_name, component_type, amount, sort_order)
                     VALUES (@tenantId, @runLineId, @componentId, @componentCode, @componentName, @componentType, @amount, @sortOrder)`,
                    {
                        tenantId: { type: sql.Int, value: tenantId },
                        runLineId: { type: sql.Int, value: runLineId },
                        componentId: { type: sql.Int, value: comp.componentId ?? null },
                        componentCode: { type: sql.NVarChar(50), value: comp.code },
                        componentName: { type: sql.NVarChar(150), value: comp.name },
                        componentType: { type: sql.NVarChar(20), value: comp.type },
                        amount: { type: sql.Decimal(18, 2), value: comp.amount },
                        sortOrder: { type: sql.Int, value: sortOrder++ },
                    }
                );
            }

            await overtimeRepo.markConsumedByRun(tx, tenantId, line.otEntryIds || [], runId);

            await tx.run(
                `IF NOT EXISTS (SELECT 1 FROM payslips WHERE tenant_id = @tenantId AND run_line_id = @runLineId)
                    INSERT INTO payslips (tenant_id, run_line_id, user_id) VALUES (@tenantId, @runLineId, @userId)`,
                {
                    tenantId: { type: sql.Int, value: tenantId },
                    runLineId: { type: sql.Int, value: runLineId },
                    userId: { type: sql.Int, value: line.userId },
                }
            );
        }

        await tx.run(
            `UPDATE payroll_runs SET status = 'Processing', processed_at = SYSUTCDATETIME(), processed_by = @processedBy WHERE tenant_id = @tenantId AND id = @runId`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                runId: { type: sql.Int, value: runId },
                processedBy: { type: sql.Int, value: processedBy },
            }
        );
    });
}

function approveRun(tenantId, runId, approverId) {
    return run(
        `UPDATE payroll_runs SET status = 'Approved', approved_by = @approverId, approved_at = SYSUTCDATETIME()
         WHERE tenant_id = @tenantId AND id = @runId AND status = 'Processing'`,
        { tenantId: { type: sql.Int, value: tenantId }, runId: { type: sql.Int, value: runId }, approverId: { type: sql.Int, value: approverId } }
    );
}

function payRun(tenantId, runId, paidBy = null) {
    return transaction(async (tx) => {
        const result = await tx.run(
            `UPDATE payroll_runs SET status = 'Paid', paid_at = SYSUTCDATETIME(), paid_by = @paidBy WHERE tenant_id = @tenantId AND id = @runId AND status = 'Approved'`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                runId: { type: sql.Int, value: runId },
                paidBy: { type: sql.Int, value: paidBy },
            }
        );
        if (result.rowsAffected > 0) {
            await tx.run(
                `UPDATE p SET is_published = 1, published_at = SYSUTCDATETIME()
                 FROM payslips p JOIN payroll_run_lines l ON p.run_line_id = l.id
                 WHERE l.tenant_id = @tenantId AND l.run_id = @runId AND p.is_published = 0`,
                { tenantId: { type: sql.Int, value: tenantId }, runId: { type: sql.Int, value: runId } }
            );
        }
        return result;
    });
}

function cancelRun(tenantId, runId) {
    return transaction(async (tx) => {
        await tx.run('UPDATE overtime_entries SET payroll_run_id = NULL WHERE tenant_id = @tenantId AND payroll_run_id = @runId', {
            tenantId: { type: sql.Int, value: tenantId },
            runId: { type: sql.Int, value: runId },
        });
        return tx.run(
            `UPDATE payroll_runs SET status = 'Cancelled' WHERE tenant_id = @tenantId AND id = @runId AND status IN ('Draft', 'Processing')`,
            { tenantId: { type: sql.Int, value: tenantId }, runId: { type: sql.Int, value: runId } }
        );
    });
}

module.exports = {
    listRuns,
    getRun,
    getRunByPeriod,
    createRun,
    listRunLines,
    getRunLine,
    listRunPaymentRows,
    getRunLineComponents,
    saveComputedLines,
    approveRun,
    payRun,
    cancelRun,
};

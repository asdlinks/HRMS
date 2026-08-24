// Payroll Export (Phase 13D, Part 6) — turns a finalized payroll run into a
// downloadable bank hand-off file. The HRMS never transfers salaries
// directly; this is the artifact an admin hands to their bank (today: a
// manual download; later, potentially an automated SFTP push) to actually
// move money.
//
// FORMAT_REGISTRY is the entire extension point. Adding a bank's exact file
// spec later is one more registry entry — a `columns` list (optionally with
// a `mapRow` transform, if that bank needs different values from the same
// underlying data, e.g. amounts in paise or a fixed-width layout) — never a
// change to payroll calculation or the run lifecycle in payrollRuns.routes.js.
// No bank has published a spec to build against yet, so only GENERIC_CSV is
// implemented below; the rest are named placeholders, not silent gaps:
//
//   HDFC_BANK, ICICI_BANK, SBI, AXIS_BANK — pending; each bank's exact
//     column order/headers/encoding hasn't been provided yet. When it is,
//     add one entry here with that bank's columns/mapRow — nothing else
//     in this file or the payroll engine needs to change.
//   SFTP_UPLOAD — a delivery mechanism, not a format. Once a concrete
//     format exists above, this would push its rendered output to a
//     configured SFTP endpoint instead of (or alongside) streaming it as a
//     browser download — a wrapper around exportRun's output, not a new
//     registry entry.
//   CUSTOM_TEMPLATE — a tenant-defined column mapping over the same row
//     shape listRunPaymentRows already returns — deferred until a real
//     customer needs it.
const { HttpError } = require('../middleware/errorHandler');
const payrollRunsRepo = require('../repositories/payrollRuns.repository');
const { streamCsv } = require('./reportExport.service');

const FORMAT_REGISTRY = {
    GENERIC_CSV: {
        label: 'Generic CSV (all fields)',
        columns: [
            { field: 'employee_id', headerName: 'Employee ID' },
            { field: 'employee_name', headerName: 'Employee Name' },
            { field: 'bank_account_holder_name', headerName: 'Account Holder Name' },
            { field: 'bank_name', headerName: 'Bank Name' },
            { field: 'bank_branch', headerName: 'Branch' },
            { field: 'bank_account_number', headerName: 'Account Number' },
            { field: 'bank_ifsc_code', headerName: 'IFSC Code' },
            { field: 'bank_upi_id', headerName: 'UPI ID' },
            { field: 'net_pay', headerName: 'Net Pay' },
        ],
    },
};

const EXPORTABLE_STATUSES = ['Approved', 'Paid'];

async function exportRun(tenantId, runId, formatCode, res) {
    const format = FORMAT_REGISTRY[formatCode || 'GENERIC_CSV'];
    if (!format) throw new HttpError(400, `Unknown export format "${formatCode}"`);

    const run = await payrollRunsRepo.getRun(tenantId, runId);
    if (!run) throw new HttpError(404, 'Payroll run not found');
    if (!EXPORTABLE_STATUSES.includes(run.status)) {
        throw new HttpError(409, `Cannot export a run in "${run.status}" status — approve it first`);
    }

    const rows = await payrollRunsRepo.listRunPaymentRows(tenantId, runId);
    const filename = `payroll-export-${run.period_year}-${String(run.period_month).padStart(2, '0')}`;

    await streamCsv(res, { filename, columns: format.columns }, async (onRow) => {
        rows.forEach(onRow);
    });
}

module.exports = { FORMAT_REGISTRY, exportRun };

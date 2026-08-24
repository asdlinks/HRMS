import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button, Stack, Card, Typography } from '@mui/material';
import type { GridColDef, GridRowParams } from '@mui/x-data-grid';
import { ArrowLeft, PlayCircle, CheckCircle2, Banknote, XCircle, Download } from 'lucide-react';
import { useSnackbar } from 'notistack';
import {
    getPayrollRun, getPayrollRunLines, getPayrollRunLine, processPayrollRun,
    approvePayrollRun, payPayrollRun, cancelPayrollRun, exportPayrollRun,
} from '../api';
import { downloadBlobResponse } from '../api/reports';
import { PageHeader, DataTable, PageSpinner, StatusBadge, ConfirmDialog } from '../components/ui';
import { PayslipView, type PayslipDetail } from '../components/payroll';
import { useAuth } from '../auth/AuthContext';
import { getErrorMessage } from '../types';

interface PayrollRun {
    id: number; period_year: number; period_month: number; status: string;
    cycle_start_date: string; cycle_end_date: string;
}
interface RunLine {
    id: number; user_id: number; user_name: string; employee_id?: string;
    working_days: number; present_days: number; paid_leave_days: number; lop_days: number;
    ot_hours: number; ot_amount: number; gross_earnings: number; total_deductions: number; net_pay: number; line_status: string;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PayrollRunDetailPage() {
    const { runId } = useParams<{ runId: string }>();
    const navigate = useNavigate();
    const { hasPermission, companyProfile } = useAuth();
    const { enqueueSnackbar } = useSnackbar();

    const [run, setRun] = useState<PayrollRun | null>(null);
    const [lines, setLines] = useState<RunLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<'approve' | 'pay' | 'cancel' | null>(null);
    const [detail, setDetail] = useState<PayslipDetail | null>(null);

    const fetchAll = useCallback(async () => {
        if (!runId) return;
        try {
            const [runResp, linesResp] = await Promise.all([getPayrollRun(runId), getPayrollRunLines(runId)]);
            setRun(runResp.data);
            setLines(linesResp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load payroll run'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runId]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const runAction = async (action: 'process' | 'approve' | 'pay' | 'cancel') => {
        if (!runId) return;
        setActionLoading(action);
        try {
            if (action === 'process') await processPayrollRun(runId);
            if (action === 'approve') await approvePayrollRun(runId);
            if (action === 'pay') await payPayrollRun(runId);
            if (action === 'cancel') await cancelPayrollRun(runId);
            enqueueSnackbar(`Run ${action === 'process' ? 'processed' : action === 'pay' ? 'marked paid' : action + 'd'}`, { variant: 'success' });
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, `Failed to ${action} run`), { variant: 'error' });
        } finally {
            setActionLoading(null);
            setConfirming(null);
        }
    };

    const handleExport = async () => {
        if (!runId || !run) return;
        setActionLoading('export');
        try {
            const resp = await exportPayrollRun(runId);
            downloadBlobResponse(resp.data, `payroll-export-${run.period_year}-${String(run.period_month).padStart(2, '0')}.csv`);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to export payroll run'), { variant: 'error' });
        } finally {
            setActionLoading(null);
        }
    };

    const openLine = async (params: GridRowParams<RunLine>) => {
        if (!run || !runId) return;
        try {
            const resp = await getPayrollRunLine(runId, params.row.id);
            setDetail({ ...resp.data, period_year: run.period_year, period_month: run.period_month, cycle_start_date: run.cycle_start_date, cycle_end_date: run.cycle_end_date });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load payslip detail'), { variant: 'error' });
        }
    };

    const columns: GridColDef<RunLine>[] = [
        { field: 'user_name', headerName: 'Employee', flex: 1, minWidth: 160 },
        { field: 'employee_id', headerName: 'ID', width: 100 },
        { field: 'working_days', headerName: 'Working', width: 90 },
        { field: 'present_days', headerName: 'Present', width: 90 },
        { field: 'paid_leave_days', headerName: 'Paid Leave', width: 100 },
        { field: 'lop_days', headerName: 'LOP', width: 80 },
        { field: 'ot_hours', headerName: 'OT (hrs)', width: 90 },
        { field: 'gross_earnings', headerName: 'Gross', width: 110, valueFormatter: (v: number) => v?.toLocaleString() },
        { field: 'total_deductions', headerName: 'Deductions', width: 110, valueFormatter: (v: number) => v?.toLocaleString() },
        { field: 'net_pay', headerName: 'Net Pay', width: 120, valueFormatter: (v: number) => v?.toLocaleString() },
    ];

    if (loading) return <PageSpinner />;
    if (!run) return null;

    const canProcess = hasPermission('payroll.process');
    const canApprove = hasPermission('payroll.approve');

    return (
        <Box className="fade-in" sx={{ maxWidth: 1400, mx: 'auto' }}>
            <PageHeader
                title={`Payroll Run — ${MONTH_NAMES[run.period_month - 1]} ${run.period_year}`}
                subtitle={`${run.cycle_start_date?.slice(0, 10)} – ${run.cycle_end_date?.slice(0, 10)}`}
                actions={<Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate('/payroll/runs')} color="inherit">Back to Runs</Button>}
            />

            <Card sx={{ p: 2.5, mb: 3 }}>
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                    <StatusBadge status={run.status} />
                    <Typography variant="body2" color="text.secondary">{lines.length} employees in this run</Typography>
                    <Box sx={{ flex: 1 }} />
                    {canProcess && ['Draft', 'Processing'].includes(run.status) && (
                        <Button variant="contained" startIcon={<PlayCircle size={16} />} disabled={!!actionLoading} onClick={() => runAction('process')}>
                            {run.status === 'Processing' ? 'Re-process' : 'Process'}
                        </Button>
                    )}
                    {canApprove && run.status === 'Processing' && (
                        <Button variant="contained" color="success" startIcon={<CheckCircle2 size={16} />} disabled={!!actionLoading} onClick={() => setConfirming('approve')}>Approve</Button>
                    )}
                    {canApprove && run.status === 'Approved' && (
                        <Button variant="contained" color="success" startIcon={<Banknote size={16} />} disabled={!!actionLoading} onClick={() => setConfirming('pay')}>Mark Paid</Button>
                    )}
                    {canApprove && ['Approved', 'Paid'].includes(run.status) && (
                        <Button variant="outlined" startIcon={<Download size={16} />} disabled={!!actionLoading} onClick={handleExport}>
                            {actionLoading === 'export' ? 'Exporting…' : 'Export for Bank Processing'}
                        </Button>
                    )}
                    {canProcess && ['Draft', 'Processing'].includes(run.status) && (
                        <Button variant="outlined" color="error" startIcon={<XCircle size={16} />} disabled={!!actionLoading} onClick={() => setConfirming('cancel')}>Cancel</Button>
                    )}
                </Stack>
            </Card>

            <DataTable
                rows={lines}
                columns={columns}
                emptyTitle="No employees in this run yet"
                emptyDescription="Click Process to compute payroll for every employee with an active salary assignment."
                onRowClick={openLine}
                sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
            />

            <PayslipView open={!!detail} onClose={() => setDetail(null)} data={detail} companyName={companyProfile?.name} />

            <ConfirmDialog
                open={confirming === 'approve'}
                title="Approve this payroll run?"
                description="Once approved, the computed amounts are frozen and can no longer be recomputed."
                confirmLabel="Approve"
                loading={actionLoading === 'approve'}
                onConfirm={() => runAction('approve')}
                onCancel={() => setConfirming(null)}
            />
            <ConfirmDialog
                open={confirming === 'pay'}
                title="Mark this run as paid?"
                description="This publishes every payslip in the run, making it visible to employees."
                confirmLabel="Mark Paid"
                loading={actionLoading === 'pay'}
                onConfirm={() => runAction('pay')}
                onCancel={() => setConfirming(null)}
            />
            <ConfirmDialog
                open={confirming === 'cancel'}
                title="Cancel this payroll run?"
                description="Any overtime hours claimed by this run will be released for a future run."
                confirmLabel="Cancel Run"
                destructive
                loading={actionLoading === 'cancel'}
                onConfirm={() => runAction('cancel')}
                onCancel={() => setConfirming(null)}
            />
        </Box>
    );
}

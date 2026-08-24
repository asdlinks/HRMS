import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import type { GridColDef, GridRowParams } from '@mui/x-data-grid';
import { Eye } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getPayslips, getPayslip, markPayslipViewed } from '../api';
import { PageHeader, DataTable, PageSpinner, StatusBadge } from '../components/ui';
import { PayslipView, type PayslipDetail } from '../components/payroll';
import { useAuth } from '../auth/AuthContext';
import { getErrorMessage } from '../types';

interface PayslipRow {
    run_line_id: number; user_id: number; user_name?: string; employee_id?: string;
    period_year: number; period_month: number; net_pay: number; gross_earnings: number; total_deductions: number;
    lop_days: number; is_published: boolean;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PayrollPayslipsPage() {
    const { enqueueSnackbar } = useSnackbar();
    const { hasPermission, companyProfile } = useAuth();
    const [rows, setRows] = useState<PayslipRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState<PayslipDetail | null>(null);

    const showEmployeeColumn = hasPermission('payroll.view.team') || hasPermission('payroll.view.all');

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const resp = await getPayslips();
            setRows(resp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load payslips'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const openPayslip = async (params: GridRowParams<PayslipRow>) => {
        try {
            const resp = await getPayslip(params.row.run_line_id);
            setDetail(resp.data);
            markPayslipViewed(params.row.run_line_id).catch(() => {});
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load payslip'), { variant: 'error' });
        }
    };

    const columns: GridColDef<PayslipRow>[] = [
        { field: 'period', headerName: 'Period', flex: 1, minWidth: 140, valueGetter: (_v, row) => `${MONTH_NAMES[row.period_month - 1]} ${row.period_year}` },
        ...(showEmployeeColumn ? [{ field: 'user_name', headerName: 'Employee', width: 180 } as GridColDef<PayslipRow>] : []),
        { field: 'gross_earnings', headerName: 'Gross', width: 110, valueFormatter: (v: number) => v?.toLocaleString() },
        { field: 'total_deductions', headerName: 'Deductions', width: 110, valueFormatter: (v: number) => v?.toLocaleString() },
        { field: 'net_pay', headerName: 'Net Pay', width: 120, valueFormatter: (v: number) => v?.toLocaleString() },
        { field: 'lop_days', headerName: 'LOP Days', width: 100 },
        { field: 'is_published', headerName: 'Status', width: 110, renderCell: (p) => <StatusBadge status={p.value ? 'Paid' : 'Pending'} /> },
        {
            field: 'actions', headerName: '', width: 60, sortable: false, filterable: false,
            renderCell: () => <Eye size={16} />,
        },
    ];

    if (loading) return <PageSpinner />;

    return (
        <Box className="fade-in" sx={{ maxWidth: 1300, mx: 'auto' }}>
            <PageHeader title="Payslips & Payroll History" subtitle="Monthly payslips, once a run is marked paid." />

            <DataTable
                rows={rows}
                columns={columns}
                getRowId={(r) => r.run_line_id}
                emptyTitle="No payslips yet"
                emptyDescription="Payslips appear here once payroll has been processed and paid."
                onRowClick={openPayslip}
                sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
            />

            <PayslipView open={!!detail} onClose={() => setDetail(null)} data={detail} companyName={companyProfile?.name} />
        </Box>
    );
}

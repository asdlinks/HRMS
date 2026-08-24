import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem, Grid2 as Grid,
} from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { Plus } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getPayrollRuns, createPayrollRun } from '../api';
import { PageHeader, DataTable, PageSpinner, StatusBadge } from '../components/ui';
import { getErrorMessage } from '../types';

interface PayrollRun {
    id: number; period_year: number; period_month: number; status: string;
    employee_count: number; created_by_name?: string; approved_by_name?: string; paid_at?: string | null;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PayrollRunsPage() {
    const { enqueueSnackbar } = useSnackbar();
    const navigate = useNavigate();
    const [runs, setRuns] = useState<PayrollRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [creating, setCreating] = useState(false);

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const resp = await getPayrollRuns();
            setRuns(resp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load payroll runs'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        setCreating(true);
        try {
            const resp = await createPayrollRun({ period_year: year, period_month: month });
            enqueueSnackbar('Payroll run created', { variant: 'success' });
            setDialogOpen(false);
            navigate(`/payroll/runs/${resp.data.id}`);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to create payroll run'), { variant: 'error' });
        } finally {
            setCreating(false);
        }
    };

    const columns: GridColDef<PayrollRun>[] = [
        { field: 'period', headerName: 'Period', flex: 1, minWidth: 160, valueGetter: (_v, row) => `${MONTH_NAMES[row.period_month - 1]} ${row.period_year}` },
        { field: 'status', headerName: 'Status', width: 140, renderCell: (p) => <StatusBadge status={p.value} /> },
        { field: 'employee_count', headerName: 'Employees', width: 120 },
        { field: 'created_by_name', headerName: 'Created By', width: 160 },
        { field: 'approved_by_name', headerName: 'Approved By', width: 160 },
    ];

    if (loading) return <PageSpinner />;

    return (
        <Box className="fade-in" sx={{ maxWidth: 1300, mx: 'auto' }}>
            <PageHeader
                title="Payroll Processing"
                subtitle="Create and run payroll for a pay cycle, then review, approve and mark it paid."
                actions={<Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setDialogOpen(true)}>New Payroll Run</Button>}
            />

            <DataTable
                rows={runs}
                columns={columns}
                emptyTitle="No payroll runs yet"
                emptyDescription="Create a run for the current pay cycle to get started."
                onRowClick={(params) => navigate(`/payroll/runs/${params.id}`)}
                sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
            />

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>New Payroll Run</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                        <Grid size={6}>
                            <FormControl fullWidth>
                                <InputLabel>Month</InputLabel>
                                <Select label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                                    {MONTH_NAMES.map((m, i) => <MenuItem key={m} value={i + 1}>{m}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={6}>
                            <FormControl fullWidth>
                                <InputLabel>Year</InputLabel>
                                <Select label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                                    {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button color="inherit" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleCreate} disabled={creating}>{creating ? 'Creating…' : 'Create Run'}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

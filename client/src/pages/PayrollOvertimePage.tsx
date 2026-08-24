import { useEffect, useState } from 'react';
import { Box, Button, IconButton, Stack, Tooltip } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { Plus, Check, X } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getOvertimeEntries, createOvertimeEntry, updateOvertimeStatus, getUsers } from '../api';
import { PageHeader, DataTable, PageSpinner, StatusBadge, ConfirmDialog } from '../components/ui';
import { OvertimeEntryFormDialog, type OvertimeFormValues, type EmployeeOption } from '../components/payroll';
import { useAuth } from '../auth/AuthContext';
import { getErrorMessage } from '../types';

interface OvertimeEntry {
    id: number; user_id: number; user_name: string; employee_id?: string;
    work_date: string; hours: number; reason?: string | null; status: string;
}

export default function PayrollOvertimePage() {
    const { enqueueSnackbar } = useSnackbar();
    const { hasPermission } = useAuth();
    const [entries, setEntries] = useState<OvertimeEntry[]>([]);
    const [employees, setEmployees] = useState<EmployeeOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [pendingReview, setPendingReview] = useState<{ id: number; status: 'Approved' | 'Rejected' } | null>(null);

    const canApply = hasPermission('payroll.overtime.apply');
    const canApprove = hasPermission('payroll.overtime.approve');

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const requests: Promise<unknown>[] = [getOvertimeEntries()];
            if (canApply) requests.push(getUsers());
            const results = await Promise.all(requests);
            setEntries((results[0] as { data: OvertimeEntry[] }).data);
            if (canApply) setEmployees((results[1] as { data: EmployeeOption[] }).data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load overtime entries'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (values: OvertimeFormValues) => {
        try {
            await createOvertimeEntry({ ...values, user_id: Number(values.user_id), hours: Number(values.hours) });
            enqueueSnackbar('Overtime submitted', { variant: 'success' });
            setDialogOpen(false);
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to submit overtime'), { variant: 'error' });
        }
    };

    const review = async (id: number, status: 'Approved' | 'Rejected') => {
        try {
            await updateOvertimeStatus(id, { status });
            enqueueSnackbar(`Overtime ${status.toLowerCase()}`, { variant: 'success' });
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to update overtime status'), { variant: 'error' });
        }
    };

    const confirmReview = () => {
        if (!pendingReview) return;
        const { id, status } = pendingReview;
        setPendingReview(null);
        review(id, status);
    };

    const columns: GridColDef<OvertimeEntry>[] = [
        { field: 'user_name', headerName: 'Employee', flex: 1, minWidth: 160 },
        { field: 'work_date', headerName: 'Date', width: 120, valueFormatter: (v: string) => v?.slice(0, 10) },
        { field: 'hours', headerName: 'Hours', width: 90 },
        { field: 'reason', headerName: 'Reason', flex: 1, minWidth: 160 },
        { field: 'status', headerName: 'Status', width: 130, renderCell: (p) => <StatusBadge status={p.value} /> },
        ...(canApprove ? [{
            field: 'actions', headerName: '', width: 110, sortable: false, filterable: false,
            renderCell: (p: { row: OvertimeEntry }) => p.row.status === 'Pending' ? (
                <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Approve"><IconButton size="small" color="success" onClick={() => setPendingReview({ id: p.row.id, status: 'Approved' })}><Check size={16} /></IconButton></Tooltip>
                    <Tooltip title="Reject"><IconButton size="small" color="error" onClick={() => setPendingReview({ id: p.row.id, status: 'Rejected' })}><X size={16} /></IconButton></Tooltip>
                </Stack>
            ) : null,
        } as GridColDef<OvertimeEntry>] : []),
    ];

    if (loading) return <PageSpinner />;

    return (
        <Box className="fade-in" sx={{ maxWidth: 1300, mx: 'auto' }}>
            <PageHeader
                title="Overtime"
                subtitle="Manual overtime entry and approval — feeds into payroll processing at a configurable hourly rate."
                actions={canApply ? <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setDialogOpen(true)}>Submit Overtime</Button> : undefined}
            />

            <DataTable rows={entries} columns={columns} emptyTitle="No overtime entries yet" />

            {canApply && (
                <OvertimeEntryFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSubmit={handleSubmit} employees={employees} />
            )}

            <ConfirmDialog
                open={!!pendingReview}
                title={`${pendingReview?.status === 'Approved' ? 'Approve' : 'Reject'} this overtime request?`}
                description={`This will mark the entry as ${pendingReview?.status.toLowerCase()}.`}
                confirmLabel={pendingReview?.status === 'Approved' ? 'Approve' : 'Reject'}
                destructive={pendingReview?.status === 'Rejected'}
                onConfirm={confirmReview}
                onCancel={() => setPendingReview(null)}
            />
        </Box>
    );
}

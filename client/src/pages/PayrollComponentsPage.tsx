import { useEffect, useState } from 'react';
import { Box, Button, IconButton, Stack, Chip } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getSalaryComponents, createSalaryComponent, updateSalaryComponent, deleteSalaryComponent } from '../api';
import { PageHeader, DataTable, ConfirmDialog, PageSpinner } from '../components/ui';
import { PayrollComponentFormDialog, type ComponentFormValues } from '../components/payroll';
import { getErrorMessage } from '../types';

interface SalaryComponent {
    id: number;
    code: string;
    name: string;
    component_type: 'earning' | 'deduction';
    calculation_type: 'fixed' | 'percent_ctc' | 'percent_gross' | 'percent_of_component' | 'slab';
    value: number | null;
    base_component_id: number | null;
    config: string | null;
    is_prorated_on_lop: boolean;
    is_active: boolean;
    sort_order: number;
}

const CALC_LABELS: Record<string, string> = {
    fixed: 'Fixed amount',
    percent_ctc: '% of CTC',
    percent_gross: '% of gross',
    percent_of_component: '% of component',
    slab: 'Slab table',
};

export default function PayrollComponentsPage() {
    const { enqueueSnackbar } = useSnackbar();
    const [components, setComponents] = useState<SalaryComponent[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<SalaryComponent | null>(null);
    const [deleting, setDeleting] = useState<SalaryComponent | null>(null);

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const resp = await getSalaryComponents();
            setComponents(resp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load salary components'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const openAdd = () => { setEditing(null); setDialogOpen(true); };
    const openEdit = (row: SalaryComponent) => { setEditing(row); setDialogOpen(true); };

    const handleSubmit = async (values: ComponentFormValues & { config: object | null }) => {
        const payload = {
            ...values,
            value: values.value === '' || values.value == null ? null : Number(values.value),
            base_component_id: values.base_component_id ? Number(values.base_component_id) : null,
            sort_order: values.sort_order ? Number(values.sort_order) : 0,
        };
        try {
            if (editing) {
                await updateSalaryComponent(editing.id, payload);
                enqueueSnackbar('Component updated', { variant: 'success' });
            } else {
                await createSalaryComponent(payload);
                enqueueSnackbar('Component created', { variant: 'success' });
            }
            setDialogOpen(false);
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to save component'), { variant: 'error' });
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        try {
            const resp = await deleteSalaryComponent(deleting.id);
            enqueueSnackbar(resp.data.deactivated ? 'Component is in use — deactivated instead of deleted' : 'Component deleted', { variant: 'success' });
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to delete component'), { variant: 'error' });
        } finally {
            setDeleting(null);
        }
    };

    const columns: GridColDef<SalaryComponent>[] = [
        { field: 'code', headerName: 'Code', width: 140, renderCell: (p) => <Chip label={p.value} size="small" variant="outlined" /> },
        { field: 'name', headerName: 'Name', flex: 1, minWidth: 160 },
        {
            field: 'component_type', headerName: 'Type', width: 120,
            renderCell: (p) => <Chip label={p.value === 'earning' ? 'Earning' : 'Deduction'} size="small" color={p.value === 'earning' ? 'success' : 'error'} variant="outlined" />,
        },
        { field: 'calculation_type', headerName: 'Calculation', width: 160, valueFormatter: (v: string) => CALC_LABELS[v] || v },
        { field: 'value', headerName: 'Value', width: 100, valueFormatter: (v: number | null) => (v == null ? '—' : v) },
        { field: 'is_active', headerName: 'Status', width: 110, renderCell: (p) => <Chip label={p.value ? 'Active' : 'Inactive'} size="small" color={p.value ? 'success' : 'default'} /> },
        {
            field: 'actions', headerName: '', width: 100, sortable: false, filterable: false,
            renderCell: (p) => (
                <Stack direction="row" spacing={0.5}>
                    <IconButton size="small" onClick={() => openEdit(p.row)}><Pencil size={16} /></IconButton>
                    <IconButton size="small" onClick={() => setDeleting(p.row)}><Trash2 size={16} /></IconButton>
                </Stack>
            ),
        },
    ];

    if (loading) return <PageSpinner />;

    return (
        <Box className="fade-in" sx={{ maxWidth: 1300, mx: 'auto' }}>
            <PageHeader
                title="Salary Components"
                subtitle="Define the earnings and deductions your organization pays with — no formula is hardcoded."
                actions={<Button variant="contained" startIcon={<Plus size={18} />} onClick={openAdd}>New Component</Button>}
            />

            <DataTable
                rows={components}
                columns={columns}
                emptyTitle="No salary components yet"
                emptyDescription="Create earnings (Basic, HRA…) and deductions (PF, tax…) to build salary structures from."
            />

            <PayrollComponentFormDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                onSubmit={handleSubmit}
                mode={editing ? 'edit' : 'add'}
                defaultValues={editing ? {
                    ...editing,
                    value: editing.value == null ? '' : String(editing.value),
                    base_component_id: editing.base_component_id ? String(editing.base_component_id) : '',
                    sort_order: String(editing.sort_order),
                } : {}}
                defaultConfig={editing?.config ? JSON.parse(editing.config) : null}
                existingComponents={components}
            />

            <ConfirmDialog
                open={!!deleting}
                title={`Delete "${deleting?.name}"?`}
                description="If this component is used in any structure or past payroll run, it will be deactivated instead of deleted."
                confirmLabel="Delete"
                destructive
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </Box>
    );
}

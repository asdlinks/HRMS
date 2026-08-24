import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, TextField, MenuItem, Button, InputAdornment } from '@mui/material';
import { Search, Plus } from 'lucide-react';
import { useSnackbar } from 'notistack';
import type { GridColDef } from '@mui/x-data-grid';
import { PageHeader, DataTable, StatusBadge } from '../../components/ui';
import { listCompanies, type Company } from '../api/companies';
import { getErrorMessage } from '../../types';

const STATUS_OPTIONS = ['all', 'trial', 'active', 'suspended', 'cancelled'];

export default function CompanyListPage() {
    const navigate = useNavigate();
    const { enqueueSnackbar } = useSnackbar();
    const [rows, setRows] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await listCompanies({
                search: search || undefined,
                status: status === 'all' ? undefined : status,
                pageSize: 100,
            });
            setRows(data.items);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load companies'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [search, status, enqueueSnackbar]);

    useEffect(() => {
        const timeout = setTimeout(load, 300); // debounce search-as-you-type
        return () => clearTimeout(timeout);
    }, [load]);

    const columns: GridColDef<Company>[] = [
        { field: 'name', headerName: 'Company', flex: 1, minWidth: 180 },
        { field: 'org_admin_name', headerName: 'Org Administrator', width: 170, valueGetter: (value) => value || '—' },
        { field: 'contact_email', headerName: 'Email', width: 190, valueGetter: (value) => value || '—' },
        { field: 'phone', headerName: 'Phone', width: 140, valueGetter: (value) => value || '—' },
        { field: 'plan', headerName: 'Plan', width: 110, valueGetter: (value) => (value ? String(value).charAt(0).toUpperCase() + String(value).slice(1) : '—') },
        {
            field: 'status', headerName: 'Status', width: 120,
            renderCell: (params) => <StatusBadge status={params.value as string} />,
        },
        { field: 'employee_count', headerName: 'Employees', width: 110, type: 'number' },
        { field: 'active_user_count', headerName: 'Active Users', width: 120, type: 'number' },
        {
            field: 'created_at', headerName: 'Created', width: 130,
            valueFormatter: (value) => (value ? new Date(value as string).toLocaleDateString() : ''),
        },
        {
            field: 'last_login_at', headerName: 'Last Login', width: 150,
            valueFormatter: (value) => (value ? new Date(value as string).toLocaleDateString() : 'Never'),
        },
    ];

    return (
        <Box>
            <PageHeader
                title="Companies"
                subtitle="Onboard and manage customer companies"
                actions={
                    <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => navigate('/platform-admin/companies/new')}>
                        New Company
                    </Button>
                }
            />

            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <TextField
                    placeholder="Search by name or company code"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    sx={{ minWidth: 280 }}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> } }}
                />
                <TextField select value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 160 }}>
                    {STATUS_OPTIONS.map((s) => (
                        <MenuItem key={s} value={s}>{s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>
                    ))}
                </TextField>
            </Box>

            <DataTable
                rows={rows}
                columns={columns}
                loading={loading}
                emptyTitle="No companies yet"
                emptyDescription="Create the first company to get started."
                onRowClick={(params) => navigate(`/platform-admin/companies/${params.id}`)}
                sx={{ cursor: 'pointer' }}
            />
        </Box>
    );
}

import { useEffect, useState } from 'react';
import { Box, Button, IconButton, Stack, Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField, List, ListItem, ListItemText, Checkbox, Typography } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getAttendancePolicies, createAttendancePolicy, updateAttendancePolicy, deleteAttendancePolicy, assignAttendancePolicy, getUsers } from '../api';
import { PageHeader, DataTable, ConfirmDialog, PageSpinner } from '../components/ui';
import { MethodBadge } from '../components/attendance';
import AttendancePolicyFormDialog, { type PolicySubmitPayload, type PolicyFormValues } from '../components/attendanceAdmin/AttendancePolicyFormDialog';
import { getErrorMessage } from '../types';

interface AttendancePolicy {
    id: number;
    name: string;
    policy_type: string;
    allowed_methods: string; // JSON string from server
    config: string | null;
    is_active: boolean;
}
interface EmployeeUser { id: number; name: string; attendance_policy_id: number | null }

function parseMethods(json: string): string[] {
    try { return JSON.parse(json) || []; } catch { return []; }
}

export default function AttendancePoliciesPage() {
    const { enqueueSnackbar } = useSnackbar();
    const [policies, setPolicies] = useState<AttendancePolicy[]>([]);
    const [employees, setEmployees] = useState<EmployeeUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<AttendancePolicy | null>(null);
    const [deleting, setDeleting] = useState<AttendancePolicy | null>(null);
    const [assigning, setAssigning] = useState<AttendancePolicy | null>(null);
    const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
    const [employeeFilter, setEmployeeFilter] = useState('');
    const [assignSaving, setAssignSaving] = useState(false);

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const [policiesResp, usersResp] = await Promise.all([getAttendancePolicies(), getUsers('all')]);
            setPolicies(policiesResp.data);
            setEmployees(usersResp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load attendance policies'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const openAdd = () => { setEditing(null); setDialogOpen(true); };
    const openEdit = (row: AttendancePolicy) => { setEditing(row); setDialogOpen(true); };

    const handleSubmit = async (values: PolicySubmitPayload) => {
        try {
            if (editing) {
                await updateAttendancePolicy(editing.id, values);
                enqueueSnackbar('Policy updated', { variant: 'success' });
            } else {
                await createAttendancePolicy(values);
                enqueueSnackbar('Policy created', { variant: 'success' });
            }
            setDialogOpen(false);
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to save policy'), { variant: 'error' });
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        try {
            await deleteAttendancePolicy(deleting.id);
            enqueueSnackbar('Policy deleted', { variant: 'success' });
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to delete policy'), { variant: 'error' });
        } finally {
            setDeleting(null);
        }
    };

    const openAssign = (policy: AttendancePolicy) => {
        setAssigning(policy);
        setSelectedUserIds(employees.filter((e) => e.attendance_policy_id === policy.id).map((e) => e.id));
        setEmployeeFilter('');
    };

    const toggleUser = (id: number) => {
        setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
    };

    const saveAssignments = async () => {
        if (!assigning) return;
        setAssignSaving(true);
        try {
            const currentlyAssigned = employees.filter((e) => e.attendance_policy_id === assigning.id).map((e) => e.id);
            const toAssign = selectedUserIds.filter((id) => !currentlyAssigned.includes(id));
            const toClear = currentlyAssigned.filter((id) => !selectedUserIds.includes(id));
            await Promise.all([
                ...toAssign.map((id) => assignAttendancePolicy(id, assigning.id)),
                ...toClear.map((id) => assignAttendancePolicy(id, null)),
            ]);
            enqueueSnackbar('Assignments updated', { variant: 'success' });
            setAssigning(null);
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to update assignments'), { variant: 'error' });
        } finally {
            setAssignSaving(false);
        }
    };

    const columns: GridColDef<AttendancePolicy>[] = [
        { field: 'name', headerName: 'Name', flex: 1, minWidth: 160 },
        { field: 'policy_type', headerName: 'Type', width: 130 },
        {
            field: 'allowed_methods', headerName: 'Allowed Methods', flex: 1.5, minWidth: 260,
            renderCell: (p) => (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ py: 0.5 }}>
                    {parseMethods(p.value as string).map((m) => <MethodBadge key={m} method={m} />)}
                </Stack>
            ),
        },
        {
            field: 'assigned', headerName: 'Assigned', width: 100,
            valueGetter: (_v, row) => employees.filter((e) => e.attendance_policy_id === row.id).length,
        },
        { field: 'is_active', headerName: 'Status', width: 100, renderCell: (p) => <Chip label={p.value ? 'Active' : 'Inactive'} size="small" color={p.value ? 'success' : 'default'} /> },
        {
            field: 'actions', headerName: '', width: 140, sortable: false, filterable: false,
            renderCell: (p) => (
                <Stack direction="row" spacing={0.5}>
                    <IconButton size="small" title="Assign to employees" onClick={() => openAssign(p.row)}><Users size={16} /></IconButton>
                    <IconButton size="small" onClick={() => openEdit(p.row)}><Pencil size={16} /></IconButton>
                    <IconButton size="small" onClick={() => setDeleting(p.row)}><Trash2 size={16} /></IconButton>
                </Stack>
            ),
        },
    ];

    if (loading) return <PageSpinner />;

    const filteredEmployees = employeeFilter
        ? employees.filter((e) => e.name.toLowerCase().includes(employeeFilter.toLowerCase()))
        : employees;

    return (
        <Box className="fade-in" sx={{ maxWidth: 1300, mx: 'auto' }}>
            <PageHeader
                title="Attendance Policies"
                subtitle="Define which check-in methods each employee segment (Office, Hybrid, Remote, Field) may use — nothing is hardcoded."
                actions={<Button variant="contained" startIcon={<Plus size={18} />} onClick={openAdd}>New Policy</Button>}
            />

            <DataTable
                rows={policies}
                columns={columns}
                emptyTitle="No attendance policies yet"
                emptyDescription="Create a policy (e.g. Office Only, Hybrid, Remote, Field Staff) and assign it to employees."
            />

            <AttendancePolicyFormDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                onSubmit={handleSubmit}
                mode={editing ? 'edit' : 'add'}
                defaultValues={editing ? {
                    name: editing.name,
                    policy_type: editing.policy_type as PolicyFormValues['policy_type'],
                    allowed_methods: parseMethods(editing.allowed_methods) as PolicyFormValues['allowed_methods'],
                    is_active: editing.is_active,
                    geofence_lat: editing.config ? String(JSON.parse(editing.config)?.geofence_center_lat ?? '') : '',
                    geofence_lng: editing.config ? String(JSON.parse(editing.config)?.geofence_center_lng ?? '') : '',
                    geofence_radius: editing.config ? String(JSON.parse(editing.config)?.geofence_radius_meters ?? '') : '',
                } : {}}
            />

            <ConfirmDialog
                open={!!deleting}
                title={`Delete "${deleting?.name}"?`}
                description="Employees assigned to this policy will lose their attendance method access until reassigned."
                confirmLabel="Delete"
                destructive
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />

            <Dialog open={!!assigning} onClose={() => setAssigning(null)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>Assign "{assigning?.name}"</DialogTitle>
                <DialogContent>
                    <TextField
                        placeholder="Search employees…" fullWidth size="small" value={employeeFilter}
                        onChange={(e) => setEmployeeFilter(e.target.value)} sx={{ mb: 1.5 }}
                    />
                    <List dense sx={{ maxHeight: 320, overflow: 'auto' }}>
                        {filteredEmployees.map((emp) => (
                            <ListItem key={emp.id} disablePadding onClick={() => toggleUser(emp.id)} sx={{ cursor: 'pointer' }}>
                                <Checkbox size="small" checked={selectedUserIds.includes(emp.id)} />
                                <ListItemText primary={emp.name} />
                            </ListItem>
                        ))}
                        {filteredEmployees.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>No employees found.</Typography>}
                    </List>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button onClick={() => setAssigning(null)} color="inherit" disabled={assignSaving}>Cancel</Button>
                    <Button variant="contained" onClick={saveAssignments} disabled={assignSaving}>
                        {assignSaving ? 'Saving…' : 'Save Assignments'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

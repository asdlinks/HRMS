import { useEffect, useState } from 'react';
import {
    Box, Card, List, ListItemButton, ListItemIcon, ListItemText, IconButton, Typography,
    Button, Stack, TextField, MenuItem, Select, InputLabel, FormControl, Checkbox, FormControlLabel,
    Dialog, DialogTitle, DialogContent, DialogActions, Divider, Autocomplete,
} from '@mui/material';
import { Clock9, Plus, Trash2 } from 'lucide-react';
import { useSnackbar } from 'notistack';
import {
    getShifts, createShift, updateShift, deleteShift,
    getUsers, getShiftAssignments, createShiftAssignment,
} from '../api';
import { PageHeader, EmptyState, PageSpinner, ConfirmDialog } from '../components/ui';
import { getErrorMessage } from '../types';
import { useAuth } from '../auth/AuthContext';

const SHIFT_TYPES = ['General', 'Flexible', 'Night', 'Rotational', 'Split'];
const BREAK_TYPES = [
    { value: 'none', label: 'No break' },
    { value: 'unpaid_duration', label: 'Unpaid duration' },
    { value: 'paid_duration', label: 'Paid duration' },
    { value: 'fixed_window', label: 'Fixed window' },
];

interface Shift {
    id: number; name: string; shift_type: string; start_time?: string | null; end_time?: string | null;
    is_overnight: boolean; time_windows?: { start: string; end: string }[] | string | null;
    expected_work_minutes: number; grace_period_minutes: number; early_exit_threshold_minutes: number;
    break_type: string; break_duration_minutes?: number | null; break_window_start?: string | null; break_window_end?: string | null;
    ot_enabled: boolean; ot_trigger_after_minutes?: number | null; ot_requires_approval: boolean;
    is_active: boolean;
}
interface Employee { id: number; name: string }
interface AssignmentRow { id: number; shift_id: number; shift_name: string; effective_from: string; effective_to: string | null }

const emptyForm = {
    name: '', shift_type: 'General', start_time: '09:00', end_time: '18:00', is_overnight: false,
    time_windows: [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '18:00' }],
    expected_work_minutes: 480, grace_period_minutes: 10, early_exit_threshold_minutes: 0,
    break_type: 'none', break_duration_minutes: 60, break_window_start: '13:00', break_window_end: '14:00',
    ot_enabled: false, ot_trigger_after_minutes: 0, ot_requires_approval: true, is_active: true,
};

export default function ShiftsPage() {
    const { enqueueSnackbar } = useSnackbar();
    const { hasPermission } = useAuth();
    const canManage = hasPermission('shifts.manage');
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Shift | null>(null);
    const [deleting, setDeleting] = useState<Shift | null>(null);
    const [form, setForm] = useState(emptyForm);

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [assignEmployee, setAssignEmployee] = useState<Employee | null>(null);
    const [assignShiftId, setAssignShiftId] = useState('');
    const [assignDate, setAssignDate] = useState(new Date().toISOString().slice(0, 10));
    const [history, setHistory] = useState<AssignmentRow[]>([]);
    const [assigning, setAssigning] = useState(false);

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (assignEmployee) fetchHistory(assignEmployee.id); else setHistory([]); }, [assignEmployee]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const [shiftsResp, usersResp] = await Promise.all([getShifts(), getUsers()]);
            setShifts(shiftsResp.data);
            setEmployees(usersResp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load shifts'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async (userId: number) => {
        try {
            const resp = await getShiftAssignments(userId);
            setHistory(resp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load shift history'), { variant: 'error' });
        }
    };

    const openAdd = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
    const openEdit = (s: Shift) => {
        setEditing(s);
        setForm({
            ...emptyForm,
            ...s,
            time_windows: Array.isArray(s.time_windows) ? s.time_windows : emptyForm.time_windows,
        } as typeof emptyForm);
        setDialogOpen(true);
    };

    const handleSubmit = async () => {
        try {
            const payload = {
                ...form,
                time_windows: form.shift_type === 'Split' ? form.time_windows : null,
            };
            if (editing) {
                await updateShift(editing.id, payload);
                enqueueSnackbar('Shift updated', { variant: 'success' });
            } else {
                await createShift(payload);
                enqueueSnackbar('Shift created', { variant: 'success' });
            }
            setDialogOpen(false);
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to save shift'), { variant: 'error' });
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        try {
            await deleteShift(deleting.id);
            setShifts((prev) => prev.filter((s) => s.id !== deleting.id));
            enqueueSnackbar('Shift deleted', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to delete shift'), { variant: 'error' });
        } finally {
            setDeleting(null);
        }
    };

    const handleAssign = async () => {
        if (!assignEmployee || !assignShiftId) return;
        setAssigning(true);
        try {
            await createShiftAssignment({ user_id: assignEmployee.id, shift_id: Number(assignShiftId), effective_from: assignDate });
            enqueueSnackbar('Shift assigned', { variant: 'success' });
            fetchHistory(assignEmployee.id);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to assign shift'), { variant: 'error' });
        } finally {
            setAssigning(false);
        }
    };

    const updateWindow = (index: number, field: 'start' | 'end', value: string) => {
        setForm((prev) => {
            const next = [...prev.time_windows];
            next[index] = { ...next[index], [field]: value };
            return { ...prev, time_windows: next };
        });
    };

    if (loading) return <PageSpinner />;

    return (
        <Box className="fade-in" sx={{ maxWidth: 1300, mx: 'auto' }}>
            <PageHeader
                title="Shift Management"
                subtitle="Define working hours, breaks, grace periods and overtime rules that attendance automatically applies."
                actions={canManage && <Button variant="contained" startIcon={<Plus size={18} />} onClick={openAdd}>New Shift</Button>}
            />

            {shifts.length === 0 ? (
                <EmptyState icon={<Clock9 size={28} />} title="No shifts configured yet" description="Create a shift to start assigning it to employees." />
            ) : (
                <Card sx={{ mb: 3 }}>
                    <List>
                        {shifts.map((s) => (
                            <ListItemButton key={s.id} onClick={() => canManage && openEdit(s)} disableRipple={!canManage} sx={{ borderRadius: 2, mx: 1, my: 0.5, cursor: canManage ? 'pointer' : 'default' }}>
                                <ListItemIcon sx={{ minWidth: 36 }}><Clock9 size={18} /></ListItemIcon>
                                <ListItemText
                                    primary={s.name}
                                    secondary={`${s.shift_type}${s.start_time ? ` · ${s.start_time}–${s.end_time || ''}` : ''} · grace ${s.grace_period_minutes}m${s.ot_enabled ? ' · OT enabled' : ''}`}
                                />
                                {canManage && <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDeleting(s); }}><Trash2 size={14} /></IconButton>}
                            </ListItemButton>
                        ))}
                    </List>
                </Card>
            )}

            <Card sx={{ p: { xs: 2, sm: 3 } }}>
                <Typography variant="h6" sx={{ mb: 0.5 }}>Assign Shift to Employee</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Assigning a shift closes any current assignment the day before and starts the new one — rotational shifts are just a sequence of these.
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                    <Autocomplete
                        options={employees}
                        getOptionLabel={(o) => o.name}
                        value={assignEmployee}
                        onChange={(_e, val) => setAssignEmployee(val)}
                        sx={{ minWidth: 240 }}
                        renderInput={(params) => <TextField {...params} label="Employee" />}
                    />
                    <FormControl sx={{ minWidth: 200 }}>
                        <InputLabel>Shift</InputLabel>
                        <Select label="Shift" value={assignShiftId} onChange={(e) => setAssignShiftId(e.target.value)}>
                            {shifts.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <TextField label="Effective From" type="date" value={assignDate} onChange={(e) => setAssignDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                    {canManage && (
                        <Button variant="contained" disabled={!assignEmployee || !assignShiftId || assigning} onClick={handleAssign}>
                            {assigning ? 'Assigning…' : 'Assign'}
                        </Button>
                    )}
                </Stack>

                {assignEmployee && (
                    <>
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>History — {assignEmployee.name}</Typography>
                        {history.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">No shift assignments yet.</Typography>
                        ) : (
                            <Stack spacing={1}>
                                {history.map((h) => (
                                    <Stack key={h.id} direction="row" spacing={2} sx={{ p: 1.25, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                                        <Typography sx={{ fontWeight: 600, flex: 1 }}>{h.shift_name}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {h.effective_from?.slice(0, 10)} – {h.effective_to ? h.effective_to.slice(0, 10) : 'present'}
                                        </Typography>
                                    </Stack>
                                ))}
                            </Stack>
                        )}
                    </>
                )}
            </Card>

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{editing ? 'Edit Shift' : 'New Shift'}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField label="Shift Name" fullWidth required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                        <FormControl fullWidth>
                            <InputLabel>Shift Type</InputLabel>
                            <Select label="Shift Type" value={form.shift_type} onChange={(e) => setForm({ ...form, shift_type: e.target.value })}>
                                {SHIFT_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                            </Select>
                        </FormControl>

                        {form.shift_type === 'Split' ? (
                            <Box>
                                <Typography variant="caption" color="text.secondary">Work windows</Typography>
                                {form.time_windows.map((w, i) => (
                                    <Stack key={i} direction="row" spacing={1.5} sx={{ mt: 1 }}>
                                        <TextField label="Start" type="time" value={w.start} onChange={(e) => updateWindow(i, 'start', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                                        <TextField label="End" type="time" value={w.end} onChange={(e) => updateWindow(i, 'end', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                                    </Stack>
                                ))}
                            </Box>
                        ) : (
                            <Stack direction="row" spacing={2}>
                                <TextField label="Start Time" type="time" fullWidth value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                                <TextField label="End Time" type="time" fullWidth value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                            </Stack>
                        )}

                        {form.shift_type === 'Night' && (
                            <FormControlLabel
                                control={<Checkbox checked={form.is_overnight} onChange={(e) => setForm({ ...form, is_overnight: e.target.checked })} />}
                                label="End time is on the next calendar day"
                            />
                        )}

                        <Stack direction="row" spacing={2}>
                            <TextField label="Expected Work (minutes)" type="number" fullWidth value={form.expected_work_minutes} onChange={(e) => setForm({ ...form, expected_work_minutes: Number(e.target.value) })} />
                            <TextField label="Grace Period (minutes)" type="number" fullWidth value={form.grace_period_minutes} onChange={(e) => setForm({ ...form, grace_period_minutes: Number(e.target.value) })} />
                            <TextField label="Early Exit Threshold (min)" type="number" fullWidth value={form.early_exit_threshold_minutes} onChange={(e) => setForm({ ...form, early_exit_threshold_minutes: Number(e.target.value) })} />
                        </Stack>

                        <FormControl fullWidth>
                            <InputLabel>Break Type</InputLabel>
                            <Select label="Break Type" value={form.break_type} onChange={(e) => setForm({ ...form, break_type: e.target.value })}>
                                {BREAK_TYPES.map((b) => <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>)}
                            </Select>
                        </FormControl>
                        {(form.break_type === 'unpaid_duration' || form.break_type === 'paid_duration') && (
                            <TextField label="Break Duration (minutes)" type="number" value={form.break_duration_minutes} onChange={(e) => setForm({ ...form, break_duration_minutes: Number(e.target.value) })} />
                        )}
                        {form.break_type === 'fixed_window' && (
                            <Stack direction="row" spacing={2}>
                                <TextField label="Break Start" type="time" fullWidth value={form.break_window_start} onChange={(e) => setForm({ ...form, break_window_start: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                                <TextField label="Break End" type="time" fullWidth value={form.break_window_end} onChange={(e) => setForm({ ...form, break_window_end: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                            </Stack>
                        )}

                        <FormControlLabel
                            control={<Checkbox checked={form.ot_enabled} onChange={(e) => setForm({ ...form, ot_enabled: e.target.checked })} />}
                            label="Enable overtime for this shift"
                        />
                        {form.ot_enabled && (
                            <>
                                <TextField label="OT Trigger After (minutes past expected work)" type="number" value={form.ot_trigger_after_minutes} onChange={(e) => setForm({ ...form, ot_trigger_after_minutes: Number(e.target.value) })} />
                                <FormControlLabel
                                    control={<Checkbox checked={form.ot_requires_approval} onChange={(e) => setForm({ ...form, ot_requires_approval: e.target.checked })} />}
                                    label="Overtime requires manager approval"
                                />
                            </>
                        )}

                        <FormControlLabel
                            control={<Checkbox checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />}
                            label="Active"
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button color="inherit" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleSubmit} disabled={!form.name}>
                        {editing ? 'Save Changes' : 'Create Shift'}
                    </Button>
                </DialogActions>
            </Dialog>

            <ConfirmDialog
                open={!!deleting}
                title={`Delete "${deleting?.name}"?`}
                description="Shifts assigned to an employee cannot be deleted."
                confirmLabel="Delete"
                destructive
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </Box>
    );
}

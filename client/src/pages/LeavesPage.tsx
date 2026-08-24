import { useState, useEffect, useMemo, type FormEvent } from 'react';
import {
    Box, Card, Typography, Stack, Button, Drawer, IconButton, Autocomplete, TextField,
    ToggleButtonGroup, ToggleButton, LinearProgress, Chip,
} from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { Send, Plus, X, ClipboardList } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getLeaves, applyLeave, getHolidays, getSettings, getUsers, updateLeaveStatus, getFlexiHolidays } from '../api';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, DataTable, StatusBadge, PageSpinner, ConfirmDialog } from '../components/ui';
import { getErrorMessage, type AuthUser, type LeaveAllocation } from '../types';

interface Leave {
    id: number; user_id: number; user_name?: string; type: string; status: string;
    start_date: string; end_date: string; reason?: string; is_half_day: number | boolean;
}
interface Holiday { id: number; name: string; date: string }
interface EmployeeUser { id: number; name: string; role: string; joining_date?: string; probation_period?: number | string }

export default function LeavesPage() {
    const { user, hasPermission, hasAnyPermission } = useAuth() as { user: AuthUser } & ReturnType<typeof useAuth>;
    const { enqueueSnackbar } = useSnackbar();
    const canApplyForOthers = hasPermission('leaves.apply.any');
    const canApprove = hasPermission('leaves.approve');
    const canSeeEmployeeColumn = hasAnyPermission(['leaves.view.team', 'leaves.view.all']);

    const [leaves, setLeaves] = useState<Leave[]>([]);
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [settings, setSettings] = useState<{ leave_allocations: LeaveAllocation[] }>({ leave_allocations: [{ type: 'casual', days: 15 }] });
    const [employees, setEmployees] = useState<EmployeeUser[]>([]);
    const [flexiHolidays, setFlexiHolidays] = useState<Holiday[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'>('All');

    const [formData, setFormData] = useState({
        user_id: canApplyForOthers ? '' : String(user.id),
        type: 'casual',
        start_date: '',
        end_date: '',
        reason: '',
        flexi_holiday_id: '',
        is_half_day: 0,
        half_day_session: null as string | null,
    });

    useEffect(() => {
        fetchData();
        if (canApplyForOthers) fetchEmployees();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchEmployees = async () => {
        try {
            const resp = await getUsers('all');
            setEmployees(resp.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchData = async () => {
        try {
            const [leavesResp, holidaysResp, settingsResp, flexiResp] = await Promise.all([
                getLeaves(), getHolidays(user.location_id ?? undefined), getSettings(), getFlexiHolidays(user.location_id ?? undefined),
            ]);
            setLeaves(leavesResp.data.filter((l: Leave & { role?: string }) => l.role !== 'super_admin'));
            setHolidays(holidaysResp.data);
            setFlexiHolidays(flexiResp.data);

            let allocations: LeaveAllocation[] = [];
            try {
                if (settingsResp.data.leave_allocations) {
                    allocations = typeof settingsResp.data.leave_allocations === 'string'
                        ? JSON.parse(settingsResp.data.leave_allocations) : settingsResp.data.leave_allocations;
                }
            } catch { /* fall through to default */ }
            if (allocations.length === 0) allocations = [{ type: 'casual', days: 15 }];
            setSettings({ leave_allocations: allocations });

            const typeNames = allocations.map((a) => a.type);
            setFormData((prev) => (typeNames.includes(prev.type) || typeNames.length === 0 ? prev : { ...prev, type: typeNames[0] }));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const isProbationActive = () => {
        const emp = canApplyForOthers ? employees.find((e) => String(e.id) === String(formData.user_id)) : user;
        if (!emp || !emp.joining_date || !emp.probation_period) return false;
        const joiningDate = new Date(emp.joining_date);
        const probationEndDate = new Date(joiningDate);
        probationEndDate.setMonth(probationEndDate.getMonth() + parseInt(String(emp.probation_period), 10));
        return new Date() < probationEndDate;
    };

    const getUsedLeavesForType = (empId: string | number, leaveType: string) => {
        const currentYear = new Date().getFullYear();
        return leaves
            .filter((l) => String(l.user_id) === String(empId) && l.status === 'Approved' && l.type.toLowerCase() === leaveType.toLowerCase() && new Date(l.start_date).getFullYear() === currentYear)
            .reduce((sum, l) => {
                if (Number(l.is_half_day) === 1) return sum + 0.5;
                const diffDays = Math.ceil((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / 86400000) + 1;
                return sum + (isNaN(diffDays) ? 1 : diffDays);
            }, 0);
    };

    const getAvailableLeaves = (alloc: LeaveAllocation) => {
        const empId = formData.user_id || (!canApplyForOthers ? user.id : '');
        if (!empId) return alloc.days;
        return alloc.days - getUsedLeavesForType(empId, alloc.type);
    };

    const getUsedFlexiHolidays = (empId: string | number) => {
        const currentYear = new Date().getFullYear();
        return leaves.filter((l) => String(l.user_id) === String(empId) && l.type === 'Flexi Holiday' && l.status !== 'Rejected' && new Date(l.start_date).getFullYear() === currentYear).length;
    };

    const isHolidayOrSunday = (dateStr: string) => {
        const date = new Date(dateStr);
        if (date.getDay() === 0) return true;
        return holidays.some((h) => h.date === dateStr);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (isProbationActive() && formData.type === 'paid') {
            enqueueSnackbar('Earned Leave is not available during your probation period.', { variant: 'error' });
            return;
        }
        if (isHolidayOrSunday(formData.start_date) || isHolidayOrSunday(formData.end_date)) {
            enqueueSnackbar('You cannot select a Sunday or Holiday as start/end date.', { variant: 'error' });
            return;
        }
        setSubmitting(true);
        try {
            const resp = await applyLeave(formData);
            const isAutoApproved = resp.data.status === 'Approved';
            setDrawerOpen(false);
            enqueueSnackbar(
                isAutoApproved ? (formData.type === 'Flexi Holiday' ? 'Flexi Holiday selected!' : 'Leave recorded and approved!') : 'Leave application submitted for approval!',
                { variant: 'success' },
            );
            setFormData({
                user_id: canApplyForOthers ? '' : String(user.id),
                type: settings.leave_allocations[0]?.type || 'casual',
                start_date: '', end_date: '', reason: '', flexi_holiday_id: '', is_half_day: 0, half_day_session: null,
            });
            fetchData();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to record leave. Please try again.'), { variant: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const [pendingStatusUpdate, setPendingStatusUpdate] = useState<{ id: number; status: string } | null>(null);

    const handleStatusUpdate = async (id: number, status: string) => {
        setLeaves((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
        try {
            await updateLeaveStatus(id, { status });
            enqueueSnackbar(`Leave ${status.toLowerCase()} successfully!`, { variant: 'success' });
            fetchData();
        } catch {
            fetchData();
            enqueueSnackbar('Failed to update leave status.', { variant: 'error' });
        }
    };

    const confirmStatusUpdate = () => {
        if (!pendingStatusUpdate) return;
        const { id, status } = pendingStatusUpdate;
        setPendingStatusUpdate(null);
        handleStatusUpdate(id, status);
    };

    const employeeOptions = employees.filter((e) => e.role !== 'super_admin').map((e) => ({ id: e.id, label: e.name }));

    const leaveTypeOptions = [
        ...settings.leave_allocations.map((alloc) => {
            const isEarned = alloc.type.toLowerCase().includes('earned') || alloc.type.toLowerCase().includes('paid');
            const disabled = isProbationActive() && isEarned;
            const empId = formData.user_id || (!canApplyForOthers ? user.id : '');
            const available = empId ? getAvailableLeaves(alloc) : null;
            return {
                id: alloc.type,
                label: `${alloc.type.charAt(0).toUpperCase() + alloc.type.slice(1)} Leave${available !== null ? ` (${available} left)` : ''}${disabled ? ' — Unavailable in Probation' : ''}`,
                disabled,
            };
        }),
        {
            id: 'Flexi Holiday',
            label: `Flexi Holiday${(formData.user_id || !canApplyForOthers) ? ` (${2 - getUsedFlexiHolidays(formData.user_id || user.id)} left)` : ''}`,
            disabled: false,
        },
    ];

    const flexiOptions = flexiHolidays.map((h) => {
        const isUsed = leaves.some((l) => l.type === 'Flexi Holiday' && l.status !== 'Rejected' && l.start_date === h.date);
        return { id: h.id, label: `${h.name} (${new Date(h.date).toLocaleDateString()})${isUsed ? ' — Already Selected' : ''}`, disabled: isUsed, holiday: h };
    });

    const columns: GridColDef<Leave>[] = useMemo(() => {
        const cols: GridColDef<Leave>[] = [];
        if (canSeeEmployeeColumn) {
            cols.push({ field: 'user_name', headerName: 'Employee', flex: 1, minWidth: 140, renderCell: (p) => <strong>{p.value}</strong> });
        }
        cols.push(
            {
                field: 'type', headerName: 'Leave Type', flex: 1, minWidth: 140,
                renderCell: (p) => <span style={{ textTransform: 'capitalize' }}>{p.value} {p.row.is_half_day ? '(½ Day)' : ''}</span>,
            },
            {
                field: 'start_date', headerName: 'Dates', flex: 1.2, minWidth: 180,
                renderCell: (p) => {
                    const start = new Date(p.row.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                    if (p.row.is_half_day) return <span>{start} — Half Day</span>;
                    const end = new Date(p.row.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                    return <span>{start} → {end}</span>;
                },
            },
            {
                field: 'status', headerName: 'Status', width: 140,
                renderCell: (p) => <StatusBadge status={p.value} />,
            },
        );
        if (canApprove) {
            cols.push({
                field: 'actions', headerName: 'Actions', width: 180, sortable: false,
                renderCell: (p) => {
                    if (p.row.status !== 'Pending') return null;
                    return (
                        <Stack direction="row" spacing={1}>
                            <Button size="small" color="success" variant="outlined" onClick={() => setPendingStatusUpdate({ id: p.row.id, status: 'Approved' })}>Approve</Button>
                            <Button size="small" color="error" variant="outlined" onClick={() => setPendingStatusUpdate({ id: p.row.id, status: 'Rejected' })}>Reject</Button>
                        </Stack>
                    );
                },
            });
        }
        return cols;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leaves, canSeeEmployeeColumn, canApprove]);

    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = { All: leaves.length, Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 };
        leaves.forEach((l) => {
            // "Cancellation Pending" rows still read as Pending in this filter —
            // they're awaiting the same approver action as a fresh request.
            const bucket = l.status === 'Cancellation Pending' ? 'Pending' : l.status;
            if (bucket in counts) counts[bucket] += 1;
        });
        return counts;
    }, [leaves]);

    const filteredLeaves = statusFilter === 'All'
        ? leaves
        : leaves.filter((l) => (statusFilter === 'Pending' ? (l.status === 'Pending' || l.status === 'Cancellation Pending') : l.status === statusFilter));

    return (
        <Box className="fade-in" sx={{ maxWidth: 1200, mx: 'auto' }}>
            <PageHeader
                title="Leave Management"
                subtitle="Track and manage leave requests across your team"
                actions={<Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setDrawerOpen(true)}>Apply for Leave</Button>}
            />

            {!loading && (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 2, mb: 3 }}>
                    {settings.leave_allocations.map((alloc) => {
                        const empId = !canApplyForOthers ? user.id : '';
                        const used = empId ? getUsedLeavesForType(empId, alloc.type) : 0;
                        const available = alloc.days - used;
                        const pct = Math.max(0, Math.min(100, (used / alloc.days) * 100));
                        return (
                            <Card key={alloc.type} sx={{ p: 2 }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'capitalize', color: 'text.secondary' }}>{alloc.type}</Typography>
                                    <Typography sx={{ fontWeight: 800, fontSize: '1.3rem', color: 'primary.main' }}>
                                        {available}<Typography component="span" variant="body2" color="text.disabled">/{alloc.days}</Typography>
                                    </Typography>
                                </Stack>
                                <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 5 }} />
                                <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>days remaining</Typography>
                            </Card>
                        );
                    })}
                </Box>
            )}

            <Card sx={{ p: 3 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
                    <Typography variant="h6">Recent Requests</Typography>
                    <Stack direction="row" flexWrap="wrap" gap={1}>
                        {(['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'] as const).map((s) => (
                            <Chip
                                key={s}
                                label={`${s} (${statusCounts[s]})`}
                                size="small"
                                onClick={() => setStatusFilter(s)}
                                color={statusFilter === s ? 'primary' : undefined}
                                variant={statusFilter === s ? 'filled' : 'outlined'}
                                sx={{ fontWeight: 600 }}
                            />
                        ))}
                    </Stack>
                </Stack>
                {loading ? <PageSpinner /> : (
                    <DataTable rows={filteredLeaves} columns={columns} emptyTitle="No leave records found" withToolbar />
                )}
            </Card>

            <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                <Box sx={{ width: { xs: '100vw', sm: 440 }, display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 3, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                        <Stack direction="row" spacing={1.25} alignItems="center">
                            <ClipboardList size={20} />
                            <Typography variant="h6" sx={{ color: 'inherit' }}>Record Leave</Typography>
                        </Stack>
                        <IconButton onClick={() => setDrawerOpen(false)} sx={{ color: 'inherit' }}><X size={18} /></IconButton>
                    </Stack>

                    <Box component="form" onSubmit={handleSubmit} sx={{ p: 3, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                        {canApplyForOthers && (
                            <Autocomplete
                                options={employeeOptions}
                                value={employeeOptions.find((o) => String(o.id) === String(formData.user_id)) || null}
                                onChange={(_e, opt) => setFormData({ ...formData, user_id: opt ? String(opt.id) : '' })}
                                renderInput={(params) => <TextField {...params} label="Target Employee" placeholder="Search employee…" />}
                            />
                        )}

                        <Autocomplete
                            options={leaveTypeOptions}
                            getOptionDisabled={(opt) => opt.disabled}
                            value={leaveTypeOptions.find((o) => o.id === formData.type) || null}
                            onChange={(_e, opt) => setFormData({ ...formData, type: opt ? opt.id : 'casual', flexi_holiday_id: '', start_date: '', end_date: '' })}
                            renderInput={(params) => <TextField {...params} label="Leave Type" />}
                        />

                        {formData.type === 'Flexi Holiday' ? (
                            <Box>
                                <Autocomplete
                                    options={flexiOptions}
                                    getOptionDisabled={(opt) => opt.disabled}
                                    onChange={(_e, opt) => {
                                        if (opt?.holiday) {
                                            setFormData({ ...formData, flexi_holiday_id: String(opt.holiday.id), reason: opt.holiday.name, start_date: opt.holiday.date, end_date: opt.holiday.date, is_half_day: 0 });
                                        }
                                    }}
                                    renderInput={(params) => <TextField {...params} label="Select Flexi Holiday" placeholder="Choose from list…" />}
                                />
                                <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600, mt: 0.5, display: 'block' }}>
                                    Max 2 flexi holidays per year. Auto-approved.
                                </Typography>
                            </Box>
                        ) : (
                            <>
                                <ToggleButtonGroup
                                    exclusive
                                    fullWidth
                                    value={formData.is_half_day ? 'half' : 'full'}
                                    onChange={(_e, val) => {
                                        if (!val) return;
                                        setFormData({ ...formData, is_half_day: val === 'half' ? 1 : 0, end_date: val === 'half' ? formData.start_date : formData.end_date });
                                    }}
                                >
                                    <ToggleButton value="full">Full Day</ToggleButton>
                                    <ToggleButton value="half">Half Day</ToggleButton>
                                </ToggleButtonGroup>

                                <Stack direction="row" spacing={2}>
                                    <TextField
                                        label={formData.is_half_day ? 'Date' : 'Start Date'}
                                        type="date"
                                        fullWidth
                                        required
                                        value={formData.start_date}
                                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value, end_date: formData.is_half_day ? e.target.value : formData.end_date })}
                                        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: '2026-01-01' } }}
                                    />
                                    {!formData.is_half_day && (
                                        <TextField
                                            label="End Date"
                                            type="date"
                                            fullWidth
                                            required
                                            value={formData.end_date}
                                            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: formData.start_date || '2026-01-01' } }}
                                        />
                                    )}
                                </Stack>

                                <TextField
                                    label="Reason"
                                    placeholder="Mention the reason for leave…"
                                    multiline
                                    rows={3}
                                    fullWidth
                                    value={formData.reason}
                                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                                />
                            </>
                        )}

                        <Button type="submit" variant="contained" size="large" disabled={submitting} endIcon={<Send size={16} />}>
                            {submitting ? 'Processing…' : formData.type === 'Flexi Holiday' ? 'Select Flexi Holiday' : (String(formData.user_id) !== String(user.id) && canApplyForOthers ? 'Record Leave' : 'Submit for Approval')}
                        </Button>
                    </Box>
                </Box>
            </Drawer>

            <ConfirmDialog
                open={!!pendingStatusUpdate}
                title={`${pendingStatusUpdate?.status === 'Approved' ? 'Approve' : 'Reject'} this leave request?`}
                description={`This will mark the request as ${pendingStatusUpdate?.status.toLowerCase()} and notify the employee.`}
                confirmLabel={pendingStatusUpdate?.status === 'Approved' ? 'Approve' : 'Reject'}
                destructive={pendingStatusUpdate?.status === 'Rejected'}
                onConfirm={confirmStatusUpdate}
                onCancel={() => setPendingStatusUpdate(null)}
            />
        </Box>
    );
}

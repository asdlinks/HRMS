import { useState, useEffect, useMemo, type FormEvent } from 'react';
import {
    Box, Card, List, ListItemButton, ListItemIcon, ListItemText, IconButton, Typography,
    TextField, Button, Dialog, DialogTitle, DialogContent, DialogActions, Avatar, Stack, InputAdornment, Chip, Grid2 as Grid,
} from '@mui/material';
import { Building2, Plus, Users, Trash2, Mail, Search, UsersRound, TrendingUp } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getDepartments, getUsers, addDepartment, deleteDepartment } from '../api';
import { PageHeader, EmptyState, PageSpinner, ConfirmDialog, StatCard } from '../components/ui';
import { getErrorMessage } from '../types';

interface Department { id: number; name: string }
interface Employee { id: number; name: string; email: string; designation?: string; profile_photo?: string | null; department_id?: number | string | null }

export default function DepartmentsPage() {
    const { enqueueSnackbar } = useSnackbar();
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedDept, setSelectedDept] = useState<Department | null>(null);
    const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);
    const [newDeptName, setNewDeptName] = useState('');
    const [deletingDept, setDeletingDept] = useState<Department | null>(null);
    const [deptSearch, setDeptSearch] = useState('');

    useEffect(() => {
        fetchAll();
    }, []);

    const fetchAll = async () => {
        try {
            const [deptsResp, usersResp] = await Promise.all([getDepartments(), getUsers()]);
            setDepartments(deptsResp.data);
            setAllEmployees(usersResp.data);
            if (deptsResp.data.length > 0) setSelectedDept(deptsResp.data[0]);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const headcountByDept = useMemo(() => {
        const map = new Map<number, number>();
        allEmployees.forEach((e) => {
            if (e.department_id == null) return;
            const key = Number(e.department_id);
            map.set(key, (map.get(key) || 0) + 1);
        });
        return map;
    }, [allEmployees]);

    const employees = selectedDept ? allEmployees.filter((e) => Number(e.department_id) === selectedDept.id) : [];

    const handleAddDept = async (e: FormEvent) => {
        e.preventDefault();
        try {
            const resp = await addDepartment({ name: newDeptName });
            setDepartments((prev) => [...prev, resp.data]);
            setNewDeptName('');
            setIsAddDeptOpen(false);
            setSelectedDept(resp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to add department'), { variant: 'error' });
        }
    };

    const confirmDeleteDept = async () => {
        if (!deletingDept) return;
        try {
            await deleteDepartment(deletingDept.id);
            const updated = departments.filter((d) => d.id !== deletingDept.id);
            setDepartments(updated);
            if (selectedDept?.id === deletingDept.id) setSelectedDept(updated[0] || null);
            enqueueSnackbar('Department deleted', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to delete department'), { variant: 'error' });
        } finally {
            setDeletingDept(null);
        }
    };

    const visibleDepartments = deptSearch
        ? departments.filter((d) => d.name.toLowerCase().includes(deptSearch.toLowerCase()))
        : departments;

    if (loading) return <PageSpinner />;

    const avgTeamSize = departments.length > 0 ? Math.round((allEmployees.length / departments.length) * 10) / 10 : 0;
    const largestDept = departments.reduce<{ name: string; count: number } | null>((max, d) => {
        const count = headcountByDept.get(d.id) || 0;
        return !max || count > max.count ? { name: d.name, count } : max;
    }, null);

    return (
        <Box className="fade-in" sx={{ maxWidth: 1400, mx: 'auto' }}>
            <PageHeader
                title="Department Management"
                subtitle="Organize employees and team structures"
                actions={<Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setIsAddDeptOpen(true)}>New Department</Button>}
            />

            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard label="Departments" value={departments.length} icon={<Building2 size={20} />} color="primary" />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard label="Total Employees" value={allEmployees.length} icon={<Users size={20} />} color="success" />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard label="Avg. Team Size" value={avgTeamSize} icon={<UsersRound size={20} />} color="info" />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard label="Largest Team" value={largestDept ? largestDept.name : '—'} icon={<TrendingUp size={20} />} color="warning" />
                </Grid>
            </Grid>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '300px 1fr' }, gap: 3, alignItems: 'start' }}>
                <Card sx={{ overflow: 'hidden' }}>
                    <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Search departments…"
                            value={deptSearch}
                            onChange={(e) => setDeptSearch(e.target.value)}
                            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={15} /></InputAdornment> } }}
                        />
                    </Box>
                    <List sx={{ maxHeight: 500, overflowY: 'auto' }}>
                        {visibleDepartments.map((dept) => (
                            <ListItemButton
                                key={dept.id}
                                selected={selectedDept?.id === dept.id}
                                onClick={() => setSelectedDept(dept)}
                                sx={{ borderRadius: 2, mx: 1, mb: 0.5, width: 'auto' }}
                            >
                                <ListItemIcon sx={{ minWidth: 36 }}><Building2 size={18} /></ListItemIcon>
                                <ListItemText primary={dept.name} slotProps={{ primary: { sx: { fontWeight: 600 } } }} />
                                <Chip label={headcountByDept.get(dept.id) || 0} size="small" sx={{ mr: 0.5, fontWeight: 700 }} />
                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDeletingDept(dept); }}>
                                    <Trash2 size={14} />
                                </IconButton>
                            </ListItemButton>
                        ))}
                    </List>
                </Card>

                <Card sx={{ p: { xs: 2, sm: 3.5 }, minHeight: 500 }}>
                    {selectedDept ? (
                        <>
                            <Typography variant="h5" sx={{ mb: 0.5 }}>{selectedDept.name} Department</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{employees.length} employees found</Typography>
                            {employees.length === 0 ? (
                                <EmptyState icon={<Users size={28} />} title="No employees yet" description="Map your first team member into this department." />
                            ) : (
                                <Stack spacing={1.5}>
                                    {employees.map((emp) => (
                                        <Stack key={emp.id} direction="row" spacing={2} alignItems="center" sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                                            <Avatar src={emp.profile_photo ?? undefined} variant="rounded">{emp.name.charAt(0)}</Avatar>
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Typography sx={{ fontWeight: 700 }}>{emp.name}</Typography>
                                                <Typography variant="caption" color="text.secondary">{emp.designation}</Typography>
                                            </Box>
                                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'flex' } }}>
                                                <Mail size={14} />
                                                <Typography variant="caption">{emp.email}</Typography>
                                            </Stack>
                                        </Stack>
                                    ))}
                                </Stack>
                            )}
                        </>
                    ) : (
                        <EmptyState icon={<Building2 size={28} />} title="No department selected" description="Choose a department from the list to manage its members." />
                    )}
                </Card>
            </Box>

            <Dialog open={isAddDeptOpen} onClose={() => setIsAddDeptOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Create New Department</DialogTitle>
                <Box component="form" onSubmit={handleAddDept}>
                    <DialogContent>
                        <TextField
                            label="Department Name"
                            fullWidth
                            required
                            autoFocus
                            value={newDeptName}
                            onChange={(e) => setNewDeptName(e.target.value)}
                            placeholder="e.g. Research & Development"
                        />
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 3 }}>
                        <Button color="inherit" onClick={() => setIsAddDeptOpen(false)}>Cancel</Button>
                        <Button type="submit" variant="contained">Create Team</Button>
                    </DialogActions>
                </Box>
            </Dialog>

            <ConfirmDialog
                open={!!deletingDept}
                title={`Delete "${deletingDept?.name}"?`}
                description="Only empty departments can be deleted."
                confirmLabel="Delete"
                destructive
                onConfirm={confirmDeleteDept}
                onCancel={() => setDeletingDept(null)}
            />
        </Box>
    );
}

import { useEffect, useMemo, useState } from 'react';
import {
    Box, Card, List, ListItemButton, ListItemAvatar, Avatar, ListItemText, Typography,
    Button, Stack, TextField, InputAdornment, Chip,
} from '@mui/material';
import { Search, UserCog, Plus } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getUsers, getSalaryStructures, getSalaryAssignments, createSalaryAssignment, getSalaryGrades } from '../api';
import { PageHeader, EmptyState, PageSpinner } from '../components/ui';
import { SalaryAssignmentFormDialog, type AssignmentFormValues, type StructureOption, type GradeOption } from '../components/payroll';
import { getErrorMessage } from '../types';

interface Employee {
    id: number; name: string; email: string; designation?: string; employee_id?: string; profile_photo?: string | null;
}
interface AssignmentHistoryRow {
    id: number; structure_id: number; structure_name: string; ctc_annual: number;
    effective_from: string; effective_to: string | null;
}

export default function PayrollAssignmentsPage() {
    const { enqueueSnackbar } = useSnackbar();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [structures, setStructures] = useState<StructureOption[]>([]);
    const [grades, setGrades] = useState<GradeOption[]>([]);
    const [selected, setSelected] = useState<Employee | null>(null);
    const [history, setHistory] = useState<AssignmentHistoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [search, setSearch] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (selected) fetchHistory(selected.id); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const [usersResp, structuresResp, gradesResp] = await Promise.all([
                getUsers(), getSalaryStructures(), getSalaryGrades().catch(() => ({ data: [] })),
            ]);
            setEmployees(usersResp.data);
            setStructures(structuresResp.data);
            setGrades(gradesResp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load employees'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async (userId: number) => {
        setLoadingHistory(true);
        try {
            const resp = await getSalaryAssignments(userId);
            setHistory(resp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load salary history'), { variant: 'error' });
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleSubmit = async (values: AssignmentFormValues) => {
        if (!selected) return;
        try {
            await createSalaryAssignment({
                ...values,
                user_id: selected.id,
                structure_id: Number(values.structure_id),
                grade_id: values.grade_id ? Number(values.grade_id) : null,
                ctc_annual: Number(values.ctc_annual),
            });
            enqueueSnackbar('Salary assignment created', { variant: 'success' });
            setDialogOpen(false);
            fetchHistory(selected.id);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to create assignment'), { variant: 'error' });
        }
    };

    const visibleEmployees = useMemo(() => {
        let result = employees;
        if (search) {
            const q = search.toLowerCase();
            result = result.filter((e) => e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q) || e.employee_id?.toLowerCase().includes(q));
        }
        return result;
    }, [employees, search]);

    const openAssignment = history.find((h) => h.effective_to === null);

    if (loading) return <PageSpinner />;

    return (
        <Box className="fade-in" sx={{ maxWidth: 1300, mx: 'auto' }}>
            <PageHeader title="Employee Salary Assignment" subtitle="Assign a salary structure and CTC to each employee. Banking details are managed from the Employee Master record." />

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px 1fr' }, gap: 3, alignItems: 'start' }}>
                <Card sx={{ overflow: 'hidden' }}>
                    <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <TextField
                            fullWidth size="small" placeholder="Search employees…" value={search} onChange={(e) => setSearch(e.target.value)}
                            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={15} /></InputAdornment> } }}
                        />
                    </Box>
                    <List sx={{ maxHeight: 560, overflowY: 'auto' }}>
                        {visibleEmployees.map((emp) => (
                            <ListItemButton key={emp.id} selected={selected?.id === emp.id} onClick={() => setSelected(emp)} sx={{ borderRadius: 2, mx: 1, mb: 0.5, width: 'auto' }}>
                                <ListItemAvatar><Avatar src={emp.profile_photo ?? undefined} variant="rounded">{emp.name.charAt(0)}</Avatar></ListItemAvatar>
                                <ListItemText primary={emp.name} secondary={emp.designation} slotProps={{ primary: { sx: { fontWeight: 600 } } }} />
                            </ListItemButton>
                        ))}
                    </List>
                </Card>

                <Card sx={{ p: { xs: 2, sm: 3.5 }, minHeight: 500 }}>
                    {!selected ? (
                        <EmptyState icon={<UserCog size={28} />} title="No employee selected" description="Choose an employee to view or set their salary assignment." />
                    ) : loadingHistory ? (
                        <PageSpinner />
                    ) : (
                        <>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                                <Box>
                                    <Typography variant="h5">{selected.name}</Typography>
                                    <Typography variant="body2" color="text.secondary">{selected.designation}</Typography>
                                </Box>
                                <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setDialogOpen(true)}>New Assignment</Button>
                            </Stack>

                            {openAssignment && (
                                <Card variant="outlined" sx={{ p: 2.5, mb: 3, bgcolor: 'action.hover' }}>
                                    <Typography variant="overline" color="text.secondary">Current Assignment</Typography>
                                    <Stack direction="row" spacing={4} sx={{ mt: 1 }}>
                                        <Box><Typography variant="body2" color="text.secondary">Structure</Typography><Typography sx={{ fontWeight: 700 }}>{openAssignment.structure_name}</Typography></Box>
                                        <Box><Typography variant="body2" color="text.secondary">Annual CTC</Typography><Typography sx={{ fontWeight: 700 }}>{Number(openAssignment.ctc_annual).toLocaleString()}</Typography></Box>
                                        <Box><Typography variant="body2" color="text.secondary">Effective From</Typography><Typography sx={{ fontWeight: 700 }}>{openAssignment.effective_from?.slice(0, 10)}</Typography></Box>
                                    </Stack>
                                </Card>
                            )}

                            <Typography variant="subtitle2" sx={{ mb: 1 }}>History</Typography>
                            {history.length === 0 ? (
                                <EmptyState title="No salary assignments yet" description="Create the first assignment for this employee." />
                            ) : (
                                <Stack spacing={1.5}>
                                    {history.map((h) => (
                                        <Stack key={h.id} direction="row" spacing={2} alignItems="center" sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                                            <Box sx={{ flex: 1 }}>
                                                <Typography sx={{ fontWeight: 700 }}>{h.structure_name}</Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {h.effective_from?.slice(0, 10)} – {h.effective_to ? h.effective_to.slice(0, 10) : 'present'}
                                                </Typography>
                                            </Box>
                                            <Typography sx={{ fontWeight: 600 }}>{Number(h.ctc_annual).toLocaleString()} / yr</Typography>
                                            <Chip label={h.effective_to ? 'Past' : 'Current'} size="small" />
                                        </Stack>
                                    ))}
                                </Stack>
                            )}
                        </>
                    )}
                </Card>
            </Box>

            {selected && (
                <SalaryAssignmentFormDialog
                    open={dialogOpen}
                    onClose={() => setDialogOpen(false)}
                    onSubmit={handleSubmit}
                    employeeName={selected.name}
                    structures={structures}
                    grades={grades}
                />
            )}
        </Box>
    );
}

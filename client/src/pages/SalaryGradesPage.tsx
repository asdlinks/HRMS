import { useEffect, useState } from 'react';
import {
    Box, Card, List, ListItemButton, ListItemIcon, ListItemText, IconButton, Typography,
    TextField, Button, Dialog, DialogTitle, DialogContent, DialogActions, Stack, Select, MenuItem, FormControl, InputLabel, Switch, FormControlLabel,
} from '@mui/material';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getSalaryGrades, createSalaryGrade, updateSalaryGrade, deleteSalaryGrade, getSalaryStructures } from '../api';
import { PageHeader, EmptyState, PageSpinner, ConfirmDialog } from '../components/ui';
import { getErrorMessage } from '../types';

interface SalaryGrade {
    id: number; code: string; name: string; description?: string | null;
    min_amount?: number | null; mid_amount?: number | null; max_amount?: number | null;
    default_structure_id?: number | null; is_active: boolean;
}
interface Structure { id: number; name: string }

const emptyForm = { code: '', name: '', description: '', min_amount: '', mid_amount: '', max_amount: '', default_structure_id: '', is_active: true };

// `compact` is set when embedded inside SettingsPage.tsx's own content panel
// (its own heading/frame already applies) — the standalone /payroll/grades
// route still renders full chrome by default.
export default function SalaryGradesPage({ compact = false }: { compact?: boolean }) {
    const { enqueueSnackbar } = useSnackbar();
    const [grades, setGrades] = useState<SalaryGrade[]>([]);
    const [structures, setStructures] = useState<Structure[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<SalaryGrade | null>(null);
    const [deleting, setDeleting] = useState<SalaryGrade | null>(null);
    const [form, setForm] = useState(emptyForm);

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const [gradesResp, structuresResp] = await Promise.all([getSalaryGrades(), getSalaryStructures()]);
            setGrades(gradesResp.data);
            setStructures(structuresResp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load salary grades'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const structureName = (id?: number | null) => structures.find((s) => s.id === id)?.name;

    const openAdd = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
    const openEdit = (g: SalaryGrade) => {
        setEditing(g);
        setForm({
            code: g.code, name: g.name, description: g.description || '',
            min_amount: g.min_amount != null ? String(g.min_amount) : '',
            mid_amount: g.mid_amount != null ? String(g.mid_amount) : '',
            max_amount: g.max_amount != null ? String(g.max_amount) : '',
            default_structure_id: g.default_structure_id != null ? String(g.default_structure_id) : '',
            is_active: g.is_active,
        });
        setDialogOpen(true);
    };

    const handleSubmit = async () => {
        const payload = {
            code: form.code,
            name: form.name,
            description: form.description || null,
            min_amount: form.min_amount === '' ? null : Number(form.min_amount),
            mid_amount: form.mid_amount === '' ? null : Number(form.mid_amount),
            max_amount: form.max_amount === '' ? null : Number(form.max_amount),
            default_structure_id: form.default_structure_id === '' ? null : Number(form.default_structure_id),
            is_active: form.is_active,
        };
        try {
            if (editing) {
                await updateSalaryGrade(editing.id, payload);
                enqueueSnackbar('Salary grade updated', { variant: 'success' });
            } else {
                await createSalaryGrade(payload);
                enqueueSnackbar('Salary grade created', { variant: 'success' });
            }
            setDialogOpen(false);
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to save salary grade'), { variant: 'error' });
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        try {
            await deleteSalaryGrade(deleting.id);
            setGrades((prev) => prev.filter((g) => g.id !== deleting.id));
            enqueueSnackbar('Salary grade deleted', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to delete salary grade'), { variant: 'error' });
        } finally {
            setDeleting(null);
        }
    };

    if (loading) return <PageSpinner />;

    const newGradeButton = <Button variant="contained" startIcon={<Plus size={18} />} onClick={openAdd}>New Grade</Button>;

    return (
        <Box className={compact ? undefined : 'fade-in'} sx={compact ? undefined : { maxWidth: 1000, mx: 'auto' }}>
            {compact ? (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>{newGradeButton}</Box>
            ) : (
                <PageHeader
                    title="Salary Grades"
                    subtitle="Group salary structures under a grade (Grade → Structure → Employee) so different grades can use different structures."
                    actions={newGradeButton}
                />
            )}

            {grades.length === 0 ? (
                <EmptyState icon={<Layers size={28} />} title="No salary grades yet" description="Create a grade, then link salary structures to it from the structure editor." />
            ) : (
                <Card>
                    <List>
                        {grades.map((g) => (
                            <ListItemButton key={g.id} onClick={() => openEdit(g)} sx={{ borderRadius: 2, mx: 1, my: 0.5 }}>
                                <ListItemIcon sx={{ minWidth: 36 }}><Layers size={18} /></ListItemIcon>
                                <ListItemText
                                    primary={`${g.code} — ${g.name}`}
                                    secondary={g.default_structure_id ? `Default structure: ${structureName(g.default_structure_id) || '—'}` : 'No default structure'}
                                />
                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDeleting(g); }}><Trash2 size={14} /></IconButton>
                            </ListItemButton>
                        ))}
                    </List>
                </Card>
            )}

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{editing ? 'Edit Salary Grade' : 'New Salary Grade'}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField label="Code" required fullWidth value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. L3" />
                        <TextField label="Name" required fullWidth value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Senior Engineer" />
                        <TextField label="Description" fullWidth multiline minRows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                        <Stack direction="row" spacing={1.5}>
                            <TextField label="Min" type="number" fullWidth value={form.min_amount} onChange={(e) => setForm({ ...form, min_amount: e.target.value })} />
                            <TextField label="Mid" type="number" fullWidth value={form.mid_amount} onChange={(e) => setForm({ ...form, mid_amount: e.target.value })} />
                            <TextField label="Max" type="number" fullWidth value={form.max_amount} onChange={(e) => setForm({ ...form, max_amount: e.target.value })} />
                        </Stack>
                        <FormControl fullWidth>
                            <InputLabel>Default Structure</InputLabel>
                            <Select label="Default Structure" value={form.default_structure_id} onChange={(e) => setForm({ ...form, default_structure_id: e.target.value })}>
                                <MenuItem value="">None</MenuItem>
                                {structures.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <FormControlLabel control={<Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />} label="Active" />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button color="inherit" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleSubmit} disabled={!form.code || !form.name}>
                        {editing ? 'Save Changes' : 'Create Grade'}
                    </Button>
                </DialogActions>
            </Dialog>

            <ConfirmDialog
                open={!!deleting}
                title={`Delete "${deleting?.name}"?`}
                description="Grades linked to a structure or employee assignment cannot be deleted."
                confirmLabel="Delete"
                destructive
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </Box>
    );
}

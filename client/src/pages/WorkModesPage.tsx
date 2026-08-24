import { useEffect, useState, type FormEvent } from 'react';
import {
    Box, Card, List, ListItemButton, ListItemIcon, ListItemText, IconButton, Typography,
    TextField, Button, Dialog, DialogTitle, DialogContent, DialogActions, Stack, Switch, FormControlLabel,
} from '@mui/material';
import { Laptop, Plus, Trash2 } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getWorkModes, createWorkMode, updateWorkMode, deleteWorkMode } from '../api';
import { PageHeader, EmptyState, PageSpinner, ConfirmDialog } from '../components/ui';
import { getErrorMessage } from '../types';

interface WorkMode { id: number; code: string; name: string; description?: string | null; sort_order: number; is_active: boolean }

const emptyForm = { code: '', name: '', description: '', sort_order: 0, is_active: true };

// `compact` is set when embedded inside SettingsPage.tsx's own content panel
// (its own heading/frame already applies) — the standalone /work-modes route
// still renders full chrome by default.
export default function WorkModesPage({ compact = false }: { compact?: boolean }) {
    const { enqueueSnackbar } = useSnackbar();
    const [workModes, setWorkModes] = useState<WorkMode[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<WorkMode | null>(null);
    const [deleting, setDeleting] = useState<WorkMode | null>(null);
    const [form, setForm] = useState(emptyForm);

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const resp = await getWorkModes();
            setWorkModes(resp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load work modes'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const openAdd = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
    const openEdit = (w: WorkMode) => { setEditing(w); setForm({ ...w, description: w.description || '' }); setDialogOpen(true); };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        try {
            if (editing) {
                await updateWorkMode(editing.id, form);
                enqueueSnackbar('Work mode updated', { variant: 'success' });
            } else {
                await createWorkMode(form);
                enqueueSnackbar('Work mode created', { variant: 'success' });
            }
            setDialogOpen(false);
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to save work mode'), { variant: 'error' });
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        try {
            await deleteWorkMode(deleting.id);
            setWorkModes((prev) => prev.filter((w) => w.id !== deleting.id));
            enqueueSnackbar('Work mode deleted', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to delete work mode'), { variant: 'error' });
        } finally {
            setDeleting(null);
        }
    };

    if (loading) return <PageSpinner />;

    const newWorkModeButton = <Button variant="contained" startIcon={<Plus size={18} />} onClick={openAdd}>New Work Mode</Button>;

    return (
        <Box className={compact ? undefined : 'fade-in'} sx={compact ? undefined : { maxWidth: 900, mx: 'auto' }}>
            {compact ? (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>{newWorkModeButton}</Box>
            ) : (
                <PageHeader
                    title="Work Modes"
                    subtitle="Configure where employees are expected to work from — referenced by attendance policies."
                    actions={newWorkModeButton}
                />
            )}

            {workModes.length === 0 ? (
                <EmptyState icon={<Laptop size={28} />} title="No work modes yet" description="Create a work mode to make it available in attendance policies." />
            ) : (
                <Card>
                    <List>
                        {workModes.map((w) => (
                            <ListItemButton key={w.id} onClick={() => openEdit(w)} sx={{ borderRadius: 2, mx: 1, my: 0.5 }}>
                                <ListItemIcon sx={{ minWidth: 36 }}><Laptop size={18} /></ListItemIcon>
                                <ListItemText primary={w.name} secondary={`${w.code}${w.is_active ? '' : ' · Inactive'}`} />
                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDeleting(w); }}><Trash2 size={14} /></IconButton>
                            </ListItemButton>
                        ))}
                    </List>
                </Card>
            )}

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{editing ? 'Edit Work Mode' : 'New Work Mode'}</DialogTitle>
                <Box component="form" onSubmit={handleSubmit}>
                    <DialogContent>
                        <Stack spacing={2}>
                            <TextField label="Code" required fullWidth value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. Hybrid" />
                            <TextField label="Name" required fullWidth value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                            <TextField label="Description" fullWidth multiline minRows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                            <FormControlLabel control={<Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />} label="Active" />
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 3 }}>
                        <Button color="inherit" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button type="submit" variant="contained">{editing ? 'Save Changes' : 'Create'}</Button>
                    </DialogActions>
                </Box>
            </Dialog>

            <ConfirmDialog
                open={!!deleting}
                title={`Delete "${deleting?.name}"?`}
                description="Work modes in use by an employee or attendance record cannot be deleted."
                confirmLabel="Delete"
                destructive
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </Box>
    );
}

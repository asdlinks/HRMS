import { useEffect, useState, type FormEvent } from 'react';
import {
    Box, Card, List, ListItemButton, ListItemIcon, ListItemText, IconButton, Chip, Grid2 as Grid,
    TextField, Button, Dialog, DialogTitle, DialogContent, DialogActions, Stack, Switch, FormControlLabel,
} from '@mui/material';
import { Building, Plus, Trash2 } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getLocations, addLocation, updateLocation, deleteLocation } from '../../api';
import { EmptyState, PageSpinner, ConfirmDialog } from '../ui';
import { getErrorMessage } from '../../types';

interface Branch {
    id: number;
    name: string;
    code?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    is_active: boolean;
}

const emptyForm = { name: '', code: '', address: '', city: '', state: '', country: '', is_active: true };

// Branches = the existing `locations` table (users.location_id, holiday
// scoping, attendance/payroll/reports filters) extended with address fields
// and relabeled here — no new table, see 031_org_structure.sql.
export default function BranchTab({ canManage }: { canManage: boolean }) {
    const { enqueueSnackbar } = useSnackbar();
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Branch | null>(null);
    const [deleting, setDeleting] = useState<Branch | null>(null);
    const [form, setForm] = useState(emptyForm);

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const resp = await getLocations();
            setBranches(resp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load branches'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const openAdd = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
    const openEdit = (b: Branch) => {
        setEditing(b);
        setForm({
            name: b.name, code: b.code || '', address: b.address || '', city: b.city || '',
            state: b.state || '', country: b.country || '', is_active: b.is_active,
        });
        setDialogOpen(true);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        try {
            if (editing) {
                await updateLocation(editing.id, form);
                enqueueSnackbar('Branch updated', { variant: 'success' });
            } else {
                await addLocation(form);
                enqueueSnackbar('Branch created', { variant: 'success' });
            }
            setDialogOpen(false);
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to save branch'), { variant: 'error' });
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        try {
            await deleteLocation(deleting.id);
            setBranches((prev) => prev.filter((b) => b.id !== deleting.id));
            enqueueSnackbar('Branch deleted', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to delete branch'), { variant: 'error' });
        } finally {
            setDeleting(null);
        }
    };

    if (loading) return <PageSpinner />;

    return (
        <Box>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
                {canManage && (
                    <Button variant="contained" startIcon={<Plus size={18} />} onClick={openAdd}>New Branch</Button>
                )}
            </Stack>

            {branches.length === 0 ? (
                <EmptyState icon={<Building size={28} />} title="No branches yet" description="Add a branch/office location to assign employees and location-specific holidays." />
            ) : (
                <Card>
                    <List>
                        {branches.map((b) => (
                            <ListItemButton
                                key={b.id}
                                onClick={() => canManage && openEdit(b)}
                                sx={{ borderRadius: 2, mx: 1, my: 0.5, cursor: canManage ? 'pointer' : 'default' }}
                            >
                                <ListItemIcon sx={{ minWidth: 36 }}><Building size={18} /></ListItemIcon>
                                <ListItemText
                                    primary={b.name}
                                    secondary={[b.code, [b.city, b.state, b.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || undefined}
                                />
                                {!b.is_active && <Chip label="Inactive" size="small" sx={{ mr: 1 }} />}
                                {canManage && (
                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDeleting(b); }}>
                                        <Trash2 size={14} />
                                    </IconButton>
                                )}
                            </ListItemButton>
                        ))}
                    </List>
                </Card>
            )}

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{editing ? 'Edit Branch' : 'New Branch'}</DialogTitle>
                <Box component="form" onSubmit={handleSubmit}>
                    <DialogContent>
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField label="Name" required fullWidth value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField label="Code" fullWidth value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                            </Grid>
                            <Grid size={12}>
                                <TextField label="Address" fullWidth value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 4 }}>
                                <TextField label="City" fullWidth value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 4 }}>
                                <TextField label="State" fullWidth value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 4 }}>
                                <TextField label="Country" fullWidth value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                            </Grid>
                            <Grid size={12}>
                                <FormControlLabel control={<Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />} label="Active" />
                            </Grid>
                        </Grid>
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
                description="Employees might be assigned to this branch — assignments must be cleared before it can be deleted."
                confirmLabel="Delete"
                destructive
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </Box>
    );
}

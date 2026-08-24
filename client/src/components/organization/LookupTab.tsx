import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
    Box, Card, List, ListItemButton, ListItemIcon, ListItemText, IconButton, Chip,
    TextField, Button, Dialog, DialogTitle, DialogContent, DialogActions, Stack, Switch, FormControlLabel,
} from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { EmptyState, PageSpinner, ConfirmDialog } from '../ui';
import { getErrorMessage } from '../../types';

export interface LookupItem {
    id: number;
    name: string;
    code?: string | null;
    description?: string | null;
    is_active: boolean;
}

const emptyForm = { name: '', code: '', description: '', is_active: true };

// Reusable CRUD list for the flat org-structure lookup modules
// (Designations, Employment Types, Employee Categories) — same
// name/code/description/is_active shape, so one component drives all of them
// instead of near-identical copies. Mirrors WorkModesPage.tsx's
// list+dialog+confirm shell.
export default function LookupTab({
    entityLabel, icon, canManage, list, create, update, remove, deleteBlockedMessage,
}: {
    entityLabel: string;
    icon: ReactNode;
    canManage: boolean;
    list: () => Promise<{ data: LookupItem[] }>;
    create: (data: object) => Promise<unknown>;
    update: (id: number | string, data: object) => Promise<unknown>;
    remove: (id: number | string) => Promise<unknown>;
    deleteBlockedMessage: string;
}) {
    const { enqueueSnackbar } = useSnackbar();
    const [items, setItems] = useState<LookupItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<LookupItem | null>(null);
    const [deleting, setDeleting] = useState<LookupItem | null>(null);
    const [form, setForm] = useState(emptyForm);

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const resp = await list();
            setItems(resp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, `Failed to load ${entityLabel.toLowerCase()}s`), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const openAdd = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
    const openEdit = (item: LookupItem) => {
        setEditing(item);
        setForm({ name: item.name, code: item.code || '', description: item.description || '', is_active: item.is_active });
        setDialogOpen(true);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        try {
            if (editing) {
                await update(editing.id, form);
                enqueueSnackbar(`${entityLabel} updated`, { variant: 'success' });
            } else {
                await create(form);
                enqueueSnackbar(`${entityLabel} created`, { variant: 'success' });
            }
            setDialogOpen(false);
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, `Failed to save ${entityLabel.toLowerCase()}`), { variant: 'error' });
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        try {
            await remove(deleting.id);
            setItems((prev) => prev.filter((i) => i.id !== deleting.id));
            enqueueSnackbar(`${entityLabel} deleted`, { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, `Failed to delete ${entityLabel.toLowerCase()}`), { variant: 'error' });
        } finally {
            setDeleting(null);
        }
    };

    if (loading) return <PageSpinner />;

    return (
        <Box>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
                {canManage && (
                    <Button variant="contained" startIcon={<Plus size={18} />} onClick={openAdd}>New {entityLabel}</Button>
                )}
            </Stack>

            {items.length === 0 ? (
                <EmptyState icon={icon} title={`No ${entityLabel.toLowerCase()}s yet`} description={`Create a ${entityLabel.toLowerCase()} to make it available on the employee form.`} />
            ) : (
                <Card>
                    <List>
                        {items.map((item) => (
                            <ListItemButton
                                key={item.id}
                                onClick={() => canManage && openEdit(item)}
                                sx={{ borderRadius: 2, mx: 1, my: 0.5, cursor: canManage ? 'pointer' : 'default' }}
                            >
                                <ListItemIcon sx={{ minWidth: 36 }}>{icon}</ListItemIcon>
                                <ListItemText
                                    primary={item.name}
                                    secondary={item.code || item.description ? [item.code, item.description].filter(Boolean).join(' · ') : undefined}
                                />
                                {!item.is_active && <Chip label="Inactive" size="small" sx={{ mr: 1 }} />}
                                {canManage && (
                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDeleting(item); }}>
                                        <Trash2 size={14} />
                                    </IconButton>
                                )}
                            </ListItemButton>
                        ))}
                    </List>
                </Card>
            )}

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{editing ? `Edit ${entityLabel}` : `New ${entityLabel}`}</DialogTitle>
                <Box component="form" onSubmit={handleSubmit}>
                    <DialogContent>
                        <Stack spacing={2}>
                            <TextField label="Name" required fullWidth value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                            <TextField label="Code" fullWidth value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
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
                description={deleteBlockedMessage}
                confirmLabel="Delete"
                destructive
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </Box>
    );
}

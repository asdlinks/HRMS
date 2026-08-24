import { useEffect, useMemo, useState } from 'react';
import {
    Box, Card, List, ListItemButton, ListItemIcon, ListItemText, IconButton, Typography,
    Button, Stack, Checkbox, TextField, Chip,
} from '@mui/material';
import { FileStack, Plus, Trash2 } from 'lucide-react';
import { useSnackbar } from 'notistack';
import {
    getSalaryStructures, createSalaryStructure, updateSalaryStructure, deleteSalaryStructure,
    getStructureComponents, setStructureComponents, getSalaryComponents, getSalaryGrades,
} from '../api';
import { PageHeader, EmptyState, PageSpinner, ConfirmDialog } from '../components/ui';
import { PayrollStructureFormDialog, type StructureFormValues, type GradeSelectOption } from '../components/payroll';
import { getErrorMessage } from '../types';

interface Structure { id: number; name: string; description?: string | null; is_active: boolean; grade_id?: number | null }
interface Component { id: number; code: string; name: string; component_type: 'earning' | 'deduction'; calculation_type: string; value: number | null }
interface StructureComponentRow extends Component { override_value: number | null }

export default function PayrollStructuresPage() {
    const { enqueueSnackbar } = useSnackbar();
    const [structures, setStructures] = useState<Structure[]>([]);
    const [allComponents, setAllComponents] = useState<Component[]>([]);
    const [grades, setGrades] = useState<GradeSelectOption[]>([]);
    const [selected, setSelected] = useState<Structure | null>(null);
    const [attached, setAttached] = useState<Map<number, string>>(new Map()); // componentId -> override_value string ('' = use default)
    const [loading, setLoading] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Structure | null>(null);
    const [deleting, setDeleting] = useState<Structure | null>(null);

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (selected) fetchDetail(selected.id); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const [structuresResp, componentsResp, gradesResp] = await Promise.all([
                getSalaryStructures(), getSalaryComponents(true), getSalaryGrades().catch(() => ({ data: [] })),
            ]);
            setStructures(structuresResp.data);
            setAllComponents(componentsResp.data);
            setGrades(gradesResp.data);
            if (structuresResp.data.length > 0) setSelected(structuresResp.data[0]);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load salary structures'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const fetchDetail = async (structureId: number) => {
        setLoadingDetail(true);
        try {
            const resp = await getStructureComponents(structureId);
            const map = new Map<number, string>();
            (resp.data as StructureComponentRow[]).forEach((row) => map.set(row.id, row.override_value == null ? '' : String(row.override_value)));
            setAttached(map);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load structure components'), { variant: 'error' });
        } finally {
            setLoadingDetail(false);
        }
    };

    const toggleComponent = (componentId: number) => {
        setAttached((prev) => {
            const next = new Map(prev);
            if (next.has(componentId)) next.delete(componentId);
            else next.set(componentId, '');
            return next;
        });
    };
    const setOverride = (componentId: number, value: string) => {
        setAttached((prev) => new Map(prev).set(componentId, value));
    };

    const saveComponents = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const items = Array.from(attached.entries()).map(([component_id, override_value], index) => ({
                component_id,
                override_value: override_value === '' ? null : Number(override_value),
                sort_order: index,
            }));
            await setStructureComponents(selected.id, items);
            enqueueSnackbar('Structure components saved', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to save components'), { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const openAdd = () => { setEditing(null); setDialogOpen(true); };
    const openEdit = (s: Structure) => { setEditing(s); setDialogOpen(true); };

    const handleSubmit = async (values: StructureFormValues) => {
        const payload = { ...values, grade_id: values.grade_id ? Number(values.grade_id) : null };
        try {
            if (editing) {
                await updateSalaryStructure(editing.id, { ...payload, is_active: editing.is_active });
                enqueueSnackbar('Structure updated', { variant: 'success' });
            } else {
                const resp = await createSalaryStructure(payload);
                enqueueSnackbar('Structure created', { variant: 'success' });
                setSelected({ id: resp.data.id, name: values.name, description: values.description, is_active: true, grade_id: payload.grade_id });
            }
            setDialogOpen(false);
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to save structure'), { variant: 'error' });
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        try {
            await deleteSalaryStructure(deleting.id);
            const updated = structures.filter((s) => s.id !== deleting.id);
            setStructures(updated);
            if (selected?.id === deleting.id) setSelected(updated[0] || null);
            enqueueSnackbar('Structure deleted', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to delete structure'), { variant: 'error' });
        } finally {
            setDeleting(null);
        }
    };

    const earnings = useMemo(() => allComponents.filter((c) => c.component_type === 'earning'), [allComponents]);
    const deductions = useMemo(() => allComponents.filter((c) => c.component_type === 'deduction'), [allComponents]);

    if (loading) return <PageSpinner />;

    const renderComponentRow = (c: Component) => {
        const isChecked = attached.has(c.id);
        return (
            <Stack key={c.id} direction="row" spacing={1.5} alignItems="center" sx={{ py: 0.5 }}>
                <Checkbox checked={isChecked} onChange={() => toggleComponent(c.id)} size="small" />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{c.code} · {c.calculation_type === 'fixed' ? 'Fixed' : c.calculation_type === 'slab' ? 'Slab' : `${c.value ?? 0}% default`}</Typography>
                </Box>
                {isChecked && c.calculation_type !== 'slab' && (
                    <TextField
                        size="small" type="number" placeholder={String(c.value ?? '')} label="Override"
                        value={attached.get(c.id) || ''} onChange={(e) => setOverride(c.id, e.target.value)}
                        sx={{ width: 120 }}
                    />
                )}
            </Stack>
        );
    };

    return (
        <Box className="fade-in" sx={{ maxWidth: 1300, mx: 'auto' }}>
            <PageHeader
                title="Salary Structures"
                subtitle="Group components into reusable pay templates, then assign a structure to each employee."
                actions={<Button variant="contained" startIcon={<Plus size={18} />} onClick={openAdd}>New Structure</Button>}
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '300px 1fr' }, gap: 3, alignItems: 'start' }}>
                <Card sx={{ overflow: 'hidden' }}>
                    <List sx={{ maxHeight: 560, overflowY: 'auto' }}>
                        {structures.map((s) => (
                            <ListItemButton key={s.id} selected={selected?.id === s.id} onClick={() => setSelected(s)} sx={{ borderRadius: 2, mx: 1, mb: 0.5, width: 'auto' }}>
                                <ListItemIcon sx={{ minWidth: 36 }}><FileStack size={18} /></ListItemIcon>
                                <ListItemText primary={s.name} secondary={s.description} slotProps={{ primary: { sx: { fontWeight: 600 } } }} />
                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDeleting(s); }}><Trash2 size={14} /></IconButton>
                            </ListItemButton>
                        ))}
                    </List>
                </Card>

                <Card sx={{ p: { xs: 2, sm: 3.5 }, minHeight: 500 }}>
                    {selected ? (
                        <>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                                <Box>
                                    <Typography variant="h5">{selected.name}</Typography>
                                    <Typography variant="body2" color="text.secondary">{attached.size} components attached</Typography>
                                </Box>
                                <Stack direction="row" spacing={1}>
                                    <Chip label="Edit name" size="small" onClick={() => openEdit(selected)} variant="outlined" />
                                    <Button variant="contained" size="small" disabled={saving || loadingDetail} onClick={saveComponents}>
                                        {saving ? 'Saving…' : 'Save Components'}
                                    </Button>
                                </Stack>
                            </Stack>

                            {allComponents.length === 0 ? (
                                <EmptyState title="No active components yet" description="Create salary components first, then attach them here." />
                            ) : (
                                <Stack spacing={3}>
                                    <Box>
                                        <Typography variant="subtitle2" color="success.main" sx={{ mb: 1 }}>Earnings</Typography>
                                        <Stack divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}>{earnings.map(renderComponentRow)}</Stack>
                                    </Box>
                                    <Box>
                                        <Typography variant="subtitle2" color="error.main" sx={{ mb: 1 }}>Deductions</Typography>
                                        <Stack divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}>{deductions.map(renderComponentRow)}</Stack>
                                    </Box>
                                </Stack>
                            )}
                        </>
                    ) : (
                        <EmptyState icon={<FileStack size={28} />} title="No structure selected" description="Create a salary structure to start attaching components." />
                    )}
                </Card>
            </Box>

            <PayrollStructureFormDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                onSubmit={handleSubmit}
                mode={editing ? 'edit' : 'add'}
                grades={grades}
                defaultValues={editing ? { name: editing.name, description: editing.description || '', grade_id: editing.grade_id ? String(editing.grade_id) : '' } : {}}
            />

            <ConfirmDialog
                open={!!deleting}
                title={`Delete "${deleting?.name}"?`}
                description="Structures assigned to an employee cannot be deleted."
                confirmLabel="Delete"
                destructive
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </Box>
    );
}

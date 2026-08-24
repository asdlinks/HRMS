import { useEffect, useState, type FormEvent } from 'react';
import {
    Box, Card, List, ListItemButton, ListItemIcon, ListItemText, Chip,
    TextField, Button, Dialog, DialogTitle, DialogContent, DialogActions, Stack, Switch, FormControlLabel,
    FormGroup, Checkbox, Grid2 as Grid, Typography,
} from '@mui/material';
import { Plus, Layers } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { PageHeader, EmptyState, PageSpinner } from '../../components/ui';
import {
    listSubscriptionPlans, createSubscriptionPlan, updateSubscriptionPlan,
    type SubscriptionPlan, type SubscriptionPlanInput,
} from '../api/subscriptionPlans';
import { GATEABLE_MODULES } from '../config/planModules';
import { getErrorMessage } from '../../types';

const emptyForm: SubscriptionPlanInput = {
    name: '', max_employees: null, storage_limit_mb: null, support_level: '', trial_days: null,
    enabled_modules: [], monthly_price: null, annual_price: null, is_active: true,
};

// Platform Settings > Subscription Plans (Phase 13E, Part 8) — the catalog
// a Platform Admin creates/edits, then assigns per-company from Company
// Detail. No delete: a plan already assigned to a company can only be
// soft-disabled (is_active) so the "assign to a company" picker drops it
// without breaking anything already on it.
export default function PlatformSettingsPage() {
    const { enqueueSnackbar } = useSnackbar();
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
    const [form, setForm] = useState<SubscriptionPlanInput>(emptyForm);
    const [saving, setSaving] = useState(false);

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const resp = await listSubscriptionPlans();
            setPlans(resp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load subscription plans'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const openAdd = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
    const openEdit = (plan: SubscriptionPlan) => {
        setEditing(plan);
        setForm({
            name: plan.name, max_employees: plan.max_employees, storage_limit_mb: plan.storage_limit_mb,
            support_level: plan.support_level, trial_days: plan.trial_days, enabled_modules: plan.enabled_modules,
            monthly_price: plan.monthly_price, annual_price: plan.annual_price, is_active: plan.is_active,
        });
        setDialogOpen(true);
    };

    const toggleModule = (code: string) => {
        setForm((f) => ({
            ...f,
            enabled_modules: f.enabled_modules.includes(code)
                ? f.enabled_modules.filter((m) => m !== code)
                : [...f.enabled_modules, code],
        }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editing) {
                await updateSubscriptionPlan(editing.id, form);
                enqueueSnackbar('Subscription plan updated', { variant: 'success' });
            } else {
                await createSubscriptionPlan(form);
                enqueueSnackbar('Subscription plan created', { variant: 'success' });
            }
            setDialogOpen(false);
            fetchAll();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to save subscription plan'), { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const numOrNull = (v: string) => (v === '' ? null : Number(v));

    if (loading) return <PageSpinner />;

    return (
        <Box>
            <PageHeader
                title="Platform Settings"
                subtitle="Vendor-level configuration"
                actions={<Button variant="contained" startIcon={<Plus size={18} />} onClick={openAdd}>New Plan</Button>}
            />

            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>Subscription Plans</Typography>

            {plans.length === 0 ? (
                <EmptyState icon={<Layers size={28} />} title="No subscription plans yet" description="Create a plan to assign it to companies." />
            ) : (
                <Card>
                    <List>
                        {plans.map((plan) => (
                            <ListItemButton key={plan.id} onClick={() => openEdit(plan)} sx={{ borderRadius: 2, mx: 1, my: 0.5 }}>
                                <ListItemIcon sx={{ minWidth: 36 }}><Layers size={18} /></ListItemIcon>
                                <ListItemText
                                    primary={plan.name}
                                    secondary={[
                                        `${plan.max_employees ?? 'Unlimited'} employees`,
                                        `${plan.storage_limit_mb ? `${plan.storage_limit_mb} MB` : 'Unlimited'} storage`,
                                        plan.support_level,
                                        plan.enabled_modules.length ? plan.enabled_modules.join(', ') : 'No add-on modules',
                                    ].filter(Boolean).join(' · ')}
                                />
                                {!plan.is_active && <Chip label="Inactive" size="small" />}
                            </ListItemButton>
                        ))}
                    </List>
                </Card>
            )}

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{editing ? `Edit ${editing.name}` : 'New Subscription Plan'}</DialogTitle>
                <Box component="form" onSubmit={handleSubmit}>
                    <DialogContent>
                        <Grid container spacing={2}>
                            <Grid size={12}>
                                <TextField label="Plan Name" required fullWidth value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    label="Max Employees" type="number" fullWidth
                                    placeholder="Unlimited"
                                    value={form.max_employees ?? ''}
                                    onChange={(e) => setForm({ ...form, max_employees: numOrNull(e.target.value) })}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    label="Storage Limit (MB)" type="number" fullWidth
                                    placeholder="Unlimited"
                                    value={form.storage_limit_mb ?? ''}
                                    onChange={(e) => setForm({ ...form, storage_limit_mb: numOrNull(e.target.value) })}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    label="Support Level" fullWidth placeholder="e.g. Basic, Standard, Priority"
                                    value={form.support_level || ''}
                                    onChange={(e) => setForm({ ...form, support_level: e.target.value })}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    label="Trial Duration (days)" type="number" fullWidth
                                    placeholder="No trial"
                                    value={form.trial_days ?? ''}
                                    onChange={(e) => setForm({ ...form, trial_days: numOrNull(e.target.value) })}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    label="Monthly Price (future)" type="number" fullWidth
                                    placeholder="Not set"
                                    value={form.monthly_price ?? ''}
                                    onChange={(e) => setForm({ ...form, monthly_price: numOrNull(e.target.value) })}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    label="Annual Price (future)" type="number" fullWidth
                                    placeholder="Not set"
                                    value={form.annual_price ?? ''}
                                    onChange={(e) => setForm({ ...form, annual_price: numOrNull(e.target.value) })}
                                />
                            </Grid>
                            <Grid size={12}>
                                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Enabled Modules</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                    Core modules (Dashboard, Time &amp; Leave, Employees, Settings, Company Documents) are always available regardless of plan.
                                </Typography>
                                <FormGroup row>
                                    {GATEABLE_MODULES.map((m) => (
                                        <FormControlLabel
                                            key={m.code}
                                            control={<Checkbox checked={form.enabled_modules.includes(m.code)} onChange={() => toggleModule(m.code)} />}
                                            label={m.label}
                                        />
                                    ))}
                                </FormGroup>
                            </Grid>
                            <Grid size={12}>
                                <FormControlLabel
                                    control={<Switch checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />}
                                    label="Active (assignable to companies)"
                                />
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 3 }}>
                        <Button color="inherit" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={saving}>
                            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}
                        </Button>
                    </DialogActions>
                </Box>
            </Dialog>
        </Box>
    );
}

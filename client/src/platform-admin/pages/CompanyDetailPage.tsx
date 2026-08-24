import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Paper, TextField, Button, Typography, Grid2 as Grid, Tabs, Tab, Alert,
    Accordion, AccordionSummary, AccordionDetails, Chip, Stack, LinearProgress, Divider,
    FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import { ChevronDown, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { PageHeader, StatusBadge, ConfirmDialog, PageSpinner } from '../../components/ui';
import {
    getCompany, updateCompany, activateCompany, suspendCompany, resetAdminPassword, getProvisioningHistory,
    getTenantHealth, getTenantUsage, updateSubscription,
    type Company, type ProvisioningLog, type TenantHealth, type TenantUsage,
} from '../api/companies';
import { listSubscriptionPlans, type SubscriptionPlan } from '../api/subscriptionPlans';
import { getErrorMessage } from '../../types';

// ≥90% of a plan's limit — same threshold both here (Employee Usage) and on
// EmployeesPage.tsx's own usage banner, so the two surfaces agree on what
// "approaching the limit" means (Part 10).
const USAGE_WARNING_THRESHOLD = 0.9;

const HEALTH_LABELS: Record<keyof TenantHealth['checks'], string> = {
    companyProfileCompleted: 'Company Profile Completed',
    departmentsConfigured: 'Departments Configured',
    employeesAdded: 'Employees Added',
    holidaysConfigured: 'Holidays Configured',
    attendanceConfigured: 'Attendance Configured',
    payrollConfigured: 'Payroll Configured',
    faceAttendanceConfigured: 'Face Attendance Configured',
    companyDocumentsPresent: 'Company Documents Present',
};

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }
    return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDateTime(value: string | null) {
    return value ? new Date(value).toLocaleString() : 'Never';
}

export default function CompanyDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { enqueueSnackbar } = useSnackbar();

    const [company, setCompany] = useState<Company | null>(null);
    const [logs, setLogs] = useState<ProvisioningLog[]>([]);
    const [health, setHealth] = useState<TenantHealth | null>(null);
    const [usage, setUsage] = useState<TenantUsage | null>(null);
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState(0);
    const [form, setForm] = useState<Partial<Company>>({});
    const [subscriptionPlanId, setSubscriptionPlanId] = useState('');
    const [saving, setSaving] = useState(false);
    const [savingSubscription, setSavingSubscription] = useState(false);
    const [confirmAction, setConfirmAction] = useState<'activate' | 'suspend' | 'reset' | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [resetResult, setResetResult] = useState<{ adminEmail: string; newPassword: string } | null>(null);

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const [companyResp, logsResp, healthResp, usageResp, plansResp] = await Promise.all([
                getCompany(id), getProvisioningHistory(id), getTenantHealth(id), getTenantUsage(id), listSubscriptionPlans(),
            ]);
            setCompany(companyResp.data);
            setForm(companyResp.data);
            setSubscriptionPlanId(companyResp.data.subscription_plan_id ? String(companyResp.data.subscription_plan_id) : '');
            setLogs(logsResp.data);
            setHealth(healthResp.data);
            setUsage(usageResp.data);
            setPlans(plansResp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load company'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [id, enqueueSnackbar]);

    useEffect(() => { load(); }, [load]);

    if (loading || !company) return <PageSpinner />;

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateCompany(company.id, form);
            enqueueSnackbar('Company updated', { variant: 'success' });
            load();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to save changes'), { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveSubscription = async () => {
        if (!subscriptionPlanId) return;
        setSavingSubscription(true);
        try {
            await updateSubscription(company.id, { subscription_plan_id: Number(subscriptionPlanId) });
            enqueueSnackbar('Subscription plan updated — enabled modules refreshed to match', { variant: 'success' });
            load();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to save subscription'), { variant: 'error' });
        } finally {
            setSavingSubscription(false);
        }
    };

    const runConfirmedAction = async () => {
        setActionLoading(true);
        try {
            if (confirmAction === 'activate') {
                await activateCompany(company.id);
                enqueueSnackbar('Company activated', { variant: 'success' });
                load();
            } else if (confirmAction === 'suspend') {
                await suspendCompany(company.id);
                enqueueSnackbar('Company suspended', { variant: 'success' });
                load();
            } else if (confirmAction === 'reset') {
                const { data } = await resetAdminPassword(company.id);
                setResetResult(data);
            }
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Action failed'), { variant: 'error' });
        } finally {
            setActionLoading(false);
            setConfirmAction(null);
        }
    };

    return (
        <Box>
            <PageHeader
                title={company.name}
                subtitle={`Company code: ${company.slug}`}
                actions={
                    <>
                        <StatusBadge status={company.status} />
                        {company.status === 'suspended' ? (
                            <Button variant="outlined" color="success" onClick={() => setConfirmAction('activate')}>Reactivate</Button>
                        ) : (
                            <Button variant="outlined" color="error" onClick={() => setConfirmAction('suspend')}>Suspend</Button>
                        )}
                        <Button variant="outlined" onClick={() => setConfirmAction('reset')}>Reset Admin Password</Button>
                    </>
                }
            />

            {resetResult && (
                <Alert severity="success" sx={{ mb: 3 }} onClose={() => setResetResult(null)}>
                    New password for {resetResult.adminEmail}: <strong style={{ fontFamily: 'monospace' }}>{resetResult.newPassword}</strong> — share it now, it cannot be retrieved again.
                </Alert>
            )}

            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
                <Tab label="Profile" />
                <Tab label="Tenant Health" />
                <Tab label="Usage" />
                <Tab label={`Provisioning History (${logs.length})`} />
            </Tabs>

            {tab === 0 && (
                <Stack spacing={3}>
                    <Paper sx={{ p: 4, maxWidth: 640 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Company Profile</Typography>
                        <Grid container spacing={2.5}>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField label="Company Name" fullWidth value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField label="Currency" fullWidth value={form.currency || ''} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField label="Date Format" fullWidth value={form.date_format || ''} onChange={(e) => setForm({ ...form, date_format: e.target.value })} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    label="Financial Year Start Month"
                                    type="number"
                                    fullWidth
                                    slotProps={{ htmlInput: { min: 1, max: 12 } }}
                                    value={form.financial_year_start_month ?? ''}
                                    onChange={(e) => setForm({ ...form, financial_year_start_month: parseInt(e.target.value, 10) || 1 })}
                                />
                            </Grid>
                            <Grid size={12}>
                                <Button variant="contained" onClick={handleSave} disabled={saving}>
                                    {saving ? 'Saving…' : 'Save Changes'}
                                </Button>
                            </Grid>
                        </Grid>
                    </Paper>

                    <Paper sx={{ p: 4, maxWidth: 640 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Subscription</Typography>
                        <Grid container spacing={2.5}>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <FormControl fullWidth>
                                    <InputLabel>Subscription Plan</InputLabel>
                                    <Select label="Subscription Plan" value={subscriptionPlanId} onChange={(e) => setSubscriptionPlanId(e.target.value)}>
                                        {plans.map((p) => (
                                            <MenuItem key={p.id} value={String(p.id)}>
                                                {p.name}{!p.is_active ? ' (inactive)' : ''} — {p.max_employees ?? 'Unlimited'} employees
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }} sx={{ display: 'flex', alignItems: 'center' }}>
                                <Button variant="contained" onClick={handleSaveSubscription} disabled={savingSubscription || !subscriptionPlanId}>
                                    {savingSubscription ? 'Saving…' : 'Assign Plan'}
                                </Button>
                            </Grid>

                            <Grid size={{ xs: 12, sm: 6 }}>
                                <Typography color="text.secondary">Employee Usage</Typography>
                                <Typography variant="h6">
                                    {company.employee_count ?? 0} / {company.max_employees ?? 'Unlimited'}
                                </Typography>
                                {company.max_employees != null && (company.employee_count ?? 0) / company.max_employees >= USAGE_WARNING_THRESHOLD && (
                                    <Chip label="Approaching limit" size="small" color="warning" sx={{ mt: 0.5 }} />
                                )}
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <Typography color="text.secondary">Storage Usage</Typography>
                                <Typography variant="h6">
                                    {usage ? formatBytes(usage.storageUsedBytes) : '—'} / {company.storage_limit_mb ? `${company.storage_limit_mb} MB` : 'Unlimited'}
                                </Typography>
                            </Grid>
                            <Grid size={12}>
                                <Typography color="text.secondary" sx={{ mb: 0.5 }}>Enabled Modules</Typography>
                                {company.subscription_enabled_modules && company.subscription_enabled_modules.length > 0 ? (
                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                        {company.subscription_enabled_modules.map((m) => <Chip key={m} label={m} size="small" />)}
                                    </Stack>
                                ) : (
                                    <Typography variant="body2" color="text.secondary">No add-on modules enabled for this plan</Typography>
                                )}
                            </Grid>
                        </Grid>
                    </Paper>
                </Stack>
            )}

            {tab === 1 && health && (
                <Paper sx={{ p: 4, maxWidth: 640 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Setup Completion</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>{health.setupCompletionPercent}%</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={health.setupCompletionPercent} sx={{ height: 8, borderRadius: 4, mb: 3 }} />
                    <Stack spacing={1.5} divider={<Divider />}>
                        {(Object.keys(HEALTH_LABELS) as Array<keyof TenantHealth['checks']>).map((key) => (
                            <Stack key={key} direction="row" spacing={1.5} alignItems="center">
                                {health.checks[key] ? (
                                    <CheckCircle2 size={18} color="green" />
                                ) : (
                                    <AlertTriangle size={18} color="orange" />
                                )}
                                <Typography>{HEALTH_LABELS[key]}</Typography>
                            </Stack>
                        ))}
                    </Stack>
                </Paper>
            )}

            {tab === 2 && usage && (
                <Paper sx={{ p: 4, maxWidth: 640 }}>
                    <Grid container spacing={2.5}>
                        <Grid size={{ xs: 12, sm: 6 }}><Typography color="text.secondary">Employee Count</Typography><Typography variant="h6">{usage.employeeCount}</Typography></Grid>
                        <Grid size={{ xs: 12, sm: 6 }}><Typography color="text.secondary">Active Users</Typography><Typography variant="h6">{usage.activeUserCount}</Typography></Grid>
                        <Grid size={{ xs: 12, sm: 6 }}><Typography color="text.secondary">Last Login</Typography><Typography variant="h6">{formatDateTime(usage.lastLoginAt)}</Typography></Grid>
                        <Grid size={{ xs: 12, sm: 6 }}><Typography color="text.secondary">Documents Uploaded</Typography><Typography variant="h6">{usage.documentsUploaded}</Typography></Grid>
                        <Grid size={{ xs: 12, sm: 6 }}><Typography color="text.secondary">Storage Used</Typography><Typography variant="h6">{formatBytes(usage.storageUsedBytes)}</Typography></Grid>
                        <Grid size={{ xs: 12, sm: 6 }}><Typography color="text.secondary">Last Payroll Run</Typography><Typography variant="h6">{formatDateTime(usage.lastPayrollRunAt)}</Typography></Grid>
                        <Grid size={{ xs: 12, sm: 6 }}><Typography color="text.secondary">Last Attendance Sync</Typography><Typography variant="h6">{formatDateTime(usage.lastAttendanceSyncAt)}</Typography></Grid>
                    </Grid>
                </Paper>
            )}

            {tab === 3 && (
                <Box>
                    {logs.length === 0 && <Alert severity="info">No provisioning history yet.</Alert>}
                    {logs.map((log) => (
                        <Accordion key={log.id} sx={{ mb: 1.5 }}>
                            <AccordionSummary expandIcon={<ChevronDown size={18} />}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                                    <Chip
                                        label={log.status}
                                        size="small"
                                        color={log.status === 'success' ? 'success' : 'error'}
                                    />
                                    <Typography sx={{ flexGrow: 1 }}>
                                        {new Date(log.created_at).toLocaleString()} — {log.platform_admin_name}
                                    </Typography>
                                </Box>
                            </AccordionSummary>
                            <AccordionDetails>
                                {log.error_message && <Alert severity="error" sx={{ mb: 2 }}>{log.error_message}</Alert>}
                                {log.steps.map((s, i) => (
                                    <Typography key={i} variant="body2" sx={{ fontFamily: 'monospace' }}>
                                        {s.status === 'success' ? '✓' : '✗'} {s.step}
                                    </Typography>
                                ))}
                            </AccordionDetails>
                        </Accordion>
                    ))}
                </Box>
            )}

            <ConfirmDialog
                open={confirmAction !== null}
                title={
                    confirmAction === 'activate' ? 'Reactivate this company?'
                        : confirmAction === 'suspend' ? 'Suspend this company?'
                            : 'Reset the administrator password?'
                }
                description={
                    confirmAction === 'suspend'
                        ? 'Every user at this company will be immediately unable to log in.'
                        : confirmAction === 'reset'
                            ? 'A new one-time password will be generated and every existing session for this administrator will be signed out.'
                            : undefined
                }
                destructive={confirmAction === 'suspend'}
                loading={actionLoading}
                onConfirm={runConfirmedAction}
                onCancel={() => setConfirmAction(null)}
            />

            <Button sx={{ mt: 3 }} onClick={() => navigate('/platform-admin/companies')}>← Back to Companies</Button>
        </Box>
    );
}

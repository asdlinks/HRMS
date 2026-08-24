import { useEffect, useState } from 'react';
import { Box, Card, Grid2 as Grid, TextField, FormControl, InputLabel, Select, MenuItem, Button, Typography } from '@mui/material';
import { Save } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getSettings, updateSettings, getSalaryComponents } from '../api';
import { PageHeader, PageSpinner } from '../components/ui';
import { getErrorMessage } from '../types';
import { useAuth } from '../auth/AuthContext';

interface PayrollSettings {
    pay_cycle_day: number;
    financial_year_start_month: number;
    currency: string;
    ot_rate_multiplier: number;
    ot_hourly_base_component_code: string | null;
    standard_monthly_hours: number;
    rounding_rule: string;
}
interface ComponentOption { id: number; code: string; name: string; component_type: string }

const DEFAULTS: PayrollSettings = {
    pay_cycle_day: 1, financial_year_start_month: 4, currency: 'INR', ot_rate_multiplier: 1.5,
    ot_hourly_base_component_code: null, standard_monthly_hours: 208, rounding_rule: 'nearest_1',
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// `compact` is set when embedded inside SettingsPage.tsx's own content panel
// (its own heading/frame already applies) — the standalone /payroll/settings
// route (still linked from the Payroll module's own nav) renders full chrome.
export default function PayrollSettingsPage({ compact = false }: { compact?: boolean }) {
    const { enqueueSnackbar } = useSnackbar();
    const { hasPermission } = useAuth();
    const canManage = hasPermission('payroll.settings.manage');
    const [settings, setSettings] = useState<PayrollSettings>(DEFAULTS);
    const [components, setComponents] = useState<ComponentOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        try {
            const [settingsResp, componentsResp] = await Promise.all([getSettings(), getSalaryComponents(true)]);
            setSettings({ ...DEFAULTS, ...(settingsResp.data.payroll_settings || {}) });
            setComponents(componentsResp.data.filter((c: ComponentOption) => c.component_type === 'earning'));
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load payroll settings'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateSettings({ payroll_settings: JSON.stringify(settings) });
            enqueueSnackbar('Payroll settings saved', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to save payroll settings'), { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <PageSpinner />;

    const saveButton = canManage && <Button variant="contained" startIcon={<Save size={18} />} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</Button>;

    return (
        <Box className={compact ? undefined : 'fade-in'} sx={compact ? undefined : { maxWidth: 900, mx: 'auto' }}>
            {compact ? (
                saveButton && <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>{saveButton}</Box>
            ) : (
                <PageHeader
                    title="Payroll Settings"
                    subtitle="Pay cycle, overtime and rounding rules — applied by the calculation engine on every run."
                    actions={saveButton}
                />
            )}

            <Card sx={{ p: { xs: 2.5, sm: 4 } }}>
                <Typography variant="h6" sx={{ mb: 0.5 }}>Pay Cycle</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Payroll runs are monthly; these settings control cycle bookkeeping and the financial year.</Typography>
                <Grid container spacing={2.5} sx={{ mb: 4 }}>
                    <Grid size={{ xs: 12, sm: 4 }}>
                        <TextField
                            fullWidth label="Pay cycle day" type="number" value={settings.pay_cycle_day} disabled={!canManage}
                            onChange={(e) => setSettings({ ...settings, pay_cycle_day: Number(e.target.value) })}
                            helperText="Day of month payroll is typically paid"
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                        <FormControl fullWidth disabled={!canManage}>
                            <InputLabel>Financial year starts</InputLabel>
                            <Select
                                label="Financial year starts" value={settings.financial_year_start_month}
                                onChange={(e) => setSettings({ ...settings, financial_year_start_month: Number(e.target.value) })}
                            >
                                {MONTH_NAMES.map((m, i) => <MenuItem key={m} value={i + 1}>{m}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                        <TextField fullWidth label="Currency" value={settings.currency} disabled={!canManage} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} />
                    </Grid>
                </Grid>

                <Typography variant="h6" sx={{ mb: 0.5 }}>Overtime</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Hourly rate = the chosen component's unprorated monthly amount ÷ standard monthly hours, × the multiplier.
                </Typography>
                <Grid container spacing={2.5} sx={{ mb: 4 }}>
                    <Grid size={{ xs: 12, sm: 4 }}>
                        <FormControl fullWidth disabled={!canManage}>
                            <InputLabel>Hourly rate base component</InputLabel>
                            <Select
                                label="Hourly rate base component" value={settings.ot_hourly_base_component_code || ''}
                                onChange={(e) => setSettings({ ...settings, ot_hourly_base_component_code: e.target.value || null })}
                            >
                                <MenuItem value="">Not configured (OT amount will be 0)</MenuItem>
                                {components.map((c) => <MenuItem key={c.id} value={c.code}>{c.name} ({c.code})</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                        <TextField
                            fullWidth label="Standard monthly hours" type="number" value={settings.standard_monthly_hours} disabled={!canManage}
                            onChange={(e) => setSettings({ ...settings, standard_monthly_hours: Number(e.target.value) })}
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                        <TextField
                            fullWidth label="Overtime rate multiplier" type="number" value={settings.ot_rate_multiplier} disabled={!canManage}
                            onChange={(e) => setSettings({ ...settings, ot_rate_multiplier: Number(e.target.value) })}
                            helperText="e.g. 1.5 for 1.5x hourly rate"
                        />
                    </Grid>
                </Grid>

                <Typography variant="h6" sx={{ mb: 0.5 }}>Rounding</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Applied only to the final net pay figure, never to individual components.</Typography>
                <Grid container spacing={2.5}>
                    <Grid size={{ xs: 12, sm: 4 }}>
                        <FormControl fullWidth disabled={!canManage}>
                            <InputLabel>Net pay rounding</InputLabel>
                            <Select label="Net pay rounding" value={settings.rounding_rule} onChange={(e) => setSettings({ ...settings, rounding_rule: e.target.value })}>
                                <MenuItem value="none">No rounding</MenuItem>
                                <MenuItem value="nearest_1">Nearest whole number</MenuItem>
                                <MenuItem value="nearest_0.5">Nearest 0.5</MenuItem>
                                <MenuItem value="round_up">Always round up</MenuItem>
                                <MenuItem value="round_down">Always round down</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                </Grid>
            </Card>
        </Box>
    );
}

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Box, Paper, TextField, Button, Typography, Alert, Grid2 as Grid, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { Copy, Check } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/ui';
import { createCompany, type CreateCompanyResult } from '../api/companies';
import { listSubscriptionPlans, type SubscriptionPlan } from '../api/subscriptionPlans';
import { getErrorMessage } from '../../types';

const createCompanySchema = z.object({
    name: z.string().min(1, 'Company name is required'),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,49}$/, 'Lowercase letters, numbers and hyphens only'),
    phone: z.string().min(1, 'Company contact number is required'),
    adminName: z.string().min(1, 'Administrator name is required'),
    adminEmail: z.string().email('Enter a valid email address'),
});
type CreateCompanyForm = z.infer<typeof createCompanySchema>;

export default function CompanyCreatePage() {
    const navigate = useNavigate();
    const { enqueueSnackbar } = useSnackbar();
    const [result, setResult] = useState<CreateCompanyResult | null>(null);
    const [copied, setCopied] = useState(false);
    const [roleTemplate, setRoleTemplate] = useState<'simple' | 'enterprise'>('enterprise');
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [subscriptionPlanId, setSubscriptionPlanId] = useState('');
    const [status, setStatus] = useState<'trial' | 'active'>('trial');

    useEffect(() => {
        listSubscriptionPlans(true).then((resp) => setPlans(resp.data)).catch(() => {});
    }, []);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<CreateCompanyForm>({ resolver: zodResolver(createCompanySchema) });

    const onSubmit = async (values: CreateCompanyForm) => {
        if (!subscriptionPlanId) {
            enqueueSnackbar('Select a subscription plan', { variant: 'error' });
            return;
        }
        try {
            const { data } = await createCompany({
                ...values, roleTemplate, subscription_plan_id: Number(subscriptionPlanId), status,
            });
            setResult(data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to create company'), { variant: 'error' });
        }
    };

    const copyCredentials = () => {
        navigator.clipboard.writeText(`Email: ${result?.adminEmail}\nPassword: ${result?.generatedPassword}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (result) {
        return (
            <Box>
                <PageHeader title="Company Created" subtitle="Share these credentials with the new administrator now — they cannot be retrieved again." />
                <Paper sx={{ p: 4, maxWidth: 560 }}>
                    <Alert severity="success" sx={{ mb: 3 }}>
                        Company provisioned successfully with full default configuration.
                    </Alert>
                    <Typography variant="overline" color="text.secondary">Administrator Email</Typography>
                    <Typography variant="body1" sx={{ mb: 2, fontFamily: 'monospace' }}>{result.adminEmail}</Typography>
                    <Typography variant="overline" color="text.secondary">One-Time Password</Typography>
                    <Typography variant="body1" sx={{ mb: 3, fontFamily: 'monospace', fontWeight: 700 }}>{result.generatedPassword}</Typography>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <Button
                            variant="outlined"
                            startIcon={copied ? <Check size={16} /> : <Copy size={16} />}
                            onClick={copyCredentials}
                        >
                            {copied ? 'Copied' : 'Copy Credentials'}
                        </Button>
                        <Button variant="contained" onClick={() => navigate(`/platform-admin/companies/${result.tenantId}`)}>
                            View Company
                        </Button>
                    </Box>
                </Paper>
            </Box>
        );
    }

    return (
        <Box>
            <PageHeader title="New Company" subtitle="Provisions a fully configured tenant — roles, navigation, attendance policies, payroll defaults and the first Organization Administrator, all in one step." />
            <Paper sx={{ p: 4, maxWidth: 640 }} component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
                <Grid container spacing={2.5}>
                    <Grid size={12}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Company</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField label="Company Name" fullWidth error={!!errors.name} helperText={errors.name?.message} {...register('name')} />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                            label="Company Code (slug)"
                            placeholder="e.g. acme"
                            fullWidth
                            error={!!errors.slug}
                            helperText={errors.slug?.message || 'Used to log into the HRMS'}
                            {...register('slug')}
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                            label="Company Contact Number"
                            fullWidth
                            error={!!errors.phone}
                            helperText={errors.phone?.message}
                            {...register('phone')}
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <FormControl fullWidth required>
                            <InputLabel>Subscription Plan</InputLabel>
                            <Select label="Subscription Plan" value={subscriptionPlanId} onChange={(e) => setSubscriptionPlanId(e.target.value)}>
                                {plans.map((p) => (
                                    <MenuItem key={p.id} value={String(p.id)}>
                                        {p.name} ({p.max_employees ?? 'Unlimited'} employees)
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <FormControl fullWidth>
                            <InputLabel>Company Status</InputLabel>
                            <Select label="Company Status" value={status} onChange={(e) => setStatus(e.target.value as 'trial' | 'active')}>
                                <MenuItem value="trial">Trial</MenuItem>
                                <MenuItem value="active">Active</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid size={12}>
                        <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>First Organization Administrator</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField label="Administrator Name" fullWidth error={!!errors.adminName} helperText={errors.adminName?.message} {...register('adminName')} />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField label="Administrator Email" type="email" fullWidth error={!!errors.adminEmail} helperText={errors.adminEmail?.message} {...register('adminEmail')} />
                    </Grid>

                    <Grid size={12}>
                        <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>Default Role Template</Typography>
                    </Grid>
                    <Grid size={12}>
                        <FormControl fullWidth>
                            <InputLabel>Role Template</InputLabel>
                            <Select label="Role Template" value={roleTemplate} onChange={(e) => setRoleTemplate(e.target.value as 'simple' | 'enterprise')}>
                                <MenuItem value="simple">Simple Organization — Organization Administrator, HR Administrator, Manager, Employee</MenuItem>
                                <MenuItem value="enterprise">Enterprise Organization — adds Payroll Administrator and Attendance Administrator</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid size={12} sx={{ display: 'flex', gap: 2, mt: 1 }}>
                        <Button variant="outlined" onClick={() => navigate('/platform-admin/companies')}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={isSubmitting}>
                            {isSubmitting ? 'Provisioning…' : 'Create Company'}
                        </Button>
                    </Grid>
                </Grid>
            </Paper>
        </Box>
    );
}

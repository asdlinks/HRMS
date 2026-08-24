import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    Box, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
    FormControl, InputLabel, Select, MenuItem, Grid2 as Grid, FormControlLabel, Switch,
    FormGroup, Checkbox, Typography, Divider,
} from '@mui/material';
import { MapPinned } from 'lucide-react';

const POLICY_TYPES = ['OfficeOnly', 'Hybrid', 'Remote', 'FieldStaff'] as const;
const POLICY_TYPE_LABELS: Record<string, string> = {
    OfficeOnly: 'Office Only', Hybrid: 'Hybrid', Remote: 'Remote', FieldStaff: 'Field Staff',
};

// Mirrors ATTENDANCE_METHODS in server/schemas/index.js — every method the
// engine understands is selectable here, none hardcoded into a fixed set of
// checkboxes that could drift from the server's enum.
const METHODS = ['Face', 'WFH', 'ClientVisit', 'FieldWork', 'Manual', 'Biometric', 'QRCode', 'API'] as const;
const METHOD_LABELS: Record<string, string> = {
    Face: 'Face Recognition (kiosk)', WFH: 'Work From Home', ClientVisit: 'Client Visit',
    FieldWork: 'Field Work', Manual: 'Manual (self check-in)', Biometric: 'Biometric',
    QRCode: 'QR Code', API: 'API',
};

const policySchema = z.object({
    name: z.string().min(1, 'Name is required').max(150),
    policy_type: z.enum(POLICY_TYPES),
    allowed_methods: z.array(z.enum(METHODS)).min(1, 'Select at least one method'),
    geofence_lat: z.string().optional(),
    geofence_lng: z.string().optional(),
    geofence_radius: z.string().optional(),
    is_active: z.boolean(),
});
export type PolicyFormValues = z.infer<typeof policySchema>;

const emptyDefaults: PolicyFormValues = {
    name: '', policy_type: 'Hybrid', allowed_methods: [], geofence_lat: '', geofence_lng: '', geofence_radius: '', is_active: true,
};

export interface PolicySubmitPayload {
    name: string;
    policy_type: string;
    allowed_methods: string[];
    config: { geofence_center_lat: number; geofence_center_lng: number; geofence_radius_meters: number } | null;
    is_active: boolean;
}

interface AttendancePolicyFormDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (values: PolicySubmitPayload) => Promise<void>;
    defaultValues: Partial<PolicyFormValues>;
    mode: 'add' | 'edit';
}

export default function AttendancePolicyFormDialog({ open, onClose, onSubmit, defaultValues, mode }: AttendancePolicyFormDialogProps) {
    const { control, handleSubmit, reset, formState: { errors, isSubmitting } } =
        useForm<PolicyFormValues>({ resolver: zodResolver(policySchema), defaultValues: emptyDefaults });

    useEffect(() => {
        if (open) reset({ ...emptyDefaults, ...defaultValues });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, defaultValues]);

    const submit = async (values: PolicyFormValues) => {
        const hasGeofence = values.geofence_lat && values.geofence_lng && values.geofence_radius;
        await onSubmit({
            name: values.name,
            policy_type: values.policy_type,
            allowed_methods: values.allowed_methods,
            config: hasGeofence ? {
                geofence_center_lat: Number(values.geofence_lat),
                geofence_center_lng: Number(values.geofence_lng),
                geofence_radius_meters: Number(values.geofence_radius),
            } : null,
            is_active: values.is_active,
        });
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>{mode === 'add' ? 'New Attendance Policy' : 'Edit Attendance Policy'}</DialogTitle>
            <Box component="form" onSubmit={handleSubmit(submit)} noValidate>
                <DialogContent>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 7 }}>
                            <Controller name="name" control={control} render={({ field }) => (
                                <TextField {...field} label="Policy name" fullWidth required error={!!errors.name} helperText={errors.name?.message} />
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 5 }}>
                            <Controller name="policy_type" control={control} render={({ field }) => (
                                <FormControl fullWidth required>
                                    <InputLabel>Policy type</InputLabel>
                                    <Select {...field} label="Policy type">
                                        {POLICY_TYPES.map((t) => <MenuItem key={t} value={t}>{POLICY_TYPE_LABELS[t]}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>

                        <Grid size={12}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Allowed check-in methods</Typography>
                            <Controller name="allowed_methods" control={control} render={({ field }) => (
                                <FormGroup row>
                                    {METHODS.map((m) => (
                                        <FormControlLabel
                                            key={m}
                                            control={
                                                <Checkbox
                                                    checked={field.value.includes(m)}
                                                    onChange={(e) => {
                                                        field.onChange(e.target.checked ? [...field.value, m] : field.value.filter((v) => v !== m));
                                                    }}
                                                />
                                            }
                                            label={METHOD_LABELS[m]}
                                        />
                                    ))}
                                </FormGroup>
                            )} />
                            {errors.allowed_methods && <Typography variant="caption" color="error">{errors.allowed_methods.message}</Typography>}
                        </Grid>

                        <Grid size={12}><Divider /></Grid>

                        <Grid size={12}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <MapPinned size={16} /> Geofence (optional)
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Leave blank to skip location checks — required only for policies that must restrict check-in to a fixed radius.
                            </Typography>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <Controller name="geofence_lat" control={control} render={({ field }) => (
                                <TextField {...field} label="Center latitude" fullWidth type="number" />
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <Controller name="geofence_lng" control={control} render={({ field }) => (
                                <TextField {...field} label="Center longitude" fullWidth type="number" />
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <Controller name="geofence_radius" control={control} render={({ field }) => (
                                <TextField {...field} label="Radius (meters)" fullWidth type="number" />
                            )} />
                        </Grid>

                        <Grid size={12}>
                            <Controller name="is_active" control={control} render={({ field }) => (
                                <FormControlLabel control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Active" />
                            )} />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button color="inherit" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving…' : mode === 'add' ? 'Create Policy' : 'Save Changes'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}

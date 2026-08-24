import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    Box, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
    FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';

const deviceSchema = z.object({
    device_name: z.string().min(1, 'Device name is required').max(150),
    location_id: z.string().optional(),
});
export type DeviceFormValues = z.infer<typeof deviceSchema>;

interface LocationOption { id: number; name: string }

interface KioskDeviceFormDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (values: { device_name: string; location_id: number | null }) => Promise<void>;
    locations: LocationOption[];
}

// Devices are register-once, key-rotate-after — there's no "edit" mode here,
// only "create" (KioskDevicesPage handles rotate/revoke as separate actions).
export default function KioskDeviceFormDialog({ open, onClose, onSubmit, locations }: KioskDeviceFormDialogProps) {
    const { control, handleSubmit, reset, formState: { errors, isSubmitting } } =
        useForm<DeviceFormValues>({ resolver: zodResolver(deviceSchema), defaultValues: { device_name: '', location_id: '' } });

    useEffect(() => {
        if (open) reset({ device_name: '', location_id: '' });
    }, [open, reset]);

    const submit = async (values: DeviceFormValues) => {
        await onSubmit({ device_name: values.device_name, location_id: values.location_id ? Number(values.location_id) : null });
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>Register Kiosk Device</DialogTitle>
            <Box component="form" onSubmit={handleSubmit(submit)} noValidate>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 0.5 }}>
                        <Controller name="device_name" control={control} render={({ field }) => (
                            <TextField {...field} label="Device name" placeholder="e.g. Main Entrance Kiosk" fullWidth required autoFocus error={!!errors.device_name} helperText={errors.device_name?.message} />
                        )} />
                        <Controller name="location_id" control={control} render={({ field }) => (
                            <FormControl fullWidth>
                                <InputLabel>Location (optional)</InputLabel>
                                <Select {...field} label="Location (optional)">
                                    <MenuItem value="">Unassigned</MenuItem>
                                    {locations.map((l) => <MenuItem key={l.id} value={String(l.id)}>{l.name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        )} />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button color="inherit" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={isSubmitting}>
                        {isSubmitting ? 'Registering…' : 'Register Device'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}

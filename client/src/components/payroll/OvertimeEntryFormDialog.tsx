import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Box, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, FormControl, InputLabel, Select, MenuItem, Grid2 as Grid } from '@mui/material';

export interface EmployeeOption { id: number; name: string; employee_id?: string }

const overtimeSchema = z.object({
    user_id: z.string().min(1, 'Employee is required'),
    work_date: z.string().min(1, 'Date is required'),
    hours: z.string().min(1, 'Hours are required'),
    reason: z.string().optional(),
});
export type OvertimeFormValues = z.infer<typeof overtimeSchema>;

const emptyDefaults: OvertimeFormValues = { user_id: '', work_date: new Date().toISOString().split('T')[0], hours: '', reason: '' };

interface OvertimeEntryFormDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (values: OvertimeFormValues) => Promise<void>;
    employees: EmployeeOption[];
    defaultValues?: Partial<OvertimeFormValues>;
}

export default function OvertimeEntryFormDialog({ open, onClose, onSubmit, employees, defaultValues }: OvertimeEntryFormDialogProps) {
    const { control, handleSubmit, reset, formState: { errors, isSubmitting } } =
        useForm<OvertimeFormValues>({ resolver: zodResolver(overtimeSchema), defaultValues: emptyDefaults });

    useEffect(() => {
        if (open) reset({ ...emptyDefaults, ...defaultValues });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, defaultValues]);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Submit Overtime</DialogTitle>
            <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
                <DialogContent>
                    <Grid container spacing={2}>
                        <Grid size={12}>
                            <Controller name="user_id" control={control} render={({ field }) => (
                                <FormControl fullWidth required error={!!errors.user_id}>
                                    <InputLabel>Employee</InputLabel>
                                    <Select {...field} label="Employee">
                                        {employees.map((e) => <MenuItem key={e.id} value={String(e.id)}>{e.name}{e.employee_id ? ` (${e.employee_id})` : ''}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>
                        <Grid size={6}>
                            <Controller name="work_date" control={control} render={({ field }) => (
                                <TextField {...field} type="date" label="Date" fullWidth required error={!!errors.work_date} helperText={errors.work_date?.message} slotProps={{ inputLabel: { shrink: true } }} />
                            )} />
                        </Grid>
                        <Grid size={6}>
                            <Controller name="hours" control={control} render={({ field }) => (
                                <TextField {...field} type="number" label="Hours" fullWidth required error={!!errors.hours} helperText={errors.hours?.message} slotProps={{ htmlInput: { step: 0.5, min: 0, max: 24 } }} />
                            )} />
                        </Grid>
                        <Grid size={12}>
                            <Controller name="reason" control={control} render={({ field }) => (
                                <TextField {...field} label="Reason" fullWidth multiline minRows={2} />
                            )} />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button color="inherit" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving…' : 'Submit'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}

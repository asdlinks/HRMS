import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    Box, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
    FormControl, InputLabel, Select, MenuItem, Grid2 as Grid, FormControlLabel, Switch, Alert,
} from '@mui/material';
import SlabEditor, { type SlabConfig } from './SlabEditor';

export interface ComponentOption { id: number; code: string; name: string; component_type: string }

const componentSchema = z.object({
    code: z.string().min(1, 'Code is required').max(50),
    name: z.string().min(1, 'Name is required').max(150),
    component_type: z.enum(['earning', 'deduction']),
    calculation_type: z.enum(['fixed', 'percent_ctc', 'percent_gross', 'percent_of_component', 'slab']),
    value: z.string().optional(),
    base_component_id: z.string().optional(),
    is_prorated_on_lop: z.boolean(),
    is_active: z.boolean(),
    sort_order: z.string().optional(),
});
export type ComponentFormValues = z.infer<typeof componentSchema>;

const emptyDefaults: ComponentFormValues = {
    code: '', name: '', component_type: 'earning', calculation_type: 'fixed',
    value: '', base_component_id: '', is_prorated_on_lop: true, is_active: true, sort_order: '0',
};
const emptySlabConfig: SlabConfig = { base: 'gross', bracket_type: 'flat', slabs: [] };

interface PayrollComponentFormDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (values: ComponentFormValues & { config: SlabConfig | null }) => Promise<void>;
    defaultValues: Partial<ComponentFormValues>;
    defaultConfig?: SlabConfig | null;
    existingComponents: ComponentOption[];
    mode: 'add' | 'edit';
}

export default function PayrollComponentFormDialog({
    open, onClose, onSubmit, defaultValues, defaultConfig, existingComponents, mode,
}: PayrollComponentFormDialogProps) {
    const { control, handleSubmit, watch, reset, formState: { errors, isSubmitting } } =
        useForm<ComponentFormValues>({ resolver: zodResolver(componentSchema), defaultValues: emptyDefaults });
    const [slabConfig, setSlabConfig] = useState<SlabConfig>(emptySlabConfig);

    useEffect(() => {
        if (open) {
            reset({ ...emptyDefaults, ...defaultValues });
            setSlabConfig(defaultConfig || emptySlabConfig);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, defaultValues, defaultConfig]);

    const calculationType = watch('calculation_type');
    const currentId = defaultValues && 'id' in defaultValues ? (defaultValues as { id?: number }).id : undefined;
    const baseOptions = existingComponents.filter((c) => c.id !== currentId);

    const submit = async (values: ComponentFormValues) => {
        await onSubmit({ ...values, config: values.calculation_type === 'slab' ? slabConfig : null });
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{mode === 'add' ? 'New Salary Component' : 'Edit Salary Component'}</DialogTitle>
            <Box component="form" onSubmit={handleSubmit(submit)} noValidate>
                <DialogContent>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="code" control={control} render={({ field }) => (
                                <TextField {...field} label="Code" placeholder="e.g. BASIC" fullWidth required error={!!errors.code} helperText={errors.code?.message || 'Unique short identifier'} />
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="name" control={control} render={({ field }) => (
                                <TextField {...field} label="Name" fullWidth required error={!!errors.name} helperText={errors.name?.message} />
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="component_type" control={control} render={({ field }) => (
                                <FormControl fullWidth required>
                                    <InputLabel>Type</InputLabel>
                                    <Select {...field} label="Type">
                                        <MenuItem value="earning">Earning</MenuItem>
                                        <MenuItem value="deduction">Deduction</MenuItem>
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="calculation_type" control={control} render={({ field }) => (
                                <FormControl fullWidth required>
                                    <InputLabel>Calculation</InputLabel>
                                    <Select {...field} label="Calculation">
                                        <MenuItem value="fixed">Fixed amount</MenuItem>
                                        <MenuItem value="percent_ctc">% of CTC</MenuItem>
                                        <MenuItem value="percent_gross">% of gross</MenuItem>
                                        <MenuItem value="percent_of_component">% of another component</MenuItem>
                                        <MenuItem value="slab">Slab table</MenuItem>
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>

                        {calculationType !== 'slab' && (
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <Controller name="value" control={control} render={({ field }) => (
                                    <TextField
                                        {...field} type="number" fullWidth
                                        label={calculationType === 'fixed' ? 'Monthly amount' : 'Percentage'}
                                        helperText={calculationType === 'fixed' ? 'Flat monthly amount' : 'e.g. 40 for 40%'}
                                    />
                                )} />
                            </Grid>
                        )}
                        {calculationType === 'percent_of_component' && (
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <Controller name="base_component_id" control={control} render={({ field }) => (
                                    <FormControl fullWidth required>
                                        <InputLabel>Base component</InputLabel>
                                        <Select {...field} label="Base component">
                                            {baseOptions.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name} ({c.code})</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                )} />
                            </Grid>
                        )}
                        {calculationType === 'slab' && (
                            <Grid size={12}>
                                <SlabEditor value={slabConfig} onChange={setSlabConfig} components={baseOptions} />
                            </Grid>
                        )}

                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="sort_order" control={control} render={({ field }) => (
                                <TextField {...field} type="number" label="Display order" fullWidth />
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Controller name="is_prorated_on_lop" control={control} render={({ field }) => (
                                <FormControlLabel control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Prorate on LOP" />
                            )} />
                            <Controller name="is_active" control={control} render={({ field }) => (
                                <FormControlLabel control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Active" />
                            )} />
                        </Grid>
                        {calculationType === 'percent_of_component' && (
                            <Grid size={12}>
                                <Alert severity="info" variant="outlined">
                                    Usually leave "Prorate on LOP" off here — proration already flows through the base component, so enabling it too would apply it twice.
                                </Alert>
                            </Grid>
                        )}
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button color="inherit" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving…' : mode === 'add' ? 'Create Component' : 'Save Changes'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}

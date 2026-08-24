import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Box, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Grid2 as Grid, FormControl, InputLabel, Select, MenuItem } from '@mui/material';

const structureSchema = z.object({
    name: z.string().min(1, 'Name is required').max(150),
    description: z.string().optional(),
    grade_id: z.string().optional(),
});
export type StructureFormValues = z.infer<typeof structureSchema>;
export interface GradeSelectOption { id: number; name: string }

const emptyDefaults: StructureFormValues = { name: '', description: '', grade_id: '' };

interface PayrollStructureFormDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (values: StructureFormValues) => Promise<void>;
    defaultValues: Partial<StructureFormValues>;
    mode: 'add' | 'edit';
    grades?: GradeSelectOption[];
}

export default function PayrollStructureFormDialog({ open, onClose, onSubmit, defaultValues, mode, grades = [] }: PayrollStructureFormDialogProps) {
    const { control, handleSubmit, reset, formState: { errors, isSubmitting } } =
        useForm<StructureFormValues>({ resolver: zodResolver(structureSchema), defaultValues: emptyDefaults });

    useEffect(() => {
        if (open) reset({ ...emptyDefaults, ...defaultValues });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, defaultValues]);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>{mode === 'add' ? 'New Salary Structure' : 'Edit Salary Structure'}</DialogTitle>
            <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
                <DialogContent>
                    <Grid container spacing={2}>
                        <Grid size={12}>
                            <Controller name="name" control={control} render={({ field }) => (
                                <TextField {...field} label="Structure Name" placeholder="e.g. Grade A - Engineering" fullWidth required autoFocus error={!!errors.name} helperText={errors.name?.message} />
                            )} />
                        </Grid>
                        <Grid size={12}>
                            <Controller name="description" control={control} render={({ field }) => (
                                <TextField {...field} label="Description" fullWidth multiline minRows={2} />
                            )} />
                        </Grid>
                        {grades.length > 0 && (
                            <Grid size={12}>
                                <Controller name="grade_id" control={control} render={({ field }) => (
                                    <FormControl fullWidth>
                                        <InputLabel>Salary Grade (optional)</InputLabel>
                                        <Select {...field} label="Salary Grade (optional)">
                                            <MenuItem value="">None</MenuItem>
                                            {grades.map((g) => <MenuItem key={g.id} value={String(g.id)}>{g.name}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                )} />
                            </Grid>
                        )}
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button color="inherit" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving…' : mode === 'add' ? 'Create Structure' : 'Save Changes'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}

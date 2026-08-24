import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Box, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, FormControl, InputLabel, Select, MenuItem, Grid2 as Grid, Typography } from '@mui/material';

export interface StructureOption { id: number; name: string; grade_id?: number | null }
export interface GradeOption { id: number; name: string; default_structure_id?: number | null }

const assignmentSchema = z.object({
    grade_id: z.string().optional(),
    structure_id: z.string().min(1, 'Structure is required'),
    ctc_annual: z.string().min(1, 'Annual CTC is required'),
    effective_from: z.string().min(1, 'Effective date is required'),
});
export type AssignmentFormValues = z.infer<typeof assignmentSchema>;

const emptyDefaults: AssignmentFormValues = {
    grade_id: '', structure_id: '', ctc_annual: '', effective_from: new Date().toISOString().split('T')[0],
};

interface SalaryAssignmentFormDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (values: AssignmentFormValues) => Promise<void>;
    employeeName: string;
    structures: StructureOption[];
    grades?: GradeOption[];
    defaultValues?: Partial<AssignmentFormValues>;
}

export default function SalaryAssignmentFormDialog({ open, onClose, onSubmit, employeeName, structures, grades = [], defaultValues }: SalaryAssignmentFormDialogProps) {
    const { control, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } =
        useForm<AssignmentFormValues>({ resolver: zodResolver(assignmentSchema), defaultValues: emptyDefaults });

    useEffect(() => {
        if (open) reset({ ...emptyDefaults, ...defaultValues });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, defaultValues]);

    // Picking a grade pre-selects its default structure (if any) as a
    // convenience — the structure field stays directly editable/selectable
    // afterward, so direct structure-only assignment (no grade picked) keeps
    // working exactly as before.
    const handleGradeChange = (gradeId: string) => {
        setValue('grade_id', gradeId);
        const grade = grades.find((g) => String(g.id) === gradeId);
        if (grade?.default_structure_id) setValue('structure_id', String(grade.default_structure_id));
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>New Salary Assignment</DialogTitle>
            <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        For <strong>{employeeName}</strong>. This closes any currently open assignment and starts a new one from the effective date — a full history is kept.
                    </Typography>
                    <Grid container spacing={2}>
                        {grades.length > 0 && (
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <Controller name="grade_id" control={control} render={({ field }) => (
                                    <FormControl fullWidth>
                                        <InputLabel>Salary Grade (optional)</InputLabel>
                                        <Select {...field} label="Salary Grade (optional)" onChange={(e) => handleGradeChange(e.target.value)}>
                                            <MenuItem value="">None</MenuItem>
                                            {grades.map((g) => <MenuItem key={g.id} value={String(g.id)}>{g.name}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                )} />
                            </Grid>
                        )}
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="structure_id" control={control} render={({ field }) => (
                                <FormControl fullWidth required error={!!errors.structure_id}>
                                    <InputLabel>Salary Structure</InputLabel>
                                    <Select {...field} label="Salary Structure">
                                        {structures.map((s) => <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="ctc_annual" control={control} render={({ field }) => (
                                <TextField {...field} type="number" label="Annual CTC" fullWidth required error={!!errors.ctc_annual} helperText={errors.ctc_annual?.message} />
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="effective_from" control={control} render={({ field }) => (
                                <TextField {...field} type="date" label="Effective From" fullWidth required error={!!errors.effective_from} helperText={errors.effective_from?.message} slotProps={{ inputLabel: { shrink: true } }} />
                            )} />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button color="inherit" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving…' : 'Create Assignment'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}

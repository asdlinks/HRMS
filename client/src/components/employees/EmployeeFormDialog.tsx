import { useEffect, useState, type ChangeEvent } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    Box, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
    FormControl, InputLabel, Select, MenuItem, Grid2 as Grid, Typography, Divider, Alert,
} from '@mui/material';

export interface EmployeeOption { id: number; name: string; designation?: string; role: string }
interface Department { id: number; name: string }
interface Location { id: number; name: string }
interface LookupOption { id: number; name: string }
export interface EmployeePiiValues { aadhaar_number?: string | null; pan_number?: string | null }
export interface EmployeeBankingValues {
    bank_account_holder_name?: string | null;
    bank_name?: string | null;
    bank_branch?: string | null;
    bank_account_number?: string | null;
    bank_ifsc_code?: string | null;
    bank_upi_id?: string | null;
}

// A single static schema (rather than one built per `mode`) keeps the
// inferred form-values type stable for useForm/zodResolver — the "password
// required only when adding" rule is enforced in the submit handler instead,
// where `mode` is plain runtime data rather than something the type system
// needs to encode.
const employeeSchema = z.object({
    name: z.string().min(1, 'Full name is required'),
    email: z.string().email('Enter a valid email address'),
    date_of_birth: z.string().min(1, 'Date of birth is required'),
    location_id: z.string().optional(),
    department_id: z.string().min(1, 'Department is required'),
    designation_id: z.string().min(1, 'Designation is required'),
    employment_type_id: z.string().optional(),
    employee_id: z.string().min(1, 'Employee ID is required'),
    probation_period: z.string().regex(/^\d*$/, 'Enter a whole number of months').refine((v) => !v || Number(v) <= 24, 'Must be 24 months or fewer'),
    joining_date: z.string().min(1, 'Joining date is required'),
    role: z.enum(['employee', 'manager', 'hr']),
    manager_id: z.string().optional(),
    password: z.string().optional(),
});
export type EmployeeFormValues = z.infer<typeof employeeSchema>;

// Add-mode only: Identity/Banking are collected locally (outside the RHF/zod
// form) and attached to the submitted payload so a single "Save Record" click
// can create the user, then chain the PII/banking endpoint calls with its new
// id (see EmployeesPage.handleAddEmployee). Edit mode never populates these —
// it keeps the independent section-save UX further down this file.
export type EmployeeFormSubmitValues = EmployeeFormValues & {
    pii?: EmployeePiiValues;
    banking?: EmployeeBankingValues;
};

const AADHAAR_PATTERN = /^\d{12}$/;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

interface EmployeeFormDialogProps {
    mode: 'add' | 'edit';
    open: boolean;
    onClose: () => void;
    onSubmit: (values: EmployeeFormSubmitValues) => Promise<void>;
    departments: Department[];
    locations: Location[];
    designations: LookupOption[];
    employmentTypes: LookupOption[];
    managerOptions: EmployeeOption[];
    defaultValues: Partial<EmployeeFormValues>;
    excludeManagerId?: number;
    // Identity Information (Aadhaar/PAN). In edit mode, rendered for a caller
    // holding users.pii.manage and saved through its own endpoint/button,
    // independent of the main employee-record submit above. In add mode,
    // shown as optional fields on the main form itself (no employee id exists
    // yet to save against) and attached to the submit payload's `pii` key.
    canManagePii?: boolean;
    piiDefaultValues?: EmployeePiiValues;
    onSavePii?: (values: EmployeePiiValues) => Promise<void>;
    // Banking Information. Same split as Identity above: independent
    // section-save in edit mode (payroll.assign), inline optional fields in
    // add mode. Entry is deliberately partial — completeness is enforced only
    // when payroll is processed, not here.
    canManageBanking?: boolean;
    bankingDefaultValues?: EmployeeBankingValues;
    onSaveBanking?: (values: EmployeeBankingValues) => Promise<void>;
}

const emptyDefaults: EmployeeFormValues = {
    name: '', email: '', date_of_birth: '', location_id: '', department_id: '', designation_id: '', employee_id: '',
    employment_type_id: '',
    probation_period: '0', joining_date: new Date().toISOString().split('T')[0], role: 'employee', manager_id: '', password: '',
};

function IdentitySection({ piiDefaultValues, onSavePii }: { piiDefaultValues?: EmployeePiiValues; onSavePii: (values: EmployeePiiValues) => Promise<void> }) {
    const [aadhaar, setAadhaar] = useState(piiDefaultValues?.aadhaar_number || '');
    const [pan, setPan] = useState(piiDefaultValues?.pan_number || '');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setAadhaar(piiDefaultValues?.aadhaar_number || '');
        setPan(piiDefaultValues?.pan_number || '');
        setSaved(false);
        setError(null);
    }, [piiDefaultValues]);

    const aadhaarError = aadhaar && !AADHAAR_PATTERN.test(aadhaar) ? 'Aadhaar must be 12 digits' : '';
    const panError = pan && !PAN_PATTERN.test(pan.toUpperCase()) ? 'Enter a valid PAN (e.g. ABCDE1234F)' : '';

    const save = async () => {
        if (aadhaarError || panError) return;
        setSaving(true);
        setError(null);
        try {
            await onSavePii({ aadhaar_number: aadhaar || null, pan_number: pan ? pan.toUpperCase() : null });
            setSaved(true);
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            setError(message || 'Failed to save identity information');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Grid container spacing={2}>
            <Grid size={12}>
                <Typography variant="subtitle2" sx={{ mt: 1 }}>Identity Information</Typography>
                <Typography variant="caption" color="text.secondary">
                    Restricted to Organization Administrators, HR Administrators and Payroll Administrators.
                </Typography>
            </Grid>
            {error && <Grid size={12}><Alert severity="error" onClose={() => setError(null)}>{error}</Alert></Grid>}
            {saved && !error && <Grid size={12}><Alert severity="success" onClose={() => setSaved(false)}>Identity information saved</Alert></Grid>}
            <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                    label="Aadhaar Number" fullWidth value={aadhaar}
                    error={!!aadhaarError} helperText={aadhaarError || 'Optional — 12 digits'}
                    onChange={(e) => { setAadhaar(e.target.value.trim()); setSaved(false); }}
                />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                    label="PAN Number" fullWidth value={pan}
                    error={!!panError} helperText={panError || 'Optional — e.g. ABCDE1234F'}
                    onChange={(e) => { setPan(e.target.value.trim().toUpperCase()); setSaved(false); }}
                />
            </Grid>
            <Grid size={12}>
                <Button variant="outlined" onClick={save} disabled={saving || !!aadhaarError || !!panError}>
                    {saving ? 'Saving…' : 'Save Identity Information'}
                </Button>
            </Grid>
        </Grid>
    );
}

function BankingSection({ bankingDefaultValues, onSaveBanking }: { bankingDefaultValues?: EmployeeBankingValues; onSaveBanking: (values: EmployeeBankingValues) => Promise<void> }) {
    const [values, setValues] = useState<EmployeeBankingValues>(bankingDefaultValues || {});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setValues(bankingDefaultValues || {});
        setSaved(false);
        setError(null);
    }, [bankingDefaultValues]);

    const set = (key: keyof EmployeeBankingValues) => (e: ChangeEvent<HTMLInputElement>) => {
        setValues((v) => ({ ...v, [key]: e.target.value }));
        setSaved(false);
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            await onSaveBanking(values);
            setSaved(true);
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            setError(message || 'Failed to save banking information');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Grid container spacing={2}>
            <Grid size={12}>
                <Typography variant="subtitle2" sx={{ mt: 1 }}>Banking Information</Typography>
                <Typography variant="caption" color="text.secondary">
                    Required before payroll can be processed for this employee — UPI ID is optional.
                </Typography>
            </Grid>
            {error && <Grid size={12}><Alert severity="error" onClose={() => setError(null)}>{error}</Alert></Grid>}
            {saved && !error && <Grid size={12}><Alert severity="success" onClose={() => setSaved(false)}>Banking information saved</Alert></Grid>}
            <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Account Holder Name" fullWidth value={values.bank_account_holder_name || ''} onChange={set('bank_account_holder_name')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Bank Name" fullWidth value={values.bank_name || ''} onChange={set('bank_name')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Branch" fullWidth value={values.bank_branch || ''} onChange={set('bank_branch')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Account Number" fullWidth value={values.bank_account_number || ''} onChange={set('bank_account_number')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="IFSC Code" fullWidth value={values.bank_ifsc_code || ''} onChange={set('bank_ifsc_code')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="UPI ID (optional)" fullWidth value={values.bank_upi_id || ''} onChange={set('bank_upi_id')} />
            </Grid>
            <Grid size={12}>
                <Button variant="outlined" onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Banking Information'}
                </Button>
            </Grid>
        </Grid>
    );
}

// Add-mode variant: plain fields with no independent save button, since there
// is no employee id yet to save against — values are collected by the parent
// and attached to the single "Save Record" submit instead.
function AddModeIdentityAndBanking({
    pii, setPii, banking, setBanking, showIdentity, showBanking,
}: {
    pii: EmployeePiiValues; setPii: (v: EmployeePiiValues) => void;
    banking: EmployeeBankingValues; setBanking: (v: EmployeeBankingValues) => void;
    showIdentity: boolean; showBanking: boolean;
}) {
    const aadhaar = pii.aadhaar_number || '';
    const pan = pii.pan_number || '';
    const aadhaarError = aadhaar && !AADHAAR_PATTERN.test(aadhaar) ? 'Aadhaar must be 12 digits' : '';
    const panError = pan && !PAN_PATTERN.test(pan.toUpperCase()) ? 'Enter a valid PAN (e.g. ABCDE1234F)' : '';

    const setBankField = (key: keyof EmployeeBankingValues) => (e: ChangeEvent<HTMLInputElement>) => {
        setBanking({ ...banking, [key]: e.target.value });
    };

    return (
        <>
            {showIdentity && (
                <Grid container spacing={2}>
                    <Grid size={12}>
                        <Typography variant="subtitle2" sx={{ mt: 1 }}>Identity Information (optional)</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                            label="Aadhaar Number" fullWidth value={aadhaar}
                            error={!!aadhaarError} helperText={aadhaarError || 'Optional — 12 digits'}
                            onChange={(e) => setPii({ ...pii, aadhaar_number: e.target.value.trim() })}
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                            label="PAN Number" fullWidth value={pan}
                            error={!!panError} helperText={panError || 'Optional — e.g. ABCDE1234F'}
                            onChange={(e) => setPii({ ...pii, pan_number: e.target.value.trim().toUpperCase() })}
                        />
                    </Grid>
                </Grid>
            )}
            {showIdentity && showBanking && <Divider sx={{ my: 2 }} />}
            {showBanking && (
                <Grid container spacing={2}>
                    <Grid size={12}>
                        <Typography variant="subtitle2" sx={{ mt: 1 }}>Banking Information (optional)</Typography>
                        <Typography variant="caption" color="text.secondary">
                            Required before payroll can be processed for this employee — can also be added later.
                        </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField label="Account Holder Name" fullWidth value={banking.bank_account_holder_name || ''} onChange={setBankField('bank_account_holder_name')} />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField label="Bank Name" fullWidth value={banking.bank_name || ''} onChange={setBankField('bank_name')} />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField label="Branch" fullWidth value={banking.bank_branch || ''} onChange={setBankField('bank_branch')} />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField label="Account Number" fullWidth value={banking.bank_account_number || ''} onChange={setBankField('bank_account_number')} />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField label="IFSC Code" fullWidth value={banking.bank_ifsc_code || ''} onChange={setBankField('bank_ifsc_code')} />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField label="UPI ID (optional)" fullWidth value={banking.bank_upi_id || ''} onChange={setBankField('bank_upi_id')} />
                    </Grid>
                </Grid>
            )}
        </>
    );
}

export default function EmployeeFormDialog({
    mode, open, onClose, onSubmit, departments, locations, designations, employmentTypes,
    managerOptions, defaultValues, excludeManagerId, canManagePii, piiDefaultValues, onSavePii,
    canManageBanking, bankingDefaultValues, onSaveBanking,
}: EmployeeFormDialogProps) {
    const {
        control, handleSubmit, watch, reset, setError,
        formState: { errors, isSubmitting },
    } = useForm<EmployeeFormValues>({ resolver: zodResolver(employeeSchema), defaultValues: emptyDefaults });

    useEffect(() => {
        if (open) reset({ ...emptyDefaults, ...defaultValues });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, defaultValues]);

    const role = watch('role');
    const canAssignManager = role === 'employee' || role === 'hr';
    const eligibleManagers = managerOptions.filter((m) => m.id !== excludeManagerId);

    // Add-mode-only Identity/Banking state — see AddModeIdentityAndBanking above.
    const [addPii, setAddPii] = useState<EmployeePiiValues>({});
    const [addBanking, setAddBanking] = useState<EmployeeBankingValues>({});
    useEffect(() => {
        if (open && mode === 'add') { setAddPii({}); setAddBanking({}); }
    }, [open, mode]);
    const addAadhaarError = addPii.aadhaar_number && !AADHAAR_PATTERN.test(addPii.aadhaar_number) ? 'Aadhaar must be 12 digits' : '';
    const addPanError = addPii.pan_number && !PAN_PATTERN.test(addPii.pan_number.toUpperCase()) ? 'Enter a valid PAN (e.g. ABCDE1234F)' : '';

    const submit = async (values: EmployeeFormValues) => {
        if (mode === 'add' && (!values.password || values.password.length < 6)) {
            setError('password', { message: 'Password must be at least 6 characters' });
            return;
        }
        if (mode === 'add' && (addAadhaarError || addPanError)) return;
        const hasPii = mode === 'add' && (addPii.aadhaar_number || addPii.pan_number);
        const hasBanking = mode === 'add' && Object.values(addBanking).some((v) => v);
        await onSubmit({
            ...values,
            ...(hasPii ? { pii: addPii } : {}),
            ...(hasBanking ? { banking: addBanking } : {}),
        });
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{mode === 'add' ? 'Register New Employee' : 'Edit Employee Details'}</DialogTitle>
            <Box component="form" onSubmit={handleSubmit(submit)} noValidate>
                <DialogContent>
                    <Grid container spacing={2}>
                        <Grid size={12}>
                            <Typography variant="subtitle2">Personal Information</Typography>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="name" control={control} render={({ field }) => (
                                <TextField {...field} label="Full Name" fullWidth required error={!!errors.name} helperText={errors.name?.message} />
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="email" control={control} render={({ field }) => (
                                <TextField {...field} label="Email Address" type="email" fullWidth required error={!!errors.email} helperText={errors.email?.message} />
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="date_of_birth" control={control} render={({ field }) => (
                                <TextField {...field} label="Date of Birth" type="date" fullWidth required error={!!errors.date_of_birth} helperText={errors.date_of_birth?.message} slotProps={{ inputLabel: { shrink: true } }} />
                            )} />
                        </Grid>

                        <Grid size={12}><Divider sx={{ my: 1 }} /></Grid>
                        <Grid size={12}>
                            <Typography variant="subtitle2">Employment Information</Typography>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="location_id" control={control} render={({ field }) => (
                                <FormControl fullWidth>
                                    <InputLabel>Branch</InputLabel>
                                    <Select {...field} label="Branch">
                                        <MenuItem value="">No Branch Assigned</MenuItem>
                                        {locations.map((l) => <MenuItem key={l.id} value={String(l.id)}>{l.name}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="department_id" control={control} render={({ field }) => (
                                <FormControl fullWidth required error={!!errors.department_id}>
                                    <InputLabel>Department</InputLabel>
                                    <Select {...field} label="Department">
                                        <MenuItem value="">Select Department</MenuItem>
                                        {departments.map((d) => <MenuItem key={d.id} value={String(d.id)}>{d.name}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="designation_id" control={control} render={({ field }) => (
                                <FormControl fullWidth required error={!!errors.designation_id}>
                                    <InputLabel>Designation</InputLabel>
                                    <Select {...field} label="Designation">
                                        <MenuItem value="">Select Designation</MenuItem>
                                        {designations.map((d) => <MenuItem key={d.id} value={String(d.id)}>{d.name}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="employee_id" control={control} render={({ field }) => (
                                <TextField {...field} label="Employee ID" fullWidth required error={!!errors.employee_id} helperText={errors.employee_id?.message} />
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="employment_type_id" control={control} render={({ field }) => (
                                <FormControl fullWidth>
                                    <InputLabel>Employment Type</InputLabel>
                                    <Select {...field} label="Employment Type">
                                        <MenuItem value="">Not Set</MenuItem>
                                        {employmentTypes.map((e) => <MenuItem key={e.id} value={String(e.id)}>{e.name}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="probation_period" control={control} render={({ field }) => (
                                <TextField {...field} label="Probation (Months)" type="number" fullWidth error={!!errors.probation_period} helperText={errors.probation_period?.message} />
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="joining_date" control={control} render={({ field }) => (
                                <TextField {...field} label="Joining Date" type="date" fullWidth required error={!!errors.joining_date} helperText={errors.joining_date?.message} slotProps={{ inputLabel: { shrink: true } }} />
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Controller name="role" control={control} render={({ field }) => (
                                <FormControl fullWidth required>
                                    <InputLabel>Role</InputLabel>
                                    <Select {...field} label="Role">
                                        <MenuItem value="employee">Employee</MenuItem>
                                        <MenuItem value="manager">Manager</MenuItem>
                                        <MenuItem value="hr">HR</MenuItem>
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>
                        {canAssignManager && (
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <Controller name="manager_id" control={control} render={({ field }) => (
                                    <FormControl fullWidth>
                                        <InputLabel>Assign Manager</InputLabel>
                                        <Select {...field} label="Assign Manager">
                                            <MenuItem value="">No Manager (Direct Report)</MenuItem>
                                            {eligibleManagers.map((m) => (
                                                <MenuItem key={m.id} value={String(m.id)}>{m.name} {m.designation ? `(${m.designation})` : `(${m.role})`}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                )} />
                            </Grid>
                        )}
                        {mode === 'add' && (
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <Controller name="password" control={control} render={({ field }) => (
                                    <TextField {...field} label="Initial Password" fullWidth required error={!!errors.password} helperText={errors.password?.message} />
                                )} />
                            </Grid>
                        )}
                    </Grid>

                    {mode === 'add' && (canManagePii || canManageBanking) && (
                        <>
                            <Divider sx={{ my: 2 }} />
                            <AddModeIdentityAndBanking
                                pii={addPii} setPii={setAddPii}
                                banking={addBanking} setBanking={setAddBanking}
                                showIdentity={!!canManagePii} showBanking={!!canManageBanking}
                            />
                        </>
                    )}

                    {mode === 'edit' && canManagePii && onSavePii && (
                        <>
                            <Divider sx={{ my: 2 }} />
                            <IdentitySection piiDefaultValues={piiDefaultValues} onSavePii={onSavePii} />
                        </>
                    )}

                    {mode === 'edit' && canManageBanking && onSaveBanking && (
                        <>
                            <Divider sx={{ my: 2 }} />
                            <BankingSection bankingDefaultValues={bankingDefaultValues} onSaveBanking={onSaveBanking} />
                        </>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button color="inherit" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={isSubmitting || (mode === 'add' && (!!addAadhaarError || !!addPanError))}>
                        {isSubmitting ? 'Saving…' : mode === 'add' ? 'Save Record' : 'Update Record'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}

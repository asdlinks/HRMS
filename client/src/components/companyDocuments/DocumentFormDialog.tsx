import { useEffect, useState, type FormEvent } from 'react';
import {
    Box, Dialog, DialogTitle, DialogContent, DialogActions, Stack, TextField, MenuItem, Button,
    FormControlLabel, Switch, Autocomplete, Alert,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
    getCompanyDocument, createCompanyDocument, updateCompanyDocument, getCompanyDocumentRoleOptions,
    getDepartments, getLocations, DOCUMENT_CATEGORIES, type CompanyDocument, type CompanyDocumentMetadata,
} from '../../api';
import { getErrorMessage } from '../../types';

interface Option { id: number; name: string }
interface ShareRow { share_type: 'all' | 'role' | 'department' | 'branch'; role_id: number | null; department_id: number | null; location_id: number | null }

const emptyForm = {
    title: '', category: '', description: '', effective_date: '', expiry_date: '',
    allEmployees: true, roleIds: [] as number[], departmentIds: [] as number[], locationIds: [] as number[],
};

export default function DocumentFormDialog({
    open, editingId, onClose, onSaved,
}: {
    open: boolean;
    editingId: number | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const { enqueueSnackbar } = useSnackbar();
    const [form, setForm] = useState(emptyForm);
    const [file, setFile] = useState<File | null>(null);
    const [roleOptions, setRoleOptions] = useState<Option[]>([]);
    const [departmentOptions, setDepartmentOptions] = useState<Option[]>([]);
    const [locationOptions, setLocationOptions] = useState<Option[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const isEditing = editingId != null;

    useEffect(() => {
        if (!open) return;
        setError('');
        setFile(null);
        setForm(emptyForm);
        loadOptions();
        if (isEditing) loadDocument(editingId as number);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, editingId]);

    const loadOptions = async () => {
        try {
            const [rolesResp, deptResp, locResp] = await Promise.all([getCompanyDocumentRoleOptions(), getDepartments(), getLocations()]);
            setRoleOptions(rolesResp.data);
            setDepartmentOptions(deptResp.data);
            setLocationOptions(locResp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load visibility options'), { variant: 'error' });
        }
    };

    const loadDocument = async (id: number) => {
        setLoading(true);
        try {
            const resp = await getCompanyDocument(id);
            const doc: CompanyDocument & { shares?: ShareRow[] } = resp.data;
            const shares = doc.shares || [];
            const allEmployees = shares.some((s) => s.share_type === 'all');
            setForm({
                title: doc.title,
                category: doc.category,
                description: doc.description || '',
                effective_date: doc.effective_date.slice(0, 10),
                expiry_date: doc.expiry_date ? doc.expiry_date.slice(0, 10) : '',
                allEmployees,
                roleIds: shares.filter((s) => s.share_type === 'role').map((s) => s.role_id as number),
                departmentIds: shares.filter((s) => s.share_type === 'department').map((s) => s.department_id as number),
                locationIds: shares.filter((s) => s.share_type === 'branch').map((s) => s.location_id as number),
            });
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load document'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const buildMetadata = (): CompanyDocumentMetadata => ({
        title: form.title,
        category: form.category,
        description: form.description || null,
        effective_date: form.effective_date,
        expiry_date: form.expiry_date || null,
        visibility: form.allEmployees
            ? { allEmployees: true }
            : { allEmployees: false, roleIds: form.roleIds, departmentIds: form.departmentIds, locationIds: form.locationIds },
    });

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        if (!isEditing && !file) {
            setError('Please select a file to upload');
            return;
        }
        setSaving(true);
        try {
            if (isEditing) {
                await updateCompanyDocument(editingId as number, buildMetadata());
                enqueueSnackbar('Document updated', { variant: 'success' });
            } else {
                await createCompanyDocument(buildMetadata(), file as File);
                enqueueSnackbar('Document published', { variant: 'success' });
            }
            onSaved();
        } catch (err) {
            setError(getErrorMessage(err, 'Failed to save document'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{isEditing ? 'Edit Document' : 'Upload Document'}</DialogTitle>
            <Box component="form" onSubmit={handleSubmit}>
                <DialogContent>
                    <Stack spacing={2}>
                        {error && <Alert severity="error">{error}</Alert>}
                        <TextField label="Title" required fullWidth disabled={loading} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                        <TextField
                            select label="Category" required fullWidth disabled={loading} value={form.category}
                            onChange={(e) => setForm({ ...form, category: e.target.value })}
                        >
                            {DOCUMENT_CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                        </TextField>
                        <TextField
                            label="Description" fullWidth multiline minRows={2} disabled={loading}
                            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                        />
                        <Stack direction="row" spacing={2}>
                            <TextField
                                label="Effective Date" type="date" required fullWidth disabled={loading}
                                InputLabelProps={{ shrink: true }} value={form.effective_date}
                                onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
                            />
                            <TextField
                                label="Expiry Date (optional)" type="date" fullWidth disabled={loading}
                                InputLabelProps={{ shrink: true }} value={form.expiry_date}
                                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                            />
                        </Stack>

                        {!isEditing && (
                            <Button component="label" variant="outlined" fullWidth>
                                {file ? file.name : 'Choose file to upload'}
                                <input
                                    type="file" hidden
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
                                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                                />
                            </Button>
                        )}

                        <FormControlLabel
                            control={<Switch checked={form.allEmployees} onChange={(e) => setForm({ ...form, allEmployees: e.target.checked })} />}
                            label="Share with All Employees"
                        />

                        {!form.allEmployees && (
                            <Stack spacing={2}>
                                <Autocomplete
                                    multiple options={roleOptions} getOptionLabel={(o) => o.name}
                                    value={roleOptions.filter((o) => form.roleIds.includes(o.id))}
                                    onChange={(_e, value) => setForm({ ...form, roleIds: value.map((v) => v.id) })}
                                    renderInput={(params) => <TextField {...params} label="Selected Roles" placeholder="Add role" />}
                                />
                                <Autocomplete
                                    multiple options={departmentOptions} getOptionLabel={(o) => o.name}
                                    value={departmentOptions.filter((o) => form.departmentIds.includes(o.id))}
                                    onChange={(_e, value) => setForm({ ...form, departmentIds: value.map((v) => v.id) })}
                                    renderInput={(params) => <TextField {...params} label="Selected Departments" placeholder="Add department" />}
                                />
                                <Autocomplete
                                    multiple options={locationOptions} getOptionLabel={(o) => o.name}
                                    value={locationOptions.filter((o) => form.locationIds.includes(o.id))}
                                    onChange={(_e, value) => setForm({ ...form, locationIds: value.map((v) => v.id) })}
                                    renderInput={(params) => <TextField {...params} label="Selected Branches" placeholder="Add branch" />}
                                />
                            </Stack>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button color="inherit" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={saving || loading}>
                        {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Publish'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}

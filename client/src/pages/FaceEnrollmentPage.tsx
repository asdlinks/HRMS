import { useEffect, useState } from 'react';
import { Box, Button, IconButton, Stack, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Typography, List, ListItem, ListItemText, TextField } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { Camera, ScanFace, Trash2 } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getUsers, getFaceEnrollments, enrollFace, deleteFaceEnrollment } from '../api';
import { PageHeader, DataTable, ConfirmDialog, PageSpinner } from '../components/ui';
import FaceCaptureDialog, { FACE_MODEL_VERSION } from '../components/attendanceAdmin/FaceCaptureDialog';
import { getErrorMessage } from '../types';

interface EmployeeUser {
    id: number; name: string; designation?: string | null; department_name?: string | null; has_face_enrollment: boolean;
}
interface FaceEnrollment { id: number; model_version: string; is_active: boolean; created_at: string; updated_at?: string }

export default function FaceEnrollmentPage() {
    const { enqueueSnackbar } = useSnackbar();
    const [employees, setEmployees] = useState<EmployeeUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [managing, setManaging] = useState<EmployeeUser | null>(null);
    const [enrollments, setEnrollments] = useState<FaceEnrollment[]>([]);
    const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);
    const [captureOpen, setCaptureOpen] = useState(false);
    const [captureMode, setCaptureMode] = useState<'register' | 'update'>('register');
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [search, setSearch] = useState('');

    useEffect(() => { fetchEmployees(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchEmployees = async () => {
        try {
            const resp = await getUsers('all');
            setEmployees(resp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load employees'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const openManage = async (emp: EmployeeUser) => {
        setManaging(emp);
        setEnrollmentsLoading(true);
        try {
            const resp = await getFaceEnrollments(emp.id);
            setEnrollments(resp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load enrollment status'), { variant: 'error' });
        } finally {
            setEnrollmentsLoading(false);
        }
    };

    const activeEnrollments = enrollments.filter((e) => e.is_active);

    const startCapture = (mode: 'register' | 'update') => { setCaptureMode(mode); setCaptureOpen(true); };

    const handleCapture = async (embedding: number[]) => {
        if (!managing) return;
        try {
            await enrollFace({ userId: managing.id, embedding, modelVersion: FACE_MODEL_VERSION });
            if (captureMode === 'update') {
                await Promise.all(activeEnrollments.map((e) => deleteFaceEnrollment(e.id)));
            }
            enqueueSnackbar(captureMode === 'update' ? 'Face updated' : 'Face registered', { variant: 'success' });
            setCaptureOpen(false);
            await openManage(managing);
            fetchEmployees();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to save face enrollment'), { variant: 'error' });
            throw err;
        }
    };

    const confirmDeleteAll = async () => {
        if (!managing) return;
        try {
            await Promise.all(activeEnrollments.map((e) => deleteFaceEnrollment(e.id)));
            enqueueSnackbar('Face enrollment removed', { variant: 'success' });
            await openManage(managing);
            fetchEmployees();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to delete enrollment'), { variant: 'error' });
        } finally {
            setDeletingId(null);
        }
    };

    const columns: GridColDef<EmployeeUser>[] = [
        { field: 'name', headerName: 'Employee', flex: 1, minWidth: 180 },
        { field: 'designation', headerName: 'Designation', width: 160, valueFormatter: (v: string | null) => v || '—' },
        { field: 'department_name', headerName: 'Department', width: 160, valueFormatter: (v: string | null) => v || '—' },
        {
            field: 'has_face_enrollment', headerName: 'Face Enrollment', width: 160,
            renderCell: (p) => (
                <Chip
                    icon={<ScanFace size={14} />} label={p.value ? 'Enrolled' : 'Not enrolled'} size="small"
                    color={p.value ? 'success' : 'default'} variant={p.value ? 'filled' : 'outlined'}
                />
            ),
        },
        {
            field: 'actions', headerName: '', width: 110, sortable: false, filterable: false,
            renderCell: (p) => <Button size="small" onClick={() => openManage(p.row)}>Manage</Button>,
        },
    ];

    if (loading) return <PageSpinner />;

    const filtered = search ? employees.filter((e) => e.name.toLowerCase().includes(search.toLowerCase())) : employees;

    return (
        <Box className="fade-in" sx={{ maxWidth: 1200, mx: 'auto' }}>
            <PageHeader
                title="Face Enrollment"
                subtitle="Register, update or remove an employee's Face Recognition profile used by office kiosks."
            />

            <TextField
                placeholder="Search employees…" size="small" value={search} onChange={(e) => setSearch(e.target.value)}
                sx={{ mb: 2, width: 320 }}
            />

            <DataTable rows={filtered} columns={columns} emptyTitle="No employees found" />

            <Dialog open={!!managing} onClose={() => setManaging(null)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>Face Enrollment — {managing?.name}</DialogTitle>
                <DialogContent>
                    {enrollmentsLoading ? <PageSpinner /> : (
                        <>
                            {activeEnrollments.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">No active face enrollment.</Typography>
                            ) : (
                                <List dense>
                                    {activeEnrollments.map((e) => (
                                        <ListItem key={e.id}>
                                            <ListItemText
                                                primary={`Enrolled ${new Date(e.created_at).toLocaleDateString()}`}
                                                secondary={e.model_version}
                                            />
                                        </ListItem>
                                    ))}
                                </List>
                            )}
                        </>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button color="inherit" onClick={() => setManaging(null)}>Close</Button>
                    {activeEnrollments.length > 0 && (
                        <>
                            <Button color="error" startIcon={<Trash2 size={16} />} onClick={() => setDeletingId(managing!.id)}>Delete</Button>
                            <Button variant="outlined" startIcon={<Camera size={16} />} onClick={() => startCapture('update')}>Update Face</Button>
                        </>
                    )}
                    {activeEnrollments.length === 0 && !enrollmentsLoading && (
                        <Button variant="contained" startIcon={<Camera size={16} />} onClick={() => startCapture('register')}>Register Face</Button>
                    )}
                </DialogActions>
            </Dialog>

            {managing && (
                <FaceCaptureDialog
                    open={captureOpen}
                    employeeName={managing.name}
                    onClose={() => setCaptureOpen(false)}
                    onCapture={handleCapture}
                />
            )}

            <ConfirmDialog
                open={!!deletingId}
                title="Remove face enrollment?"
                description={`${managing?.name} will no longer be able to check in via Face Recognition until re-enrolled.`}
                confirmLabel="Delete"
                destructive
                onConfirm={confirmDeleteAll}
                onCancel={() => setDeletingId(null)}
            />
        </Box>
    );
}

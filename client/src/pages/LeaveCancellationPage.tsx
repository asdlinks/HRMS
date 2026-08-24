import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { Box, Card, Typography, Stack, Alert, TextField, Button, FormControl, InputLabel, Select, MenuItem, Grid2 as Grid } from '@mui/material';
import { AlertTriangle, Send, Calendar, History } from 'lucide-react';
import { getLeaves, updateLeaveStatus } from '../api';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, EmptyState, StatusBadge, ConfirmDialog } from '../components/ui';
import { getErrorMessage, type AuthUser } from '../types';

interface Leave { id: number; user_id: number; type: string; status: string; start_date: string; end_date: string; cancellation_reason?: string | null }

function formatDate(d: string): string {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function LeaveCancellationPage() {
    const { user } = useAuth() as { user: AuthUser } & ReturnType<typeof useAuth>;
    const [allLeaves, setAllLeaves] = useState<Leave[]>([]);
    const [selectedLeaveId, setSelectedLeaveId] = useState('');
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'error' | 'success' | ''; text: string }>({ type: '', text: '' });
    const [confirmOpen, setConfirmOpen] = useState(false);

    useEffect(() => {
        fetchLeaves();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchLeaves = async () => {
        try {
            const resp = await getLeaves(undefined, user.id);
            setAllLeaves(resp.data.filter((l: Leave) => l.user_id === user.id));
        } catch (err) {
            console.error(err);
        }
    };

    const leaves = useMemo(
        () => allLeaves.filter((l) => (l.status === 'Approved' || l.status === 'Pending') && new Date(l.start_date) >= new Date()),
        [allLeaves],
    );
    const cancellationHistory = useMemo(
        () => allLeaves
            .filter((l) => l.status === 'Cancelled' || l.status === 'Cancellation Pending')
            .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()),
        [allLeaves],
    );

    const handleCancelRequest = (e: FormEvent) => {
        e.preventDefault();
        if (!selectedLeaveId) return;
        if (!reason.trim()) {
            setMessage({ type: 'error', text: 'Please provide a reason for cancellation.' });
            return;
        }
        setConfirmOpen(true);
    };

    const confirmCancelRequest = async () => {
        setConfirmOpen(false);
        setSubmitting(true);
        try {
            await updateLeaveStatus(selectedLeaveId, { status: 'Cancelled', cancellation_reason: reason });
            setMessage({ type: 'success', text: 'Leave cancelled successfully!' });
            setSelectedLeaveId('');
            setReason('');
            fetchLeaves();
        } catch (err) {
            setMessage({ type: 'error', text: getErrorMessage(err, 'Failed to send cancellation request.') });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Box className="fade-in" sx={{ maxWidth: 1100, mx: 'auto' }}>
            <PageHeader title="Leave Cancellation" subtitle="Request to cancel your upcoming leave" />

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 7 }}>
                    <Card sx={{ p: { xs: 2.5, sm: 4 } }}>
                        <Alert icon={<AlertTriangle size={18} />} severity="warning" sx={{ mb: 3 }}>
                            You can only cancel leaves that haven't started yet.
                        </Alert>

                        <Box component="form" onSubmit={handleCancelRequest} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                            <FormControl fullWidth required>
                                <InputLabel>Select Leave to Cancel</InputLabel>
                                <Select label="Select Leave to Cancel" value={selectedLeaveId} onChange={(e) => setSelectedLeaveId(e.target.value)}>
                                    {leaves.map((l) => (
                                        <MenuItem key={l.id} value={l.id}>{l.type.toUpperCase()} ({formatDate(l.start_date)} to {formatDate(l.end_date)}) — {l.status}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <TextField
                                label="Reason for Cancellation"
                                placeholder="Why do you want to cancel this leave?"
                                multiline
                                rows={4}
                                fullWidth
                                required
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                            />

                            {message.text && <Alert severity={message.type || 'info'}>{message.text}</Alert>}

                            <Button type="submit" variant="contained" color="error" size="large" disabled={submitting || !selectedLeaveId} endIcon={<Send size={18} />}>
                                {submitting ? 'Cancelling…' : 'Cancel Leave'}
                            </Button>
                        </Box>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 5 }}>
                    <Card sx={{ p: { xs: 2.5, sm: 4 } }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>Upcoming Leaves</Typography>
                        {leaves.length === 0 ? (
                            <EmptyState title="No upcoming leaves found" />
                        ) : (
                            <Stack spacing={1.5}>
                                {leaves.map((l) => (
                                    <Stack key={l.id} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                                        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: 'background.paper', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.main' }}>
                                            <Calendar size={20} />
                                        </Box>
                                        <Box sx={{ flex: 1 }}>
                                            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{l.type.toUpperCase()}</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{formatDate(l.start_date)} – {formatDate(l.end_date)}</Typography>
                                        </Box>
                                        <StatusBadge status={l.status} />
                                    </Stack>
                                ))}
                            </Stack>
                        )}
                    </Card>

                    <Card sx={{ p: { xs: 2.5, sm: 4 }, mt: 3 }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                            <History size={18} />
                            <Typography variant="h6">Cancellation History</Typography>
                        </Stack>
                        {cancellationHistory.length === 0 ? (
                            <EmptyState title="No cancellations yet" description="Leaves you've cancelled will appear here for your records." />
                        ) : (
                            <Stack spacing={1.5}>
                                {cancellationHistory.slice(0, 5).map((l) => (
                                    <Stack key={l.id} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                                        <Box sx={{ flex: 1 }}>
                                            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{l.type.toUpperCase()}</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{formatDate(l.start_date)} – {formatDate(l.end_date)}</Typography>
                                        </Box>
                                        <StatusBadge status={l.status} />
                                    </Stack>
                                ))}
                            </Stack>
                        )}
                    </Card>
                </Grid>
            </Grid>

            <ConfirmDialog
                open={confirmOpen}
                title="Cancel this leave request?"
                description="This will submit a cancellation with the reason you provided. This cannot be undone."
                confirmLabel="Cancel Leave"
                destructive
                onConfirm={confirmCancelRequest}
                onCancel={() => setConfirmOpen(false)}
            />
        </Box>
    );
}

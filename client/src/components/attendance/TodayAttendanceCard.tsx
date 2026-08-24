import { useEffect, useState, useCallback } from 'react';
import {
    Box, Card, Typography, Stack, Button, Alert, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, Divider, Chip, CircularProgress,
} from '@mui/material';
import { Home, Briefcase, MapPin, UserCheck, Camera, Coffee, PlayCircle, LogOut, Clock, MapPinned } from 'lucide-react';
import { useSnackbar } from 'notistack';
import {
    checkIn, getMyAttendancePolicy, getTodayAttendanceStatus, selectWorkMode,
    takeAttendanceBreak, resumeAttendanceFromBreak, checkOutAttendance,
} from '../../api';
import { getErrorMessage } from '../../types';
import { PageSpinner } from '../ui';
import { MethodBadge, WorkModeBadge } from './badges';
import { useWorkTimer } from './useWorkTimer';
import AttendanceTimeline from './AttendanceTimeline';
import { buildTimelineEvents } from './timelineEvents';

interface AttendanceRow {
    id: number;
    check_in_time: string;
    check_out_time: string | null;
    method: string;
    work_mode: string | null;
    client_name: string | null;
    notes: string | null;
    work_summary: string | null;
}
interface BreakRow { id: number; break_start: string; break_end: string | null }
interface TodayStatus {
    recorded: boolean;
    attendance?: AttendanceRow;
    breaks?: BreakRow[];
    onBreak?: boolean;
}

type WorkModeKind = 'WFH' | 'ClientVisit' | 'FieldWork';

const WORK_MODE_COPY: Record<WorkModeKind, { title: string; icon: typeof Home; needsClientName?: boolean }> = {
    WFH: { title: 'Work From Home', icon: Home },
    ClientVisit: { title: 'Client Visit', icon: Briefcase, needsClientName: true },
    FieldWork: { title: 'Field Work', icon: MapPin },
};

function todayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function captureLocation(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { timeout: 8000 },
        );
    });
}

// The employee-facing "what's happening with my attendance right now" card:
// surfaces exactly the check-in options this employee's policy allows (Face
// is always kiosk-only, never a web button), then once checked in, tracks
// break/resume/checkout and a live work timer for the rest of the day.
export default function TodayAttendanceCard() {
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [allowedMethods, setAllowedMethods] = useState<string[]>([]);
    const [status, setStatus] = useState<TodayStatus>({ recorded: false });
    const [busy, setBusy] = useState<string | null>(null);
    const [workModeDialog, setWorkModeDialog] = useState<WorkModeKind | null>(null);
    const [clientName, setClientName] = useState('');
    const [notes, setNotes] = useState('');
    const [shareLocation, setShareLocation] = useState(false);
    const [checkOutDialog, setCheckOutDialog] = useState(false);
    const [workSummary, setWorkSummary] = useState('');

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [policyResp, statusResp] = await Promise.all([getMyAttendancePolicy(), getTodayAttendanceStatus()]);
            setAllowedMethods(policyResp.data.allowedMethods || []);
            setStatus(statusResp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load attendance status'), { variant: 'error' });
        } finally {
            if (!silent) setLoading(false);
        }
    }, [enqueueSnackbar]);

    useEffect(() => { load(); }, [load]);

    const notifyCheckedIn = () => window.dispatchEvent(new Event('userCheckedIn'));

    const handleManualCheckIn = async () => {
        setBusy('manual');
        try {
            await checkIn({ date: todayDateStr() });
            notifyCheckedIn();
            enqueueSnackbar('Checked in for today', { variant: 'success' });
            await load(true);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to check in'), { variant: 'error' });
        } finally {
            setBusy(null);
        }
    };

    const openWorkModeDialog = (mode: WorkModeKind) => {
        setClientName(''); setNotes(''); setShareLocation(false);
        setWorkModeDialog(mode);
    };

    const submitWorkMode = async () => {
        if (!workModeDialog) return;
        setBusy('workmode');
        try {
            const location = shareLocation ? await captureLocation() : null;
            await selectWorkMode({
                date: todayDateStr(),
                workMode: workModeDialog,
                clientName: clientName || undefined,
                notes: notes || undefined,
                location: location ? { lat: location.lat, lng: location.lng } : undefined,
                idempotencyKey: crypto.randomUUID(),
            });
            notifyCheckedIn();
            enqueueSnackbar(`Checked in — ${WORK_MODE_COPY[workModeDialog].title}`, { variant: 'success' });
            setWorkModeDialog(null);
            await load(true);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to check in'), { variant: 'error' });
        } finally {
            setBusy(null);
        }
    };

    const handleBreak = async () => {
        setBusy('break');
        try {
            await takeAttendanceBreak({ date: todayDateStr() });
            await load(true);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to start break'), { variant: 'error' });
        } finally {
            setBusy(null);
        }
    };

    const handleResume = async () => {
        setBusy('resume');
        try {
            await resumeAttendanceFromBreak({ date: todayDateStr() });
            await load(true);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to resume from break'), { variant: 'error' });
        } finally {
            setBusy(null);
        }
    };

    const submitCheckOut = async () => {
        setBusy('checkout');
        try {
            await checkOutAttendance({
                date: todayDateStr(),
                workSummary: workSummary || undefined,
                idempotencyKey: crypto.randomUUID(),
            });
            enqueueSnackbar('Checked out — see you tomorrow!', { variant: 'success' });
            setCheckOutDialog(false);
            await load(true);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to check out'), { variant: 'error' });
        } finally {
            setBusy(null);
        }
    };

    const attendance = status.attendance;
    const timer = useWorkTimer({
        checkInTime: attendance?.check_in_time,
        checkOutTime: attendance?.check_out_time,
        breaks: status.breaks,
    });

    if (loading) return <Card sx={{ p: 3 }}><PageSpinner /></Card>;

    return (
        <Card sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Today's Attendance</Typography>

            {!status.recorded && (
                <NotRecordedView
                    allowedMethods={allowedMethods}
                    busy={busy}
                    onManual={handleManualCheckIn}
                    onWorkMode={openWorkModeDialog}
                />
            )}

            {status.recorded && attendance && (
                <Stack spacing={2.5}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <MethodBadge method={attendance.method} />
                        <WorkModeBadge workMode={attendance.work_mode} />
                        {status.onBreak && <Chip icon={<Coffee size={14} />} label="On Break" size="small" color="warning" />}
                        {attendance.check_out_time && <Chip label="Day Complete" size="small" color="default" variant="outlined" />}
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="baseline">
                        <Clock size={18} />
                        <Typography variant="h4" sx={{ fontWeight: 800, fontFamily: 'monospace', letterSpacing: 1 }}>
                            {timer.formatted}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">worked today</Typography>
                    </Stack>

                    {attendance.client_name && (
                        <Typography variant="body2" color="text.secondary">Client: <strong>{attendance.client_name}</strong></Typography>
                    )}

                    {!attendance.check_out_time && (
                        <Stack direction="row" spacing={1.5} flexWrap="wrap">
                            {status.onBreak ? (
                                <Button variant="contained" color="warning" startIcon={<PlayCircle size={18} />} disabled={!!busy} onClick={handleResume}>
                                    {busy === 'resume' ? 'Resuming…' : 'Resume Work'}
                                </Button>
                            ) : (
                                <Button variant="outlined" color="warning" startIcon={<Coffee size={18} />} disabled={!!busy} onClick={handleBreak}>
                                    {busy === 'break' ? 'Starting…' : 'Take a Break'}
                                </Button>
                            )}
                            <Button
                                variant="contained" startIcon={<LogOut size={18} />} disabled={!!busy || status.onBreak}
                                onClick={() => { setWorkSummary(''); setCheckOutDialog(true); }}
                            >
                                Check Out
                            </Button>
                        </Stack>
                    )}

                    {attendance.work_summary && (
                        <Alert severity="info" variant="outlined">Work summary: {attendance.work_summary}</Alert>
                    )}

                    <Divider />
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>Timeline</Typography>
                        <AttendanceTimeline events={buildTimelineEvents({
                            checkInTime: attendance.check_in_time,
                            checkOutTime: attendance.check_out_time,
                            breaks: status.breaks,
                        })} />
                    </Box>
                </Stack>
            )}

            {/* Work-mode check-in (WFH / Client Visit / Field Work) */}
            <Dialog open={!!workModeDialog} onClose={() => setWorkModeDialog(null)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>{workModeDialog && WORK_MODE_COPY[workModeDialog].title}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 0.5 }}>
                        {workModeDialog && WORK_MODE_COPY[workModeDialog].needsClientName && (
                            <TextField label="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} fullWidth autoFocus />
                        )}
                        <TextField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline minRows={2} />
                        <Button
                            variant={shareLocation ? 'contained' : 'outlined'} size="small" startIcon={<MapPinned size={16} />}
                            onClick={() => setShareLocation((v) => !v)} sx={{ alignSelf: 'flex-start' }}
                        >
                            {shareLocation ? 'Location will be shared' : 'Share my current location'}
                        </Button>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button onClick={() => setWorkModeDialog(null)} color="inherit" disabled={busy === 'workmode'}>Cancel</Button>
                    <Button
                        variant="contained" onClick={submitWorkMode} disabled={busy === 'workmode' ||
                            (!!workModeDialog && WORK_MODE_COPY[workModeDialog].needsClientName && !clientName.trim())}
                    >
                        {busy === 'workmode' ? <CircularProgress size={20} /> : 'Check In'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Check-out confirmation, with an optional work summary for remote work-modes */}
            <Dialog open={checkOutDialog} onClose={() => setCheckOutDialog(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>Check out for today?</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">Worked today: {timer.formatted}</Typography>
                        {attendance?.work_mode && attendance.work_mode !== 'Office' && (
                            <TextField
                                label="What did you work on today? (optional)" value={workSummary}
                                onChange={(e) => setWorkSummary(e.target.value)} fullWidth multiline minRows={3}
                            />
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button onClick={() => setCheckOutDialog(false)} color="inherit" disabled={busy === 'checkout'}>Cancel</Button>
                    <Button variant="contained" onClick={submitCheckOut} disabled={busy === 'checkout'}>
                        {busy === 'checkout' ? <CircularProgress size={20} /> : 'Check Out'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Card>
    );
}

function NotRecordedView({
    allowedMethods, busy, onManual, onWorkMode,
}: {
    allowedMethods: string[];
    busy: string | null;
    onManual: () => void;
    onWorkMode: (mode: WorkModeKind) => void;
}) {
    const workModes = (['WFH', 'ClientVisit', 'FieldWork'] as WorkModeKind[]).filter((m) => allowedMethods.includes(m));
    const hasManual = allowedMethods.includes('Manual');
    const faceOnly = allowedMethods.includes('Face') && !hasManual && workModes.length === 0;

    if (allowedMethods.length === 0 || faceOnly) {
        return (
            <Alert severity="info" icon={<Camera size={20} />}>
                Your attendance policy requires <strong>Face Recognition</strong> — please check in at the office kiosk.
            </Alert>
        );
    }

    return (
        <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">You haven't checked in yet today. Choose how you're working:</Typography>
            <Stack direction="row" spacing={1.5} flexWrap="wrap">
                {hasManual && (
                    <Button variant="contained" startIcon={<UserCheck size={18} />} disabled={!!busy} onClick={onManual}>
                        {busy === 'manual' ? 'Checking in…' : 'Check In (Office)'}
                    </Button>
                )}
                {workModes.map((mode) => {
                    const Icon = WORK_MODE_COPY[mode].icon;
                    return (
                        <Button key={mode} variant="outlined" startIcon={<Icon size={18} />} disabled={!!busy} onClick={() => onWorkMode(mode)}>
                            {WORK_MODE_COPY[mode].title}
                        </Button>
                    );
                })}
            </Stack>
            {allowedMethods.includes('Face') && (
                <Typography variant="caption" color="text.secondary">Face Recognition check-in is also available at the office kiosk.</Typography>
            )}
        </Stack>
    );
}

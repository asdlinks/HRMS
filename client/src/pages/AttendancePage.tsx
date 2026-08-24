import { useState, useEffect, useMemo } from 'react';
import {
    Box, Card, Typography, Stack, IconButton, Select, MenuItem, FormControl,
    InputLabel, Tooltip, Grid2 as Grid, useTheme,
} from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Info, CalendarCheck, CalendarX, Umbrella, TrendingUp } from 'lucide-react';
import { getMonthlyAttendance, getUsers } from '../api';
import { useAuth } from '../auth/AuthContext';
import type { AuthUser } from '../types';
import { PageHeader, PageSpinner, StatCard, DataTable } from '../components/ui';
import { TodayAttendanceCard, MethodBadge, WorkModeBadge } from '../components/attendance';
import { statusToneColors } from '../theme/palette';

interface AttendanceRecord {
    user_id: number; date: string; status: string; check_in_time?: string | null;
    check_out_time?: string | null; method?: string | null; work_mode?: string | null; client_name?: string | null;
}
interface LeaveRecord { start_date: string; end_date: string; is_half_day: number | boolean; type: string }
interface HolidayRecord { date: string; name: string }
interface EmployeeUser { id: number; name: string; created_at?: string; joining_date?: string }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isSecondSaturday(dayOfWeek: number, d: number) {
    return dayOfWeek === 6 && d > 7 && d <= 14;
}

// MSSQL DATE columns round-trip through JSON as full ISO timestamps
// ("2026-07-10T00:00:00.000Z"), not plain "YYYY-MM-DD" — every date-string
// comparison below assumes the latter, so every date field is normalized to
// its first 10 characters once, right at the API boundary.
function toDateOnly(value: string): string {
    return value.length > 10 ? value.slice(0, 10) : value;
}

export default function AttendancePage() {
    const { user, hasPermission } = useAuth() as { user: AuthUser } & ReturnType<typeof useAuth>;
    const theme = useTheme();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [data, setData] = useState<{ attendance: AttendanceRecord[]; leaves: LeaveRecord[]; holidays: HolidayRecord[] }>({ attendance: [], leaves: [], holidays: [] });
    const [loading, setLoading] = useState(true);
    const [employees, setEmployees] = useState<EmployeeUser[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<number>(user.id);

    // super_admin is the only role holding both users.view.team AND
    // users.view.all simultaneously in the default RBAC seed — used below to
    // reproduce the old `role !== 'super_admin'` UI guards via real permissions.
    const isSuperAdminLike = hasPermission('users.view.team') && hasPermission('users.view.all');
    const canViewOthers = hasPermission('attendance.view.team');
    const viewingSelf = selectedUserId === user.id;

    useEffect(() => {
        if (canViewOthers) fetchEmployees();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetchAttendanceData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDate, selectedUserId]);

    // TodayAttendanceCard dispatches this after any check-in/checkout/break
    // action so the calendar + history reflect the change immediately.
    useEffect(() => {
        const handler = () => fetchAttendanceData(true);
        window.addEventListener('userCheckedIn', handler);
        return () => window.removeEventListener('userCheckedIn', handler);
    }, [currentDate, selectedUserId]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchEmployees = async () => {
        try {
            const resp = await getUsers('all');
            setEmployees(resp.data);
            if (isSuperAdminLike && resp.data.length > 0) {
                setSelectedUserId(resp.data[0].id);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchAttendanceData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const resp = await getMonthlyAttendance({ userId: selectedUserId, month: currentDate.getMonth() + 1, year: currentDate.getFullYear() });
            setData({
                attendance: resp.data.attendance.map((a: AttendanceRecord) => ({ ...a, date: toDateOnly(a.date) })),
                leaves: resp.data.leaves.map((l: LeaveRecord) => ({ ...l, start_date: toDateOnly(l.start_date), end_date: toDateOnly(l.end_date) })),
                holidays: resp.data.holidays.map((h: HolidayRecord) => ({ ...h, date: toDateOnly(h.date) })),
            });
        } catch (err) {
            console.error(err);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const todayDateStr = new Date().toISOString().split('T')[0];
    const startDateStr = year > 2026 ? `${year}-01-01` : '2026-05-01';
    const targetUser = useMemo(() => employees.find((e) => e.id === selectedUserId) || (selectedUserId === user.id ? user : undefined), [employees, selectedUserId, user]);

    const showOnboardingBanner = !isSuperAdminLike && (user.created_at ? user.created_at.split(' ')[0] : user.joining_date) === todayDateStr;

    const days: { d: number | null; dateStr?: string; statusClass: string; statusText: string; holiday?: HolidayRecord; leave?: LeaveRecord; attendance?: AttendanceRecord; isToday?: boolean; isJoiningDay?: boolean }[] = [];
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) days.push({ d: null, statusClass: '', statusText: '' });

    const stats = { present: 0, absent: 0, leave: 0, workingDaysElapsed: 0 };

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const targetDate = new Date(year, month, d);
        const dayOfWeek = targetDate.getDay();
        const isToday = new Date().toDateString() === targetDate.toDateString();
        const isSunday = dayOfWeek === 0;
        const is2ndSat = isSecondSaturday(dayOfWeek, d);
        const isOff = isSunday || is2ndSat;

        const holiday = data.holidays.find((h) => h.date === dateStr);
        const leave = data.leaves.find((l) => dateStr >= l.start_date && dateStr <= l.end_date);
        const attendance = data.attendance.find((a) => a.date === dateStr);

        const createdAtPart = targetUser?.created_at ? targetUser.created_at.split(' ')[0] : null;
        const joiningDatePart = targetUser?.joining_date;
        let trackingStartDate = createdAtPart;
        if (joiningDatePart && (!trackingStartDate || joiningDatePart > trackingStartDate)) trackingStartDate = joiningDatePart;
        const targetUserTrackingStart = trackingStartDate || startDateStr;

        let statusClass = '';
        let statusText = '';
        if (holiday) { statusClass = 'holiday'; statusText = holiday.name; }
        else if (leave) { statusClass = leave.is_half_day ? 'half-leave' : 'leave'; statusText = leave.is_half_day ? 'Half Day' : `${leave.type} Leave`; }
        else if (attendance && dateStr >= startDateStr) { statusClass = 'present'; statusText = attendance.method ? `Present — ${attendance.method}` : 'Present'; }
        else if (isSunday) { statusClass = 'off-day'; statusText = 'Sunday'; }
        else if (is2ndSat) { statusClass = 'off-day'; statusText = '2nd Saturday'; }
        else if (dateStr < todayDateStr && dateStr > targetUserTrackingStart && dateStr >= startDateStr) { statusClass = 'absent'; statusText = 'Absent'; }

        // Monthly summary — only counts days that have actually elapsed and
        // fall inside this user's tracked window, so a future/unreached day
        // never inflates the "absent" count.
        if (dateStr <= todayDateStr && dateStr >= targetUserTrackingStart && !isOff && !holiday) {
            stats.workingDaysElapsed += 1;
            if (statusClass === 'present') stats.present += 1;
            else if (statusClass === 'leave' || statusClass === 'half-leave') stats.leave += 1;
            else if (statusClass === 'absent') stats.absent += 1;
        }

        const isJoiningDay = dateStr === targetUserTrackingStart;
        days.push({ d, dateStr, statusClass, statusText, holiday, leave, attendance, isToday, isJoiningDay });
    }

    const attendancePct = stats.workingDaysElapsed > 0 ? Math.round((stats.present / stats.workingDaysElapsed) * 100) : null;

    const statusColors: Record<string, { bg: string; fg: string }> = {
        present: { bg: statusToneColors.success.main, fg: theme.palette.success.contrastText },
        leave: { bg: statusToneColors.info.main, fg: theme.palette.info.contrastText },
        'half-leave': { bg: theme.palette.mode === 'dark' ? statusToneColors.info.bgDark : statusToneColors.info.bg, fg: statusToneColors.info.main },
        absent: { bg: statusToneColors.error.main, fg: theme.palette.error.contrastText },
        holiday: { bg: theme.palette.mode === 'dark' ? 'rgba(79,70,229,0.24)' : theme.palette.primary.light, fg: theme.palette.primary.main },
        'off-day': { bg: theme.palette.action.hover, fg: theme.palette.text.disabled },
    };

    const historyRows = useMemo(
        () => data.attendance
            .filter((a) => a.date <= todayDateStr)
            .slice()
            .sort((a, b) => (a.date < b.date ? 1 : -1)),
        [data.attendance, todayDateStr],
    );

    const historyColumns: GridColDef<AttendanceRecord>[] = [
        { field: 'date', headerName: 'Date', width: 120, valueFormatter: (v: string) => format(new Date(v), 'd MMM yyyy') },
        { field: 'method', headerName: 'Method', width: 170, renderCell: (p) => <MethodBadge method={p.row.method} /> },
        { field: 'work_mode', headerName: 'Work Mode', width: 170, renderCell: (p) => <WorkModeBadge workMode={p.row.work_mode} /> },
        { field: 'check_in_time', headerName: 'Check-in', width: 110, valueFormatter: (v: string | null) => (v ? format(new Date(v), 'h:mm a') : '—') },
        { field: 'check_out_time', headerName: 'Check-out', width: 110, valueFormatter: (v: string | null) => (v ? format(new Date(v), 'h:mm a') : '—') },
        { field: 'client_name', headerName: 'Client / Notes', flex: 1, minWidth: 160, valueFormatter: (v: string | null) => v || '—' },
    ];

    return (
        <Box className="fade-in" sx={{ maxWidth: 960, mx: 'auto' }}>
            <PageHeader
                title="Daily Check-In"
                subtitle="Track presence, leaves, and holidays."
                actions={
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        {canViewOthers && (
                            <FormControl size="small" sx={{ minWidth: 180 }}>
                                <InputLabel>Viewing for</InputLabel>
                                <Select
                                    label="Viewing for"
                                    value={selectedUserId}
                                    onChange={(e) => setSelectedUserId(Number(e.target.value))}
                                >
                                    <MenuItem value={user.id}>Self ({user.name})</MenuItem>
                                    {employees.filter((e) => e.id !== user.id).map((e) => (
                                        <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                        <Card sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5 }}>
                            <IconButton size="small" onClick={prevMonth}><ChevronLeft size={18} /></IconButton>
                            <Typography sx={{ minWidth: 130, textAlign: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
                                {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                            </Typography>
                            <IconButton size="small" onClick={nextMonth}><ChevronRight size={18} /></IconButton>
                        </Card>
                    </Stack>
                }
            />

            {showOnboardingBanner && (
                <Box sx={{ mb: 3 }}>
                    <Card sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: 'info.light' }}>
                        <Info size={20} />
                        <Typography variant="body2"><strong>Welcome to the team!</strong> You can start check-in from the system by tomorrow, make sure to login everyday.</Typography>
                    </Card>
                </Box>
            )}

            {viewingSelf && hasPermission('attendance.checkin') && (
                <Box sx={{ mb: 3 }}>
                    <TodayAttendanceCard />
                </Box>
            )}

            {!loading && (
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatCard label="Present Days" value={stats.present} icon={<CalendarCheck size={20} />} color="success" />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatCard label="On Leave" value={stats.leave} icon={<Umbrella size={20} />} color="info" />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatCard label="Absent Days" value={stats.absent} icon={<CalendarX size={20} />} color="error" />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatCard label="Attendance Rate" value={attendancePct !== null ? `${attendancePct}%` : '—'} icon={<TrendingUp size={20} />} color="primary" />
                    </Grid>
                </Grid>
            )}

            <Card sx={{ p: { xs: 1.5, sm: 2.5 } }}>
                {loading ? <PageSpinner /> : (
                    <>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', mb: 1, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                            {WEEKDAYS.map((d) => (
                                <Typography key={d} variant="caption" sx={{ textAlign: 'center', fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase' }}>{d}</Typography>
                            ))}
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.75 }}>
                            {days.map((day, i) => {
                                if (day.d === null) return <Box key={`empty-${i}`} />;
                                const colors = statusColors[day.statusClass];
                                return (
                                    <Tooltip key={day.d} title={day.isJoiningDay && day.isToday ? 'Check-in starts tomorrow' : day.statusText}>
                                        <Box
                                            sx={{
                                                aspectRatio: '1/1', borderRadius: 2, display: 'flex', flexDirection: 'column',
                                                alignItems: 'center', justifyContent: 'center', position: 'relative',
                                                border: day.isToday ? '2px solid' : '1px solid',
                                                borderColor: day.isToday ? 'text.primary' : 'divider',
                                                bgcolor: day.statusClass === 'holiday' || day.statusClass === 'off-day' ? 'action.hover' : 'transparent',
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontWeight: 700, fontSize: '0.85rem',
                                                    bgcolor: colors?.bg ?? 'transparent',
                                                    color: colors?.fg ?? 'text.primary',
                                                }}
                                            >
                                                {day.d}
                                            </Box>
                                            {(day.holiday || day.leave) && (
                                                <Typography noWrap sx={{ fontSize: '0.5rem', fontWeight: 700, mt: 0.25, maxWidth: '90%', color: day.holiday ? 'primary.main' : 'info.main' }}>
                                                    {day.holiday ? day.holiday.name : (day.leave?.is_half_day ? 'Half Day' : day.leave?.type)}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Tooltip>
                                );
                            })}
                        </Box>
                    </>
                )}
            </Card>

            <Stack direction="row" flexWrap="wrap" justifyContent="center" spacing={2.5} sx={{ mt: 3, mb: 4, p: 2 }}>
                {[
                    { label: 'Present', color: statusToneColors.success.main },
                    { label: 'Leave', color: statusToneColors.info.main },
                    { label: 'Absent', color: statusToneColors.error.main },
                    { label: 'Holiday / Off-Day', color: theme.palette.primary.main },
                ].map((item) => (
                    <Stack key={item.label} direction="row" spacing={0.75} alignItems="center">
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: item.color }} />
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>{item.label}</Typography>
                    </Stack>
                ))}
            </Stack>

            <Box sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ mb: 1.5 }}>Attendance History</Typography>
                <DataTable
                    rows={historyRows}
                    columns={historyColumns}
                    getRowId={(row) => row.date}
                    loading={loading}
                    emptyTitle="No attendance recorded this month"
                    withToolbar
                />
            </Box>
        </Box>
    );
}

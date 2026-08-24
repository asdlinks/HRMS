import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Card, Avatar, Typography, Stack, Chip, Button, Grid2 as Grid,
    Tabs, Tab, Tooltip,
} from '@mui/material';
import {
    Mail, Briefcase, Users as UsersIcon, Calendar, ChevronLeft, ChevronRight,
    CheckCircle, Clock, User, LayoutGrid, CalendarCheck, History,
} from 'lucide-react';
import { getUserById, getLeaves, getMonthlyAttendance } from '../api';
import { PageHeader, PageSpinner, EmptyState, StatusBadge } from '../components/ui';
import { statusToneColors } from '../theme/palette';
import { useAuth } from '../auth/AuthContext';

interface ProfileUser {
    id: number;
    name: string;
    email: string;
    role: string;
    designation?: string;
    department_name?: string;
    employee_id?: string;
    joining_date?: string;
    profile_photo?: string | null;
    // Only present in the response when the viewer holds users.pii.manage —
    // see server/routes/users.routes.js's GET /:id.
    aadhaar_number?: string | null;
    pan_number?: string | null;
}
interface Leave { id: number; type: string; status: string; start_date: string; end_date: string; is_half_day: number | boolean }
interface AttendanceRecord { user_id: number; date: string }
interface HolidayRecord { date: string; name: string }

type TabKey = 'overview' | 'attendance' | 'history';

export default function EmployeeProfilePage() {
    const { userId } = useParams();
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const canManagePii = hasPermission('users.pii.manage');
    const [user, setUser] = useState<ProfileUser | null>(null);
    const [leaves, setLeaves] = useState<Leave[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<TabKey>('overview');

    const [attMonth, setAttMonth] = useState(new Date());
    const [attData, setAttData] = useState<{ attendance: AttendanceRecord[]; leaves: Leave[]; holidays: HolidayRecord[] }>({ attendance: [], leaves: [], holidays: [] });
    const [attLoading, setAttLoading] = useState(false);

    useEffect(() => {
        fetchEmployeeData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    useEffect(() => {
        if (tab !== 'attendance' || !userId) return;
        setAttLoading(true);
        getMonthlyAttendance({ userId, month: attMonth.getMonth() + 1, year: attMonth.getFullYear() })
            .then((resp) => setAttData(resp.data))
            .catch(() => {})
            .finally(() => setAttLoading(false));
    }, [tab, userId, attMonth]);

    const fetchEmployeeData = async () => {
        try {
            const [userResp, leavesResp] = await Promise.all([getUserById(userId!), getLeaves(undefined, userId)]);
            setUser(userResp.data);
            setLeaves(leavesResp.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const sortedLeaves = useMemo(
        () => [...leaves].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()),
        [leaves],
    );

    const tenure = useMemo(() => {
        if (!user?.joining_date) return null;
        const years = (Date.now() - new Date(user.joining_date).getTime()) / (365.25 * 86400000);
        if (years < 1) return `${Math.round(years * 12)} months`;
        return `${Math.round(years * 10) / 10} years`;
    }, [user?.joining_date]);

    if (loading) return <PageSpinner />;
    if (!user) return <EmptyState title="User not found" />;

    const daysInMonth = new Date(attMonth.getFullYear(), attMonth.getMonth() + 1, 0).getDate();
    const monthPresent = attData.attendance.length;
    const monthLeave = attData.leaves.length;
    const monthHolidays = attData.holidays.length;

    return (
        <Box className="fade-in" sx={{ maxWidth: 1200, mx: 'auto' }}>
            <Box sx={{ position: 'relative', textAlign: 'center', mb: 4 }}>
                <Button
                    onClick={() => navigate(-1)}
                    startIcon={<ChevronLeft size={18} />}
                    color="inherit"
                    sx={{ position: 'absolute', left: 0, top: 0 }}
                >
                    Back
                </Button>
                <Typography variant="h4" sx={{ fontSize: '1.6rem' }}>Employee Profile</Typography>
                <Typography variant="body2" color="text.secondary">Detailed overview of {user.name}'s records</Typography>
            </Box>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Card sx={{ p: 4, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Avatar src={user.profile_photo ?? undefined} variant="rounded" sx={{ width: 110, height: 110, borderRadius: 5, mb: 2, fontSize: '2.5rem' }}>
                            <User size={40} />
                        </Avatar>
                        <Typography variant="h5" sx={{ mb: 0.5 }}>{user.name}</Typography>
                        <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: 1 }}>{user.designation}</Typography>
                        {user.department_name && <Chip label={user.department_name} size="small" sx={{ mt: 1.5 }} />}

                        <Button
                            component="a"
                            href={`mailto:${user.email}`}
                            variant="outlined"
                            size="small"
                            startIcon={<Mail size={15} />}
                            sx={{ mt: 2.5, mb: 1 }}
                        >
                            Send Email
                        </Button>

                        <Stack spacing={2.5} sx={{ width: '100%', textAlign: 'left', mt: 2.5 }}>
                            <ProfileInfoRow icon={<Mail size={18} />} label="Email Address" value={user.email} />
                            <ProfileInfoRow icon={<Briefcase size={18} />} label="Employee ID" value={user.employee_id || 'Not set'} />
                            <ProfileInfoRow icon={<UsersIcon size={18} />} label="Role" value={user.role} capitalize />
                            <ProfileInfoRow
                                icon={<Calendar size={18} />}
                                label="Joining Date"
                                value={user.joining_date ? new Date(user.joining_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set'}
                            />
                            {tenure && <ProfileInfoRow icon={<Clock size={18} />} label="Tenure" value={tenure} />}
                            {canManagePii && (
                                <>
                                    <ProfileInfoRow icon={<Briefcase size={18} />} label="Aadhaar Number" value={user.aadhaar_number || 'Not set'} />
                                    <ProfileInfoRow icon={<Briefcase size={18} />} label="PAN Number" value={user.pan_number || 'Not set'} />
                                </>
                            )}
                        </Stack>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 8 }}>
                    <Card sx={{ mb: 3 }}>
                        <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                            <Tab value="overview" label="Overview" icon={<LayoutGrid size={16} />} iconPosition="start" sx={{ minHeight: 52 }} />
                            <Tab value="attendance" label="Attendance" icon={<CalendarCheck size={16} />} iconPosition="start" sx={{ minHeight: 52 }} />
                            <Tab value="history" label="Leave History" icon={<History size={16} />} iconPosition="start" sx={{ minHeight: 52 }} />
                        </Tabs>
                    </Card>

                    {tab === 'overview' && (
                        <Stack spacing={3}>
                            <Grid container spacing={2.5}>
                                <Grid size={6}>
                                    <Card sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <CheckCircle size={22} color={statusToneColors.success.main} />
                                        <Box>
                                            <Typography variant="h5">{leaves.filter((l) => l.status === 'Approved').length}</Typography>
                                            <Typography variant="caption" color="text.secondary">Approved Leaves</Typography>
                                        </Box>
                                    </Card>
                                </Grid>
                                <Grid size={6}>
                                    <Card sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Clock size={22} color={statusToneColors.warning.main} />
                                        <Box>
                                            <Typography variant="h5">{leaves.filter((l) => l.status === 'Pending').length}</Typography>
                                            <Typography variant="caption" color="text.secondary">Pending Requests</Typography>
                                        </Box>
                                    </Card>
                                </Grid>
                            </Grid>

                            <Card sx={{ p: 3 }}>
                                <Typography variant="h6" sx={{ mb: 2 }}>Recent Activity</Typography>
                                {sortedLeaves.length === 0 ? (
                                    <EmptyState title="No activity yet" />
                                ) : (
                                    <LeaveTimeline leaves={sortedLeaves.slice(0, 4)} />
                                )}
                            </Card>
                        </Stack>
                    )}

                    {tab === 'attendance' && (
                        <Card sx={{ p: 3 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2.5 }}>
                                <Typography variant="h6">Monthly Attendance</Typography>
                                <Stack direction="row" alignItems="center" spacing={0.5}>
                                    <Button size="small" onClick={() => setAttMonth(new Date(attMonth.getFullYear(), attMonth.getMonth() - 1))}><ChevronLeft size={16} /></Button>
                                    <Typography sx={{ fontWeight: 700, minWidth: 130, textAlign: 'center', fontSize: '0.85rem' }}>
                                        {attMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                                    </Typography>
                                    <Button size="small" onClick={() => setAttMonth(new Date(attMonth.getFullYear(), attMonth.getMonth() + 1))}><ChevronRight size={16} /></Button>
                                </Stack>
                            </Stack>

                            {attLoading ? <PageSpinner /> : (
                                <>
                                    <Grid container spacing={2} sx={{ mb: 3 }}>
                                        <Grid size={4}>
                                            <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                                                <Typography variant="h5" sx={{ color: 'success.main' }}>{monthPresent}</Typography>
                                                <Typography variant="caption" color="text.secondary">Present Days</Typography>
                                            </Box>
                                        </Grid>
                                        <Grid size={4}>
                                            <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                                                <Typography variant="h5" sx={{ color: 'info.main' }}>{monthLeave}</Typography>
                                                <Typography variant="caption" color="text.secondary">Leave Days</Typography>
                                            </Box>
                                        </Grid>
                                        <Grid size={4}>
                                            <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                                                <Typography variant="h5" sx={{ color: 'primary.main' }}>{monthHolidays}</Typography>
                                                <Typography variant="caption" color="text.secondary">Holidays</Typography>
                                            </Box>
                                        </Grid>
                                    </Grid>

                                    <Stack direction="row" flexWrap="wrap" gap={0.75}>
                                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                                            const dateStr = `${attMonth.getFullYear()}-${String(attMonth.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                            const isPresent = attData.attendance.some((a) => a.date === dateStr);
                                            const isLeave = attData.leaves.some((l) => dateStr >= l.start_date && dateStr <= l.end_date);
                                            const isHoliday = attData.holidays.some((h) => h.date === dateStr);
                                            const dotColor = isHoliday ? 'primary.main' : isLeave ? 'info.main' : isPresent ? 'success.main' : 'action.disabledBackground';
                                            return (
                                                <Tooltip key={d} title={`${dateStr}: ${isHoliday ? 'Holiday' : isLeave ? 'Leave' : isPresent ? 'Present' : 'No record'}`}>
                                                    <Box sx={{ width: 28, height: 28, borderRadius: 1, bgcolor: dotColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: isPresent || isLeave || isHoliday ? '#fff' : 'text.disabled' }}>{d}</Typography>
                                                    </Box>
                                                </Tooltip>
                                            );
                                        })}
                                    </Stack>
                                </>
                            )}
                        </Card>
                    )}

                    {tab === 'history' && (
                        <Card sx={{ p: 3 }}>
                            <Typography variant="h6" sx={{ mb: 2 }}>Leave History</Typography>
                            {sortedLeaves.length === 0 ? (
                                <EmptyState title="No leave records found" />
                            ) : (
                                <LeaveTimeline leaves={sortedLeaves} />
                            )}
                        </Card>
                    )}
                </Grid>
            </Grid>
        </Box>
    );
}

function LeaveTimeline({ leaves }: { leaves: Leave[] }) {
    return (
        <Stack spacing={0}>
            {leaves.map((l, i) => (
                <Stack key={l.id} direction="row" spacing={2} sx={{ pb: i < leaves.length - 1 ? 2.5 : 0, position: 'relative' }}>
                    <Stack alignItems="center" sx={{ pt: 0.5 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
                        {i < leaves.length - 1 && <Box sx={{ width: '2px', flex: 1, bgcolor: 'divider', mt: 0.5 }} />}
                    </Stack>
                    <Box sx={{ flex: 1, minWidth: 0, pb: 0.5 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {l.type.toUpperCase()} Leave {l.is_half_day ? '(Half Day)' : ''}
                            </Typography>
                            <StatusBadge status={l.status} />
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                            {new Date(l.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} to{' '}
                            {new Date(l.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </Typography>
                    </Box>
                </Stack>
            ))}
        </Stack>
    );
}

function ProfileInfoRow({ icon, label, value, capitalize }: { icon: ReactNode; label: string; value: string; capitalize?: boolean }) {
    return (
        <Stack direction="row" spacing={1.75} sx={{ color: 'text.secondary' }}>
            {icon}
            <Box>
                <Typography variant="caption" sx={{ display: 'block', textTransform: 'uppercase', fontWeight: 700, color: 'text.disabled' }}>{label}</Typography>
                <Typography sx={{ fontWeight: 600, color: 'text.primary', textTransform: capitalize ? 'capitalize' : 'none' }}>{value}</Typography>
            </Box>
        </Stack>
    );
}

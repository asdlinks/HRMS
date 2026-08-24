import { useState, useEffect } from 'react';
import { Box, Card, Typography, Avatar, Stack, Chip, Link as MLink } from '@mui/material';
import { Grid2 as Grid } from '@mui/material';
import { Users, UserMinus, Calendar, Sun, Search, CalendarClock, Building2, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getUsers, getLeaves, getHolidays, getSettings, getDailyAttendance } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useHeaderSearch } from '../layout/SearchContext';
import { StatCard, EmptyState, CardSkeletonGrid, RowSkeletonList } from '../components/ui';
import {
    TodaysAttendanceBar, AttendanceMethodBreakdownCard, ApprovalsQueueCard, CelebrationsCard, HolidayTimelineCard,
    AnnouncementsCard, DepartmentHeadcountChart, LeaveAllocationChart, RecentActivityCard,
    QuickActionsCard, type QuickActionItem,
} from '../components/dashboard';
import type { AuthUser, AttendanceRules, LeaveAllocation } from '../types';

// Legacy default (Phase 12B): a role participates in attendance unless the
// tenant has explicitly opted it out via Settings > Attendance Rules >
// Attendance Required For. Falls back to today's behavior (everyone except
// Organization Administrator) for tenants that haven't saved the setting yet.
function getRequiredRoles(rules: AttendanceRules | undefined, users: { role: string }[]): string[] {
    if (rules?.required_for_roles) return rules.required_for_roles;
    return Array.from(new Set(users.map((u) => u.role))).filter((r) => r !== 'super_admin');
}

interface Leave {
    id: number;
    user_id: number;
    user_name?: string;
    type: string;
    status: string;
    start_date: string;
    end_date: string;
    is_half_day: number | boolean;
}
interface EmployeeUser {
    id: number;
    name: string;
    role: string;
    department_name?: string;
    designation?: string | null;
    profile_photo?: string | null;
    date_of_birth?: string | null;
    joining_date?: string | null;
}
interface Holiday { name: string; date: string }

export default function ManagerDashboard() {
    const { user, hasPermission } = useAuth() as { user: AuthUser } & ReturnType<typeof useAuth>;
    const { searchQuery, setSearchQuery } = useHeaderSearch();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{
        onLeaveToday: Leave[];
        pending: Leave[];
        weeklyLeaves: Leave[];
        nextHoliday: Holiday | null;
        holidays: Holiday[];
        weekDates: string[];
        users: EmployeeUser[];
        allLeaves: Leave[];
        dailyCheckins: { user_id: number; method?: string | null }[];
        personalStats: { available: number; taken: number; total: number };
        leaveTypeBreakdown: { type: string; allocated: number; used: number }[];
        attendanceRules?: AttendanceRules;
    }>({
        onLeaveToday: [], pending: [], weeklyLeaves: [], nextHoliday: null, holidays: [], weekDates: [],
        users: [], allLeaves: [], dailyCheckins: [], personalStats: { available: 0, taken: 0, total: 0 },
        leaveTypeBreakdown: [], attendanceRules: undefined,
    });

    // hr holds users.view.all but not users.view.team (no direct-report
    // hierarchy of their own); super_admin and manager both fail this check
    // (super_admin has both, manager has only view.team) — reproduces the
    // legacy `user.role === 'hr'` branch exactly via real permissions.
    const isPersonalStatsDashboard = hasPermission('users.view.all') && !hasPermission('users.view.team');
    const isOrgWide = hasPermission('users.view.all');

    useEffect(() => {
        fetchManagerData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchManagerData = async () => {
        try {
            const [usersResp, leavesResp, holidaysResp, settingsResp, dailyResp] = await Promise.all([
                getUsers(), getLeaves(), getHolidays(user.location_id ?? undefined), getSettings(), getDailyAttendance(),
            ]);
            const users: EmployeeUser[] = usersResp.data;
            const leaves: Leave[] = leavesResp.data;
            const holidays: Holiday[] = holidaysResp.data;
            const settings = settingsResp.data;
            const dailyCheckins = dailyResp.data;

            let totalAllocated = 0;
            let totalUsed = 0;
            const leaveTypeBreakdown: { type: string; allocated: number; used: number }[] = [];
            if (isPersonalStatsDashboard) {
                let leaveAllocations: LeaveAllocation[] = [];
                try {
                    if (settings.leave_allocations) {
                        leaveAllocations = typeof settings.leave_allocations === 'string'
                            ? JSON.parse(settings.leave_allocations) : settings.leave_allocations;
                    }
                } catch { /* fall through to default */ }
                if (leaveAllocations.length === 0) leaveAllocations = [{ type: 'casual', days: 15 }];

                const currentYear = new Date().getFullYear();
                const myLeaves = leaves.filter((l) => l.user_id === user.id && l.status === 'Approved' && new Date(l.start_date).getFullYear() === currentYear);
                leaveAllocations.forEach((alloc) => {
                    const allocatedDays = parseInt(String(alloc.days), 10) || 0;
                    totalAllocated += allocatedDays;
                    const typeLeaves = myLeaves.filter((l) => l.type.toLowerCase() === alloc.type.toLowerCase());
                    const usedDays = typeLeaves.reduce((sum, l) => {
                        if (Number(l.is_half_day) === 1) return sum + 0.5;
                        const diffDays = Math.ceil((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / 86400000) + 1;
                        return sum + (isNaN(diffDays) ? 1 : diffDays);
                    }, 0);
                    totalUsed += usedDays;
                    leaveTypeBreakdown.push({ type: alloc.type.charAt(0).toUpperCase() + alloc.type.slice(1), allocated: allocatedDays, used: usedDays });
                });
            }

            const today = new Date().toISOString().split('T')[0];
            const onLeaveToday = leaves.filter((l) => l.status === 'Approved' && today >= l.start_date && today <= l.end_date);
            const pending = leaves.filter((l) => l.status === 'Pending' || l.status === 'Cancellation Pending');

            const current = new Date();
            const week: string[] = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(current);
                d.setDate(current.getDate() - current.getDay() + i + 1);
                week.push(d.toISOString().split('T')[0]);
            }

            setData({
                onLeaveToday, pending,
                weeklyLeaves: leaves.filter((l) => l.status === 'Approved'),
                nextHoliday: holidays.find((h) => new Date(h.date) >= new Date()) || null,
                holidays,
                weekDates: week,
                users, allLeaves: leaves, dailyCheckins,
                personalStats: { total: totalAllocated, taken: totalUsed, available: totalAllocated - totalUsed },
                leaveTypeBreakdown,
                attendanceRules: settings.attendance_rules,
            });
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = searchQuery
        ? data.users.filter((u) => u.name?.trim().toLowerCase().includes(searchQuery.trim().toLowerCase()))
        : data.users;
    const filteredLeaves = searchQuery ? data.allLeaves.filter((l) => filteredUsers.some((u) => u.id === l.user_id)) : data.allLeaves;
    const todayStr = new Date().toISOString().split('T')[0];
    const onLeaveFiltered = filteredLeaves.filter((l) => l.status === 'Approved' && todayStr >= l.start_date && todayStr <= l.end_date);
    const pendingFiltered = filteredLeaves.filter((l) => l.status === 'Pending' || l.status === 'Cancellation Pending');
    const filteredCheckins = searchQuery ? data.dailyCheckins.filter((c) => filteredUsers.some((u) => u.id === c.user_id)) : data.dailyCheckins;
    // Roles opted out of attendance (Phase 12B) are excluded from every
    // attendance widget below (missing-checkin alerts, KPI cards) — not just
    // the "missing" list. Present/On Leave/Not Checked In are scoped to this
    // same eligible subset so TodaysAttendanceBar's three segments stay
    // internally consistent; "Currently Away" above (all leave, any role)
    // and "Total Workforce" are unrelated leave/headcount KPIs and untouched.
    const requiredRoles = getRequiredRoles(data.attendanceRules, data.users);
    const attendanceEligibleUsers = filteredUsers.filter((u) => requiredRoles.includes(u.role));
    const onLeaveEligible = onLeaveFiltered.filter((l) => attendanceEligibleUsers.some((u) => u.id === l.user_id));
    const pendingCheckins = attendanceEligibleUsers.filter((u) => !data.dailyCheckins.some((att) => att.user_id === u.id));
    const notCheckedInExcludingLeave = pendingCheckins.filter((u) => !onLeaveEligible.some((l) => l.user_id === u.id));
    const presentCount = Math.max(0, attendanceEligibleUsers.length - onLeaveEligible.length - notCheckedInExcludingLeave.length);

    const departmentCounts = new Map<string, number>();
    filteredUsers.forEach((u) => {
        const dept = u.department_name || 'Unassigned';
        departmentCounts.set(dept, (departmentCounts.get(dept) || 0) + 1);
    });
    const departmentData = Array.from(departmentCounts.entries())
        .map(([department, count]) => ({ department, count }))
        .sort((a, b) => b.count - a.count);

    const quickActions: QuickActionItem[] = [
        { to: '/leaves', icon: <CalendarClock size={22} />, label: 'Review Leave Requests' },
        ...(hasPermission('users.view.team') || hasPermission('users.view.all')
            ? [{ to: '/employees', icon: <Users size={22} />, label: 'View Employee Directory' }] : []),
        ...(hasPermission('departments.manage')
            ? [{ to: '/department', icon: <Building2 size={22} />, label: 'Manage Departments' }] : []),
        ...(hasPermission('reports.view')
            ? [{ to: '/reports', icon: <FileText size={22} />, label: 'Open Reports' }] : []),
    ];

    if (loading) {
        return (
            <Box>
                <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
                    <Box sx={{ width: 52, height: 52, borderRadius: '50%', bgcolor: 'action.hover' }} />
                </Stack>
                <Box sx={{ mb: 3 }}><CardSkeletonGrid count={4} /></Box>
                <Card sx={{ p: 3 }}><RowSkeletonList count={4} /></Card>
            </Box>
        );
    }

    return (
        <Box className="fade-in">
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
                <Avatar src={user.profile_photo ?? undefined} sx={{ width: 52, height: 52, fontWeight: 700 }}>
                    {user.name.charAt(0)}
                </Avatar>
                <Box>
                    <Typography variant="h4" sx={{ fontSize: '1.6rem' }}>Welcome, {user.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {isOrgWide ? 'Organization-wide analytics' : 'Team management summary'}
                    </Typography>
                </Box>
            </Stack>

            {searchQuery && filteredUsers.length === 0 && (
                <Card sx={{ p: 6, textAlign: 'center', mb: 3, border: '1px dashed', borderColor: 'divider' }}>
                    <Search size={36} style={{ opacity: 0.4 }} />
                    <Typography sx={{ fontWeight: 600, mt: 1.5 }}>No employees match "{searchQuery}"</Typography>
                    <MLink component="button" onClick={() => setSearchQuery('')} sx={{ mt: 1 }}>Clear search</MLink>
                </Card>
            )}

            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                {isPersonalStatsDashboard ? (
                    <>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Box component={Link} to="/leaves" sx={{ textDecoration: 'none', display: 'block' }}>
                                <StatCard label="Leaves Available" value={data.personalStats.available} icon={<Calendar size={22} />} color="primary" />
                            </Box>
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Box component={Link} to="/leaves" sx={{ textDecoration: 'none', display: 'block' }}>
                                <StatCard label="Leaves Taken" value={data.personalStats.taken} icon={<UserMinus size={22} />} color="success" />
                            </Box>
                        </Grid>
                    </>
                ) : (
                    <>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Box component={Link} to="/employees" sx={{ textDecoration: 'none', display: 'block' }}>
                                <StatCard label={searchQuery ? 'Matches Found' : 'Total Workforce'} value={filteredUsers.length} icon={<Users size={22} />} color="primary" />
                            </Box>
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Box component={Link} to="/attendance" sx={{ textDecoration: 'none', display: 'block' }}>
                                <StatCard label="Currently Away" value={onLeaveFiltered.length} icon={<UserMinus size={22} />} color="success" />
                            </Box>
                        </Grid>
                    </>
                )}
                <Grid size={{ xs: 6, sm: 3 }}>
                    <Box component={Link} to="/leaves" sx={{ textDecoration: 'none', display: 'block' }}>
                        <StatCard label="Pending Requests" value={pendingFiltered.length} icon={<Calendar size={22} />} color="warning" />
                    </Box>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <Box component={Link} to="/holidays" sx={{ textDecoration: 'none', display: 'block' }}>
                        <StatCard label="Next Holiday" value={data.nextHoliday ? data.nextHoliday.name : 'None upcoming'} icon={<Sun size={22} />} color="error" />
                    </Box>
                </Grid>
            </Grid>

            {!isPersonalStatsDashboard && (
                <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
                    <Grid size={{ xs: 12, md: 4 }}>
                        <TodaysAttendanceBar present={presentCount} onLeave={onLeaveEligible.length} notCheckedIn={notCheckedInExcludingLeave.length} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                        <AttendanceMethodBreakdownCard records={filteredCheckins} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                        <ApprovalsQueueCard pending={pendingFiltered} />
                    </Grid>
                </Grid>
            )}

            <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
                <Grid size={{ xs: 12, md: 4 }}>
                    <CelebrationsCard users={data.users} />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <HolidayTimelineCard holidays={data.holidays} />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <AnnouncementsCard />
                </Grid>
            </Grid>

            {(isOrgWide || isPersonalStatsDashboard) && (
                <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
                    {isOrgWide && (
                        <Grid size={{ xs: 12, md: isPersonalStatsDashboard ? 6 : 12 }}>
                            <DepartmentHeadcountChart data={departmentData} />
                        </Grid>
                    )}
                    {isPersonalStatsDashboard && (
                        <Grid size={{ xs: 12, md: 6 }}>
                            <LeaveAllocationChart data={data.leaveTypeBreakdown} />
                        </Grid>
                    )}
                </Grid>
            )}

            {!isPersonalStatsDashboard && (
                <Card sx={{ p: 3, mb: 2.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                        <Typography variant="h6">Pending Daily Logs</Typography>
                        <Chip label={`${pendingCheckins.length} missing`} color="error" size="small" variant="outlined" />
                    </Stack>
                    {pendingCheckins.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">All employees have checked in today!</Typography>
                    ) : (
                        <Stack direction="row" flexWrap="wrap" gap={1}>
                            {pendingCheckins.map((emp) => (
                                <Chip key={emp.id} label={emp.name} variant="outlined" title={emp.department_name || 'No Dept'} />
                            ))}
                        </Stack>
                    )}
                </Card>
            )}

            {!isPersonalStatsDashboard && (
                <Card sx={{ overflow: 'hidden', mb: 2.5 }}>
                    <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="h6">{isOrgWide ? 'Global Time Off' : 'Team Time Off'}</Typography>
                    </Box>
                    <Grid container>
                        {data.weekDates.length === 0 && (
                            <Grid size={12}><EmptyState title="No data" /></Grid>
                        )}
                        {data.weekDates.map((date) => {
                            const peopleAway = filteredUsers
                                .map((u) => {
                                    const leave = data.weeklyLeaves.find((l) => l.user_id === u.id && date >= l.start_date && date <= l.end_date);
                                    return leave ? { ...u, leave } : null;
                                })
                                .filter((u): u is EmployeeUser & { leave: Leave } => u !== null);

                            const dateObj = new Date(date);
                            const isToday = date === new Date().toISOString().split('T')[0];
                            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                            const formattedDate = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

                            return (
                                <Grid key={date} size={{ xs: 12, sm: 6 }} sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                                        {isToday ? 'Today, ' : ''}{dayName} {formattedDate}
                                    </Typography>
                                    <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1, minHeight: 40 }}>
                                        {peopleAway.length === 0 && <Typography sx={{ color: 'text.disabled' }}>—</Typography>}
                                        {peopleAway.map((emp) => (
                                            <Chip
                                                key={emp.id}
                                                avatar={<Avatar src={emp.profile_photo ?? undefined}>{emp.name.charAt(0)}</Avatar>}
                                                label={`${emp.name.split(' ')[0]}${Number(emp.leave.is_half_day) === 1 ? ' (H)' : ''}`}
                                                title={`${emp.name} (${emp.leave.type}${Number(emp.leave.is_half_day) === 1 ? ' - Half Day' : ''})`}
                                                variant="outlined"
                                                size="small"
                                            />
                                        ))}
                                    </Stack>
                                </Grid>
                            );
                        })}
                    </Grid>
                </Card>
            )}

            <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, md: 8 }}>
                    <RecentActivityCard />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <QuickActionsCard actions={quickActions} />
                </Grid>
            </Grid>
        </Box>
    );
}

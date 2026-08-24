import { useState, useEffect } from 'react';
import { Box, Card, Typography, Chip, Avatar, Stack } from '@mui/material';
import { Grid2 as Grid } from '@mui/material';
import { Calendar, UserCheck, Briefcase, Sun, CalendarClock, XSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getLeaves, getHolidays, getSettings, getUsers } from '../api';
import { useAuth } from '../auth/AuthContext';
import { StatCard, EmptyState, PageSpinner } from '../components/ui';
import {
    CelebrationsCard, HolidayTimelineCard, AnnouncementsCard, LeaveAllocationChart,
    RecentActivityCard, QuickActionsCard, type QuickActionItem,
} from '../components/dashboard';
import { TodayAttendanceCard } from '../components/attendance';
import type { AuthUser, AttendanceRules, LeaveAllocation } from '../types';

// Phase 12B: a role is required to check in unless the tenant has opted it
// out via Settings > Attendance Rules > Attendance Required For. Undefined
// (tenant hasn't saved the setting) falls back to today's behavior — every
// role except Organization Administrator (super_admin).
function isAttendanceRequired(rules: AttendanceRules | undefined, role: string): boolean {
    if (rules?.required_for_roles) return rules.required_for_roles.includes(role);
    return role !== 'super_admin';
}

interface Leave {
    id: number;
    user_id: number;
    user_name: string;
    type: string;
    status: string;
    start_date: string;
    end_date: string;
    is_half_day: number | boolean;
}

interface Holiday {
    name: string;
    date: string;
}

interface DirectoryUser {
    id: number;
    name: string;
    profile_photo?: string | null;
    date_of_birth?: string | null;
    joining_date?: string | null;
    designation?: string | null;
    department_name?: string | null;
}

export default function EmployeeDashboard() {
    const { user, hasPermission } = useAuth() as { user: AuthUser } & ReturnType<typeof useAuth>;
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<{
        totalAvailable: number;
        totalAllocated: number;
        lastLeave: Leave | null;
        teamLeaves: Leave[];
        nextHoliday: Holiday | null;
        holidays: Holiday[];
        directory: DirectoryUser[];
        leaveTypeBreakdown: { type: string; allocated: number; used: number }[];
        attendanceRules?: AttendanceRules;
    }>({ totalAvailable: 0, totalAllocated: 0, lastLeave: null, teamLeaves: [], nextHoliday: null, holidays: [], directory: [], leaveTypeBreakdown: [], attendanceRules: undefined });

    useEffect(() => {
        fetchDashboardData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user.id]);

    const fetchDashboardData = async () => {
        try {
            const [leavesResp, holidaysResp, settingsResp, usersResp] = await Promise.all([
                getLeaves(),
                getHolidays(user.location_id ?? undefined),
                getSettings(),
                getUsers().catch(() => ({ data: [] })),
            ]);

            const leaves: Leave[] = leavesResp.data;
            const holidays: Holiday[] = holidaysResp.data;
            const globalSettings = settingsResp.data;
            const directory: DirectoryUser[] = usersResp.data;

            let leaveAllocations: LeaveAllocation[] = [];
            try {
                if (globalSettings.leave_allocations) {
                    leaveAllocations = typeof globalSettings.leave_allocations === 'string'
                        ? JSON.parse(globalSettings.leave_allocations)
                        : globalSettings.leave_allocations;
                }
            } catch {
                // malformed settings JSON — fall through to the default below
            }
            if (leaveAllocations.length === 0) {
                leaveAllocations = [{ type: 'casual', days: 15 }];
            }

            const pastLeaves = leaves
                .filter((l) => l.status === 'Approved' && new Date(l.end_date) < new Date())
                .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime());

            // Same-department "who's out this week" widget — an employee only
            // holds leaves.view.own, so the server naturally scopes this to
            // their own leaves regardless of the departmentId filter sent.
            const teamLeavesResp = await getLeaves(user.department_id ?? undefined);
            const today = new Date();
            const nextWeek = new Date();
            nextWeek.setDate(today.getDate() + 7);
            const thisWeekLeaves: Leave[] = teamLeavesResp.data.filter((l: Leave) => {
                const start = new Date(l.start_date);
                return l.user_id !== user.id && l.status === 'Approved' && start >= today && start <= nextWeek;
            });

            const nextHoliday = holidays.find((h) => new Date(h.date) >= new Date());

            const approvedLeaves = leaves.filter((l) => l.status === 'Approved');
            let totalAllocated = 0;
            let totalUsed = 0;
            const leaveTypeBreakdown: { type: string; allocated: number; used: number }[] = [];

            const isProbationActive = () => {
                if (!user.joining_date || !user.probation_period) return false;
                const joiningDate = new Date(user.joining_date);
                const probationEndDate = new Date(joiningDate);
                probationEndDate.setMonth(probationEndDate.getMonth() + parseInt(String(user.probation_period), 10));
                return new Date() < probationEndDate;
            };

            const currentYear = new Date().getFullYear();
            leaveAllocations.forEach((alloc) => {
                const typeName = alloc.type.toLowerCase();
                const isEarned = typeName.includes('earned') || typeName.includes('paid');
                if (isProbationActive() && isEarned) return;

                const days = parseInt(String(alloc.days), 10) || 0;
                totalAllocated += days;

                const typeLeaves = approvedLeaves.filter(
                    (l) => l.type.toLowerCase() === alloc.type.toLowerCase() && new Date(l.start_date).getFullYear() === currentYear
                );
                const usedForType = typeLeaves.reduce((sum, l) => {
                    if (Number(l.is_half_day) === 1) return sum + 0.5;
                    const diffDays = Math.ceil((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / 86400000) + 1;
                    return sum + (isNaN(diffDays) ? 1 : diffDays);
                }, 0);
                totalUsed += usedForType;
                leaveTypeBreakdown.push({ type: alloc.type.charAt(0).toUpperCase() + alloc.type.slice(1), allocated: days, used: usedForType });
            });

            setStats({
                totalAvailable: totalAllocated - totalUsed,
                totalAllocated,
                lastLeave: pastLeaves[0] || null,
                teamLeaves: thisWeekLeaves,
                nextHoliday: nextHoliday || null,
                holidays,
                directory,
                leaveTypeBreakdown,
                attendanceRules: globalSettings.attendance_rules,
            });
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <PageSpinner />;

    const quickActions: QuickActionItem[] = [
        { to: '/leaves', icon: <CalendarClock size={22} />, label: 'Apply for Leave' },
        { to: '/cancellation', icon: <XSquare size={22} />, label: 'Cancel a Leave' },
    ];

    return (
        <Box className="fade-in" sx={{ maxWidth: 1200, mx: 'auto' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} sx={{ mb: 4 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar src={user.profile_photo ?? undefined} sx={{ width: 52, height: 52, fontWeight: 700 }}>
                        {user.name.charAt(0)}
                    </Avatar>
                    <Box>
                        <Typography variant="h4" sx={{ fontSize: '1.6rem' }}>Welcome, {user.name}</Typography>
                        <Typography variant="body2" color="text.secondary">Here's your leave summary for today.</Typography>
                    </Box>
                </Stack>
                <Chip
                    label={new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
                    sx={{ fontWeight: 600 }}
                />
            </Stack>

            {hasPermission('attendance.checkin') && isAttendanceRequired(stats.attendanceRules, user.role) && (
                <Box sx={{ mb: 3 }}>
                    <TodayAttendanceCard />
                </Box>
            )}

            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <Box component={Link} to="/leaves" sx={{ textDecoration: 'none', display: 'block' }}>
                        <StatCard label="Leaves Available" value={stats.totalAvailable} icon={<Briefcase size={22} />} color="primary" />
                    </Box>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard label="Last Leave Taken" value={stats.lastLeave ? stats.lastLeave.type : 'N/A'} icon={<UserCheck size={22} />} color="success" />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard label="Team Out This Week" value={stats.teamLeaves.length} icon={<Calendar size={22} />} color="warning" />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <Box component={Link} to="/holidays" sx={{ textDecoration: 'none', display: 'block' }}>
                        <StatCard label="Next Holiday" value={stats.nextHoliday ? stats.nextHoliday.name : 'None upcoming'} icon={<Sun size={22} />} color="error" />
                    </Box>
                </Grid>
            </Grid>

            <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <LeaveAllocationChart data={stats.leaveTypeBreakdown} />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Card sx={{ p: 3, height: '100%' }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>Team Presence (Next 7 Days)</Typography>
                        {stats.teamLeaves.length === 0 ? (
                            <EmptyState title="No colleagues on leave" description="Nobody on your team is scheduled to be out this week." />
                        ) : (
                            <Stack spacing={1.5}>
                                {stats.teamLeaves.map((leave) => (
                                    <Stack key={leave.id} direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{leave.user_name}</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {leave.type ? leave.type.charAt(0).toUpperCase() + leave.type.slice(1) : 'Unknown'} Leave {leave.is_half_day ? '(Half Day)' : ''}
                                            </Typography>
                                        </Box>
                                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                            {new Date(leave.start_date).toLocaleDateString()} – {new Date(leave.end_date).toLocaleDateString()}
                                        </Typography>
                                    </Stack>
                                ))}
                            </Stack>
                        )}
                    </Card>
                </Grid>
            </Grid>

            <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
                <Grid size={{ xs: 12, md: 4 }}>
                    <CelebrationsCard users={stats.directory} />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <HolidayTimelineCard holidays={stats.holidays} />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <AnnouncementsCard />
                </Grid>
            </Grid>

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

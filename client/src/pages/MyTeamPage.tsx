import { useState, useEffect, useMemo } from 'react';
import { Box, Card, Grid2 as Grid } from '@mui/material';
import { Users, UserMinus, Calendar } from 'lucide-react';
import { getUsers, getLeaves } from '../api';
import OrgTree from '../components/OrgTree';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, EmptyState, PageSpinner, StatCard } from '../components/ui';
import type { AuthUser } from '../types';

interface TeamUser { id: number; name: string; role: string; department_id?: number | null; manager_id?: number | string | null; profile_photo?: string | null; joining_date?: string | null }
interface Leave { user_id: number; status: string; start_date: string; end_date: string }

export default function MyTeamPage() {
    const { user, hasAnyPermission } = useAuth() as { user: AuthUser } & ReturnType<typeof useAuth>;
    const [departmentUsers, setDepartmentUsers] = useState<TeamUser[]>([]);
    const [leaves, setLeaves] = useState<Leave[]>([]);
    const [loading, setLoading] = useState(true);

    // A plain employee only holds leaves.view.own — the server silently
    // scopes any leaves fetch down to just their own records regardless of
    // the departmentId filter, so "On Leave Today" would quietly become
    // "am I on leave" for them. Only show it where the number is actually
    // team-wide.
    const canSeeTeamLeaves = hasAnyPermission(['leaves.view.team', 'leaves.view.all']);

    useEffect(() => {
        fetchTeam();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user.id]);

    const fetchTeam = async () => {
        try {
            const [usersResp, leavesResp] = await Promise.all([
                getUsers('all'),
                canSeeTeamLeaves ? getLeaves(user.department_id ?? undefined) : Promise.resolve({ data: [] }),
            ]);
            setDepartmentUsers(usersResp.data.filter((u: TeamUser) => u.department_id === user.department_id));
            setLeaves(leavesResp.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const todayStr = new Date().toISOString().split('T')[0];
    const onLeaveToday = useMemo(
        () => leaves.filter((l) => l.status === 'Approved' && todayStr >= l.start_date && todayStr <= l.end_date).length,
        [leaves, todayStr],
    );
    const avgTenureYears = useMemo(() => {
        const withDates = departmentUsers.filter((u) => u.joining_date);
        if (withDates.length === 0) return 0;
        const totalYears = withDates.reduce((sum, u) => sum + (Date.now() - new Date(u.joining_date!).getTime()) / (365.25 * 86400000), 0);
        return Math.round((totalYears / withDates.length) * 10) / 10;
    }, [departmentUsers]);

    if (loading) return <PageSpinner />;

    return (
        <Box className="fade-in" sx={{ maxWidth: 1400, mx: 'auto' }}>
            <PageHeader title="My Team" subtitle={`Visual reporting hierarchy for the ${user.department_name || 'your'} department`} />

            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, sm: canSeeTeamLeaves ? 4 : 6 }}>
                    <StatCard label="Team Size" value={departmentUsers.length} icon={<Users size={20} />} color="primary" />
                </Grid>
                {canSeeTeamLeaves && (
                    <Grid size={{ xs: 6, sm: 4 }}>
                        <StatCard label="On Leave Today" value={onLeaveToday} icon={<UserMinus size={20} />} color="warning" />
                    </Grid>
                )}
                <Grid size={{ xs: 12, sm: canSeeTeamLeaves ? 4 : 6 }}>
                    <StatCard label="Avg. Tenure" value={`${avgTenureYears} yrs`} icon={<Calendar size={20} />} color="info" />
                </Grid>
            </Grid>

            <Card sx={{ p: { xs: 1.5, sm: 3 }, minHeight: 500, display: 'flex', flexDirection: 'column' }}>
                {departmentUsers.length === 0 ? (
                    <EmptyState
                        icon={<Users size={28} />}
                        title="Department data not found"
                        description="We couldn't retrieve the organizational structure for your team."
                    />
                ) : (
                    <OrgTree users={departmentUsers} hideActions />
                )}
            </Card>
        </Box>
    );
}

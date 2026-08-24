import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { Grid2 as Grid } from '@mui/material';
import { Building2, CheckCircle2, Clock, Ban, Users, UserCheck, TrendingUp, UserPlus } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { PageHeader, StatCard, CardSkeletonGrid } from '../../components/ui';
import { getDashboardKpis, type DashboardKpis } from '../api/companies';
import { getErrorMessage } from '../../types';

// High-level business KPIs only (Part 1) — deliberately no attendance,
// leave or payroll figures; the Platform Administrator is not an HR user.
export default function DashboardPage() {
    const { enqueueSnackbar } = useSnackbar();
    const [kpis, setKpis] = useState<DashboardKpis | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await getDashboardKpis();
                setKpis(data);
            } catch (err) {
                enqueueSnackbar(getErrorMessage(err, 'Failed to load dashboard'), { variant: 'error' });
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <Box>
            <PageHeader title="Dashboard" subtitle="Platform-wide business overview" />

            {loading || !kpis ? (
                <CardSkeletonGrid count={8} />
            ) : (
                <Grid container spacing={2.5}>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatCard label="Total Companies" value={kpis.totalCompanies} icon={<Building2 size={22} />} color="primary" />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatCard label="Active Companies" value={kpis.activeCompanies} icon={<CheckCircle2 size={22} />} color="success" />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatCard label="Trial Companies" value={kpis.trialCompanies} icon={<Clock size={22} />} color="warning" />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatCard label="Suspended Companies" value={kpis.suspendedCompanies} icon={<Ban size={22} />} color="error" />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatCard label="Total Employees" value={kpis.totalEmployees} icon={<Users size={22} />} color="primary" />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatCard label="Total Active Users" value={kpis.totalActiveUsers} icon={<UserCheck size={22} />} color="info" />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatCard label="New Companies (Month)" value={kpis.newCompaniesThisMonth} icon={<TrendingUp size={22} />} color="success" />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <StatCard label="New Employees (Month)" value={kpis.newEmployeesThisMonth} icon={<UserPlus size={22} />} color="info" />
                    </Grid>
                </Grid>
            )}
        </Box>
    );
}

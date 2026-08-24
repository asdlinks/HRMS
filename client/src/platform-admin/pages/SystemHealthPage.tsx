import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { Grid2 as Grid } from '@mui/material';
import { Database, Server, Clock3, HardDrive, Building2, AlertTriangle } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { PageHeader, StatCard, CardSkeletonGrid } from '../../components/ui';
import { getSystemHealth, type SystemHealth } from '../api/companies';
import { getErrorMessage } from '../../types';

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }
    return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatUptime(seconds: number) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours < 1) return `${minutes}m`;
    const days = Math.floor(hours / 24);
    if (days < 1) return `${hours}h ${minutes}m`;
    return `${days}d ${hours % 24}h`;
}

// Concise, honest snapshot (Part 8) — "Background Jobs" reports the true
// state (no scheduler exists in this codebase yet) rather than fabricating
// job infrastructure.
export default function SystemHealthPage() {
    const { enqueueSnackbar } = useSnackbar();
    const [health, setHealth] = useState<SystemHealth | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await getSystemHealth();
                setHealth(data);
            } catch (err) {
                enqueueSnackbar(getErrorMessage(err, 'Failed to load system health'), { variant: 'error' });
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <Box>
            <PageHeader title="System Health" subtitle="At-a-glance platform infrastructure status" />

            {loading || !health ? (
                <CardSkeletonGrid count={6} />
            ) : (
                <Grid container spacing={2.5}>
                    <Grid size={{ xs: 6, sm: 4 }}>
                        <StatCard
                            label="Database Status"
                            value={`${health.database.status === 'ok' ? 'Healthy' : 'Down'} (${health.database.latencyMs}ms)`}
                            icon={<Database size={22} />}
                            color={health.database.status === 'ok' ? 'success' : 'error'}
                        />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 4 }}>
                        <StatCard
                            label="API Status"
                            value={`Healthy (${formatUptime(health.api.uptimeSeconds)} up)`}
                            icon={<Server size={22} />}
                            color="success"
                        />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 4 }}>
                        <StatCard label="Background Jobs" value={health.backgroundJobs.message} icon={<Clock3 size={22} />} color="info" />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 4 }}>
                        <StatCard label="Storage Usage" value={formatBytes(health.storageUsedBytes)} icon={<HardDrive size={22} />} color="primary" />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 4 }}>
                        <StatCard label="Active Tenants" value={health.activeTenants} icon={<Building2 size={22} />} color="primary" />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 4 }}>
                        <StatCard label="Failed Scheduled Jobs" value={health.backgroundJobs.failedJobs} icon={<AlertTriangle size={22} />} color="warning" />
                    </Grid>
                </Grid>
            )}
        </Box>
    );
}

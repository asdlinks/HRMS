import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Grid2 as Grid, Card, CardActionArea, Stack, Typography } from '@mui/material';
import {
    Users, UserCheck, UserX, CalendarClock, Clock, Timer, Wallet,
    Cake, PartyPopper, UserPlus, LogOut, ListChecks, ClipboardList,
    Network, ShieldCheck, FileSearch, ChevronRight,
} from 'lucide-react';
import { PageHeader, StatCard, PageSpinner } from '../../components/ui';
import ReportsNav from '../../components/reports/ReportsNav';
import ReportChart from '../../components/reports/ReportChart';
import {
    getDashboardSummary, getReportCatalog, getReportData,
    type DashboardSummary, type ReportCatalogEntry, type ReportChartConfig,
} from '../../api/reports';

const KPI_CARDS: { key: keyof DashboardSummary; label: string; icon: ReactNode; color: 'primary' | 'success' | 'warning' | 'error' | 'info'; format?: (v: number) => string }[] = [
    { key: 'totalEmployees', label: 'Total Employees', icon: <Users size={20} />, color: 'primary' },
    { key: 'presentToday', label: 'Present Today', icon: <UserCheck size={20} />, color: 'success' },
    { key: 'absentToday', label: 'Absent Today', icon: <UserX size={20} />, color: 'error' },
    { key: 'onLeave', label: 'On Leave', icon: <CalendarClock size={20} />, color: 'warning' },
    { key: 'lateArrivals', label: 'Late Arrivals', icon: <Clock size={20} />, color: 'warning' },
    { key: 'overtimeHours', label: 'Overtime Hours (MTD)', icon: <Timer size={20} />, color: 'info' },
    { key: 'monthlyPayrollCost', label: 'Monthly Payroll Cost', icon: <Wallet size={20} />, color: 'primary', format: (v) => `₹${v.toLocaleString('en-IN')}` },
    { key: 'upcomingBirthdays', label: 'Upcoming Birthdays', icon: <Cake size={20} />, color: 'info' },
    { key: 'upcomingAnniversaries', label: 'Upcoming Anniversaries', icon: <PartyPopper size={20} />, color: 'info' },
    { key: 'newJoiners', label: 'New Joiners (MTD)', icon: <UserPlus size={20} />, color: 'success' },
    { key: 'employeesExited', label: 'Employees Exited (MTD)', icon: <LogOut size={20} />, color: 'error' },
    { key: 'pendingApprovals', label: 'Pending Approvals', icon: <ListChecks size={20} />, color: 'warning' },
];

// Each trend chart reuses an EXISTING catalog report id/chart config rather
// than a bespoke dashboard-only query — 403s (role lacks that category) are
// swallowed so the chart simply doesn't render, same narrowing behavior as
// the KPI grid below.
const TREND_CHARTS: { reportId: string; title: string }[] = [
    { reportId: 'attendance-trend', title: 'Attendance Trend' },
    { reportId: 'leave-trends', title: 'Leave Trend' },
    { reportId: 'payroll-variance', title: 'Payroll Trend' },
    { reportId: 'org-organization-growth', title: 'Employee Growth' },
    { reportId: 'org-department-summary', title: 'Department Distribution' },
    { reportId: 'org-work-mode-summary', title: 'Work Mode Distribution' },
    { reportId: 'org-shift-summary', title: 'Shift Distribution' },
];

const WORKSPACE_LINKS: Record<string, { label: string; icon: ReactNode; path: string }> = {
    employee: { label: 'Employees', icon: <Users size={18} />, path: '/reports/employees' },
    attendance: { label: 'Attendance', icon: <ClipboardList size={18} />, path: '/reports/attendance' },
    leave: { label: 'Leave', icon: <CalendarClock size={18} />, path: '/reports/leave' },
    payroll: { label: 'Payroll', icon: <Wallet size={18} />, path: '/reports/payroll' },
    organization: { label: 'Organization', icon: <Network size={18} />, path: '/reports/organization' },
    compliance: { label: 'Compliance', icon: <ShieldCheck size={18} />, path: '/reports/compliance' },
    audit: { label: 'Audit', icon: <FileSearch size={18} />, path: '/reports/audit' },
};
const WORKSPACE_ORDER = ['employee', 'attendance', 'leave', 'payroll', 'organization', 'compliance', 'audit'];

interface TrendChartData {
    reportId: string;
    title: string;
    config: ReportChartConfig;
    rows: Record<string, unknown>[];
}

// Executive Dashboard — the Analytics Center's landing page. KPIs first,
// visual trends second, then a hub of links into the full workspaces —
// business insight before detail, per the Analytics Center design goals.
export default function ReportsDashboard() {
    const navigate = useNavigate();
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [catalog, setCatalog] = useState<ReportCatalogEntry[]>([]);
    const [trends, setTrends] = useState<TrendChartData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([getDashboardSummary(), getReportCatalog()])
            .then(([s, c]) => { setSummary(s.data); setCatalog(c.data); })
            .catch(() => setSummary({}))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (catalog.length === 0) return;
        let cancelled = false;
        Promise.all(TREND_CHARTS.map(({ reportId, title }) => {
            const entry = catalog.find((c) => c.id === reportId);
            if (!entry || !entry.chart || entry.stub) return Promise.resolve(null);
            return getReportData(reportId, {}).then((r) => ({ reportId, title, config: entry.chart!, rows: r.data.rows }))
                .catch(() => null);
        })).then((results) => {
            if (!cancelled) setTrends(results.filter((r): r is TrendChartData => r !== null));
        });
        return () => { cancelled = true; };
    }, [catalog]);

    const visibleCards = KPI_CARDS.filter((c) => summary && summary[c.key] !== undefined);
    const availableWorkspaces = useMemo(() => {
        const present = new Set(catalog.map((r) => r.category));
        return WORKSPACE_ORDER.filter((c) => present.has(c));
    }, [catalog]);

    return (
        <Box className="fade-in" sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
            <ReportsNav />
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <PageHeader title="Executive Dashboard" subtitle="A live snapshot across employees, attendance, leave and payroll" />
                {loading ? <PageSpinner /> : (
                    <>
                        {visibleCards.length > 0 && (
                            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                                {visibleCards.map((c) => (
                                    <Grid key={c.key} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                                        <StatCard
                                            label={c.label}
                                            value={c.format ? c.format(summary![c.key] as number) : summary![c.key]}
                                            icon={c.icon}
                                            color={c.color}
                                        />
                                    </Grid>
                                ))}
                            </Grid>
                        )}

                        {trends.length > 0 && (
                            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                                {trends.map((t) => (
                                    <Grid key={t.reportId} size={{ xs: 12, md: 6 }}>
                                        <ReportChart config={t.config} rows={t.rows} title={t.title} />
                                    </Grid>
                                ))}
                            </Grid>
                        )}

                        {availableWorkspaces.length > 0 && (
                            <>
                                <Typography variant="h6" sx={{ mb: 1.5 }}>Analytics Workspaces</Typography>
                                <Grid container spacing={2}>
                                    {availableWorkspaces.map((cat) => {
                                        const w = WORKSPACE_LINKS[cat];
                                        return (
                                            <Grid key={cat} size={{ xs: 12, sm: 6, md: 3 }}>
                                                <Card>
                                                    <CardActionArea onClick={() => navigate(w.path)} sx={{ p: 2 }}>
                                                        <Stack direction="row" alignItems="center" spacing={1.5}>
                                                            {w.icon}
                                                            <Typography sx={{ flex: 1, fontWeight: 600 }}>{w.label}</Typography>
                                                            <ChevronRight size={16} />
                                                        </Stack>
                                                    </CardActionArea>
                                                </Card>
                                            </Grid>
                                        );
                                    })}
                                </Grid>
                            </>
                        )}
                    </>
                )}
            </Box>
        </Box>
    );
}

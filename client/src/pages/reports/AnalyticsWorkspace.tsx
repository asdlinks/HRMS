import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Box, Chip, Stack, TextField, InputAdornment, Grid2 as Grid,
} from '@mui/material';
import {
    Search, Star, Users, UserCheck, UserX, CalendarClock, Clock, Timer,
    Wallet, Cake, PartyPopper, UserPlus, LogOut, ListChecks,
} from 'lucide-react';
import { PageHeader, StatCard, PageSpinner, EmptyState } from '../../components/ui';
import ReportsNav from '../../components/reports/ReportsNav';
import ReportPanel from '../../components/reports/ReportPanel';
import {
    getReportCatalog, getFavoriteReportIds, getDashboardSummary,
    type ReportCatalogEntry, type DashboardSummary,
} from '../../api/reports';

const CATEGORY_TITLE: Record<string, string> = {
    employee: 'Employee Analytics',
    attendance: 'Attendance Analytics',
    leave: 'Leave Analytics',
    payroll: 'Payroll Analytics',
    organization: 'Organization Analytics',
    compliance: 'Compliance Analytics',
    audit: 'Audit Analytics',
};

const CATEGORY_SUBTITLE: Record<string, string> = {
    employee: 'Roster, headcount, joiners/exits and demographic breakdowns',
    attendance: 'Daily/monthly attendance, exceptions, work modes and overtime',
    leave: 'Requests, balances, approvals and utilization trends',
    payroll: 'Payroll cost, salary registers and department breakdowns',
    organization: 'Structural headcount across branches, departments, shifts and work modes',
    compliance: 'Statutory reports — on the roadmap',
    audit: 'System audit trail — on the roadmap',
};

// Which report id a workspace opens by default (its most common/entry-point report).
const DEFAULT_REPORT_ID: Record<string, string> = {
    employee: 'employee-master',
    attendance: 'attendance-daily',
    leave: 'leave-summary',
    payroll: 'payroll-summary',
    organization: 'org-branch-summary',
    compliance: 'compliance-overview',
    audit: 'audit-trail',
};

// Employee-category summary reports carry both an id field and a name field
// per row (see employeeReports.registry.js's summaryColumns helper) — enough
// to drill down into Employee Master pre-filtered by whatever bar was
// clicked, without guessing at fields other reports may not expose.
const DRILL_DOWN_TARGETS: Record<string, { idField: string; filterKey: string }> = {
    'department-summary': { idField: 'department_id', filterKey: 'departmentId' },
    'branch-summary': { idField: 'branch_id', filterKey: 'branchId' },
    'designation-summary': { idField: 'designation_id', filterKey: 'designationId' },
    'employment-type-summary': { idField: 'employment_type_id', filterKey: 'employmentTypeId' },
};

interface KpiDef {
    key: keyof DashboardSummary;
    label: string;
    icon: ReactNode;
    color: 'primary' | 'success' | 'warning' | 'error' | 'info';
    format?: (v: number) => string;
}

const KPI_BY_CATEGORY: Record<string, KpiDef[]> = {
    employee: [
        { key: 'totalEmployees', label: 'Total Employees', icon: <Users size={20} />, color: 'primary' },
        { key: 'newJoiners', label: 'New Joiners (MTD)', icon: <UserPlus size={20} />, color: 'success' },
        { key: 'employeesExited', label: 'Employees Exited (MTD)', icon: <LogOut size={20} />, color: 'error' },
        { key: 'upcomingBirthdays', label: 'Upcoming Birthdays', icon: <Cake size={20} />, color: 'info' },
        { key: 'upcomingAnniversaries', label: 'Upcoming Anniversaries', icon: <PartyPopper size={20} />, color: 'info' },
    ],
    attendance: [
        { key: 'presentToday', label: 'Present Today', icon: <UserCheck size={20} />, color: 'success' },
        { key: 'absentToday', label: 'Absent Today', icon: <UserX size={20} />, color: 'error' },
        { key: 'lateArrivals', label: 'Late Arrivals', icon: <Clock size={20} />, color: 'warning' },
        { key: 'overtimeHours', label: 'Overtime Hours (MTD)', icon: <Timer size={20} />, color: 'info' },
    ],
    leave: [
        { key: 'onLeave', label: 'On Leave Today', icon: <CalendarClock size={20} />, color: 'warning' },
        { key: 'pendingApprovals', label: 'Pending Approvals', icon: <ListChecks size={20} />, color: 'warning' },
    ],
    payroll: [
        { key: 'monthlyPayrollCost', label: 'Monthly Payroll Cost', icon: <Wallet size={20} />, color: 'primary', format: (v) => `₹${v.toLocaleString('en-IN')}` },
    ],
    organization: [],
    compliance: [],
    audit: [],
};

interface AnalyticsWorkspaceProps {
    category: string;
}

// One page for every non-Dashboard workspace (Employees/Attendance/Leave/
// Payroll/Organization/Compliance/Audit) — a KPI strip, a chip strip that
// switches between the category's reports via a `?report=` query param
// (no page navigation), and the shared ReportPanel underneath. Replaces
// what used to be a dedicated nav entry + full page per report.
export default function AnalyticsWorkspace({ category }: AnalyticsWorkspaceProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const [catalog, setCatalog] = useState<ReportCatalogEntry[]>([]);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [chipSearch, setChipSearch] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.all([getReportCatalog(), getFavoriteReportIds(), getDashboardSummary()])
            .then(([c, f, s]) => { setCatalog(c.data); setFavorites(f.data); setSummary(s.data); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const reports = useMemo(() => catalog.filter((r) => r.category === category), [catalog, category]);

    const reportId = searchParams.get('report') || DEFAULT_REPORT_ID[category] || reports[0]?.id;
    const entry = useMemo(() => reports.find((r) => r.id === reportId) || reports[0] || null, [reports, reportId]);

    // Everything in the URL except `report` itself is treated as an initial
    // filter set — how a drill-down or a saved-filter "open" pre-fills
    // ReportPanel's filters (e.g. ?report=employee-master&departmentId=3).
    const initialFilters = useMemo(() => {
        const f: Record<string, string> = {};
        searchParams.forEach((v, k) => { if (k !== 'report') f[k] = v; });
        return f;
    }, [searchParams]);

    const visibleChips = useMemo(() => {
        const q = chipSearch.trim().toLowerCase();
        const filtered = q ? reports.filter((r) => r.title.toLowerCase().includes(q)) : reports;
        return [...filtered].sort((a, b) => {
            const favA = favorites.includes(a.id) ? 0 : 1;
            const favB = favorites.includes(b.id) ? 0 : 1;
            return favA - favB;
        });
    }, [reports, chipSearch, favorites]);

    const selectReport = (id: string) => {
        const next = new URLSearchParams();
        next.set('report', id);
        setSearchParams(next);
    };

    const kpis = (KPI_BY_CATEGORY[category] || []).filter((k) => summary && summary[k.key] !== undefined);

    const drillDownFor = (row: Record<string, unknown>) => {
        if (!entry) return;
        const target = DRILL_DOWN_TARGETS[entry.id];
        if (!target) return;
        const value = row[target.idField];
        if (value === undefined || value === null) return;
        const next = new URLSearchParams();
        next.set('report', 'employee-master');
        next.set(target.filterKey, String(value));
        setSearchParams(next);
    };

    return (
        <Box className="fade-in" sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
            <ReportsNav />
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <PageHeader title={CATEGORY_TITLE[category] || category} subtitle={CATEGORY_SUBTITLE[category]} />

                {loading ? <PageSpinner /> : (
                    <>
                        {kpis.length > 0 && (
                            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                                {kpis.map((k) => (
                                    <Grid key={k.key} size={{ xs: 12, sm: 6, md: 3 }}>
                                        <StatCard label={k.label} value={k.format ? k.format(summary![k.key] as number) : summary![k.key]} icon={k.icon} color={k.color} />
                                    </Grid>
                                ))}
                            </Grid>
                        )}

                        {reports.length === 0 ? (
                            <EmptyState title="No reports available" description="You don't have access to any reports in this workspace." />
                        ) : (
                            <>
                                {reports.length > 1 && (
                                    <Box sx={{ mb: 2.5 }}>
                                        {reports.length > 8 && (
                                            <TextField
                                                size="small" placeholder="Search reports in this workspace…" value={chipSearch}
                                                onChange={(e) => setChipSearch(e.target.value)}
                                                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> } }}
                                                sx={{ mb: 1.5, width: { xs: '100%', sm: 320 } }}
                                            />
                                        )}
                                        <Stack direction="row" flexWrap="wrap" gap={1}>
                                            {visibleChips.map((r) => (
                                                <Chip
                                                    key={r.id}
                                                    label={r.title}
                                                    onClick={() => selectReport(r.id)}
                                                    color={r.id === entry?.id ? 'primary' : 'default'}
                                                    variant={r.id === entry?.id ? 'filled' : 'outlined'}
                                                    icon={favorites.includes(r.id) ? <Star size={13} fill="currentColor" /> : undefined}
                                                    sx={{ opacity: r.stub ? 0.6 : 1, fontWeight: 600 }}
                                                />
                                            ))}
                                        </Stack>
                                    </Box>
                                )}

                                {entry && (
                                    <ReportPanel
                                        key={`${entry.id}:${JSON.stringify(initialFilters)}`}
                                        entry={entry}
                                        initialFilters={initialFilters}
                                        showHeader={reports.length === 1}
                                        onDrillDown={DRILL_DOWN_TARGETS[entry.id] ? drillDownFor : undefined}
                                    />
                                )}
                            </>
                        )}
                    </>
                )}
            </Box>
        </Box>
    );
}

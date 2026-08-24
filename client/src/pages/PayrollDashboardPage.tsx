import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Card, Grid2 as Grid, Typography } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, Wallet, Clock, FileText, Receipt } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getPayrollSummary, getPayrollTrend, getPayrollRuns, getOvertimeEntries, getPayslips } from '../api';
import { PageHeader, StatCard, PageSpinner, DataTable, EmptyState } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { chartPalette } from '../theme/palette';
import { getErrorMessage } from '../types';
import type { GridColDef } from '@mui/x-data-grid';

interface Summary { employee_count: number; total_gross: number; total_net: number }
interface TrendRow { period_year: number; period_month: number; total_net: number }
interface RunRow { id: number; period_year: number; period_month: number; status: string; employee_count: number }
interface PayslipRow { run_line_id: number; period_year: number; period_month: number; net_pay: number; is_published: boolean }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function PayrollDashboardPage() {
    const { enqueueSnackbar } = useSnackbar();
    const { hasPermission } = useAuth();
    const isOrgView = hasPermission('payroll.view.all');
    const canApprove = hasPermission('payroll.overtime.approve');
    const [loading, setLoading] = useState(true);

    const [summary, setSummary] = useState<Summary | null>(null);
    const [trend, setTrend] = useState<TrendRow[]>([]);
    const [runs, setRuns] = useState<RunRow[]>([]);
    const [pendingOt, setPendingOt] = useState(0);
    const [myPayslips, setMyPayslips] = useState<PayslipRow[]>([]);

    useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAll = async () => {
        const now = new Date();
        try {
            if (isOrgView) {
                const [summaryResp, trendResp, runsResp] = await Promise.all([
                    getPayrollSummary(now.getFullYear(), now.getMonth() + 1),
                    getPayrollTrend(6),
                    getPayrollRuns(),
                ]);
                setSummary(summaryResp.data);
                setTrend([...trendResp.data].reverse());
                setRuns(runsResp.data.slice(0, 5));
            }
            if (canApprove) {
                const otResp = await getOvertimeEntries('Pending');
                setPendingOt(otResp.data.length);
            }
            if (!isOrgView) {
                const payslipResp = await getPayslips();
                setMyPayslips(payslipResp.data.slice(0, 5));
            }
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load payroll dashboard'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const runColumns: GridColDef<RunRow>[] = [
        { field: 'period', headerName: 'Period', flex: 1, valueGetter: (_v, row) => `${MONTH_NAMES[row.period_month - 1]} ${row.period_year}` },
        { field: 'status', headerName: 'Status', width: 130 },
        { field: 'employee_count', headerName: 'Employees', width: 110 },
    ];
    const payslipColumns: GridColDef<PayslipRow>[] = [
        { field: 'period', headerName: 'Period', flex: 1, valueGetter: (_v, row) => `${MONTH_NAMES[row.period_month - 1]} ${row.period_year}` },
        { field: 'net_pay', headerName: 'Net Pay', width: 130, valueFormatter: (v: number) => v?.toLocaleString() },
        { field: 'is_published', headerName: 'Status', width: 110, valueFormatter: (v: boolean) => (v ? 'Paid' : 'Pending') },
    ];

    if (loading) return <PageSpinner />;

    return (
        <Box className="fade-in" sx={{ maxWidth: 1400, mx: 'auto' }}>
            <PageHeader title="Payroll" subtitle={isOrgView ? 'Organization-wide payroll overview.' : 'Your payroll at a glance.'} />

            {isOrgView ? (
                <>
                    <Grid container spacing={2.5} sx={{ mb: 3 }}>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Box component={Link} to="/payroll/reports" sx={{ textDecoration: 'none', display: 'block' }}>
                                <StatCard label="Employees Paid (This Month)" value={summary?.employee_count ?? 0} icon={<Users size={22} />} color="primary" />
                            </Box>
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Box component={Link} to="/payroll/reports" sx={{ textDecoration: 'none', display: 'block' }}>
                                <StatCard label="Net Payroll (This Month)" value={(summary?.total_net ?? 0).toLocaleString()} icon={<Wallet size={22} />} color="success" />
                            </Box>
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Box component={Link} to="/payroll/overtime" sx={{ textDecoration: 'none', display: 'block' }}>
                                <StatCard label="Pending Overtime Approvals" value={pendingOt} icon={<Clock size={22} />} color="warning" />
                            </Box>
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Box component={Link} to="/payroll/runs" sx={{ textDecoration: 'none', display: 'block' }}>
                                <StatCard label="Payroll Runs" value={runs.length} icon={<FileText size={22} />} color="info" />
                            </Box>
                        </Grid>
                    </Grid>

                    <Grid container spacing={3}>
                        <Grid size={{ xs: 12, md: 7 }}>
                            <Card sx={{ p: 3 }}>
                                <Typography variant="h6" sx={{ mb: 2 }}>Net Payroll Cost — Last 6 Months</Typography>
                                {trend.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">No processed payroll history yet.</Typography>
                                ) : (
                                    <ResponsiveContainer width="100%" height={260}>
                                        <LineChart data={trend.map((t) => ({ label: `${MONTH_SHORT[t.period_month - 1]} ${t.period_year}`, net: Number(t.total_net) }))}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                                            <YAxis tick={{ fontSize: 12 }} />
                                            <Tooltip />
                                            <Line type="monotone" dataKey="net" stroke={chartPalette[0]} strokeWidth={2} dot={{ r: 3 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                )}
                            </Card>
                        </Grid>
                        <Grid size={{ xs: 12, md: 5 }}>
                            <Card sx={{ p: 3 }}>
                                <Typography variant="h6" sx={{ mb: 2 }}>Recent Payroll Runs</Typography>
                                <DataTable rows={runs} columns={runColumns} hideFooter emptyTitle="No payroll runs yet" />
                            </Card>
                        </Grid>
                    </Grid>
                </>
            ) : (
                <Card sx={{ p: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>My Recent Payslips</Typography>
                    {myPayslips.length === 0 ? (
                        <EmptyState icon={<Receipt size={28} />} title="No payslips yet" description="Your payslips will appear here once payroll has been processed and paid." />
                    ) : (
                        <DataTable rows={myPayslips} columns={payslipColumns} getRowId={(r) => r.run_line_id} hideFooter />
                    )}
                    <Box sx={{ mt: 2 }}>
                        <Typography component={Link} to="/payroll/payslips" variant="body2" color="primary" sx={{ textDecoration: 'none', fontWeight: 600 }}>
                            View full payroll history →
                        </Typography>
                    </Box>
                </Card>
            )}
        </Box>
    );
}

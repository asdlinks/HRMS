import { useEffect, useState } from 'react';
import { Box, Card, Grid2 as Grid, FormControl, InputLabel, Select, MenuItem, Typography } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { getPayrollSummary, getPayrollComponentBreakdown, getDepartments } from '../api';
import { PageHeader, StatCard, PageSpinner } from '../components/ui';
import { chartPalette, semantic } from '../theme/palette';
import { getErrorMessage } from '../types';

interface Summary { employee_count: number; total_gross: number; total_deductions: number; total_net: number; total_lop_days: number; total_ot_amount: number }
interface ComponentBreakdownRow { component_code: string; component_name: string; component_type: 'earning' | 'deduction'; total_amount: number }
interface Department { id: number; name: string }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PayrollReportsPage() {
    const { enqueueSnackbar } = useSnackbar();
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [departmentId, setDepartmentId] = useState<string>('all');
    const [departments, setDepartments] = useState<Department[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [breakdown, setBreakdown] = useState<ComponentBreakdownRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { getDepartments().then((r) => setDepartments(r.data)).catch(() => {}); }, []);
    useEffect(() => { fetchData(); }, [year, month, departmentId]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchData = async () => {
        setLoading(true);
        try {
            const [summaryResp, breakdownResp] = await Promise.all([
                getPayrollSummary(year, month, departmentId === 'all' ? undefined : departmentId),
                getPayrollComponentBreakdown(year, month),
            ]);
            setSummary(summaryResp.data);
            setBreakdown(breakdownResp.data);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to load payroll reports'), { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const chartData = breakdown.map((b) => ({ name: b.component_name, amount: Number(b.total_amount), type: b.component_type }));

    return (
        <Box className="fade-in" sx={{ maxWidth: 1300, mx: 'auto' }}>
            <PageHeader title="Payroll Reports" subtitle="Cost summary and component breakdown for a pay period." />

            <Card sx={{ p: 2, mb: 3 }}>
                <Grid container spacing={2}>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Month</InputLabel>
                            <Select label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                                {MONTH_NAMES.map((m, i) => <MenuItem key={m} value={i + 1}>{m}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Year</InputLabel>
                            <Select label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Department</InputLabel>
                            <Select label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                                <MenuItem value="all">All Departments</MenuItem>
                                {departments.map((d) => <MenuItem key={d.id} value={String(d.id)}>{d.name}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                </Grid>
            </Card>

            {loading ? <PageSpinner /> : (
                <>
                    <Grid container spacing={2.5} sx={{ mb: 3 }}>
                        <Grid size={{ xs: 6, sm: 3 }}><StatCard label="Employees Paid" value={summary?.employee_count ?? 0} icon={<Users size={22} />} color="primary" /></Grid>
                        <Grid size={{ xs: 6, sm: 3 }}><StatCard label="Total Gross" value={(summary?.total_gross ?? 0).toLocaleString()} icon={<TrendingUp size={22} />} color="success" /></Grid>
                        <Grid size={{ xs: 6, sm: 3 }}><StatCard label="Total Deductions" value={(summary?.total_deductions ?? 0).toLocaleString()} icon={<TrendingDown size={22} />} color="warning" /></Grid>
                        <Grid size={{ xs: 6, sm: 3 }}><StatCard label="Total Net Pay" value={(summary?.total_net ?? 0).toLocaleString()} icon={<Wallet size={22} />} color="info" /></Grid>
                    </Grid>

                    <Card sx={{ p: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>Component Breakdown</Typography>
                        {chartData.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">No processed payroll data for this period yet.</Typography>
                        ) : (
                            <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
                                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" width={160} />
                                    <Tooltip />
                                    <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={16}>
                                        {chartData.map((d, i) => (
                                            <Cell key={i} fill={d.type === 'earning' ? chartPalette[2] : semantic.error} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </Card>
                </>
            )}
        </Box>
    );
}

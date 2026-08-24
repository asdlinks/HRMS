import { Dialog, DialogContent, DialogActions, Button, Box, Typography, Stack, Divider, Grid2 as Grid } from '@mui/material';
import { Printer } from 'lucide-react';

export interface PayslipComponentLine { component_code: string; component_name: string; component_type: 'earning' | 'deduction'; amount: number }
export interface PayslipDetail {
    id: number;
    user_name: string;
    employee_id?: string | null;
    designation?: string | null;
    period_year: number;
    period_month: number;
    cycle_start_date: string;
    cycle_end_date: string;
    working_days: number;
    present_days: number;
    paid_leave_days: number;
    lop_days: number;
    ot_hours: number;
    ot_amount: number;
    gross_earnings: number;
    total_deductions: number;
    net_pay: number;
    components: PayslipComponentLine[];
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
}

interface PayslipViewProps {
    open: boolean;
    onClose: () => void;
    data: PayslipDetail | null;
    companyName?: string;
}

// Printable payslip — the design intentionally has no server-generated PDF:
// this renders a clean, chrome-free layout and window.print() (browser
// Print -> Save as PDF) does the rest. The @media print rule below hides
// everything on the page except this dialog's content.
export default function PayslipView({ open, onClose, data, companyName = 'Mywe HRMS' }: PayslipViewProps) {
    const earnings = data?.components.filter((c) => c.component_type === 'earning') || [];
    const deductions = data?.components.filter((c) => c.component_type === 'deduction') || [];

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    .payslip-printable, .payslip-printable * { visibility: visible; }
                    .payslip-printable { position: fixed; inset: 0; margin: 0; padding: 24px; }
                    .payslip-no-print { display: none !important; }
                }
            `}</style>
            <DialogContent className="payslip-printable">
                {data && (
                    <Box>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 800 }}>{companyName}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Payslip for {MONTH_NAMES[data.period_month - 1]} {data.period_year}
                                </Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                                {data.cycle_start_date?.slice(0, 10)} – {data.cycle_end_date?.slice(0, 10)}
                            </Typography>
                        </Stack>

                        <Grid container spacing={1} sx={{ mb: 3 }}>
                            <Grid size={6}><Typography variant="body2" color="text.secondary">Employee</Typography><Typography sx={{ fontWeight: 600 }}>{data.user_name}</Typography></Grid>
                            <Grid size={6}><Typography variant="body2" color="text.secondary">Employee ID</Typography><Typography sx={{ fontWeight: 600 }}>{data.employee_id || '—'}</Typography></Grid>
                            <Grid size={6}><Typography variant="body2" color="text.secondary">Designation</Typography><Typography sx={{ fontWeight: 600 }}>{data.designation || '—'}</Typography></Grid>
                            <Grid size={6}><Typography variant="body2" color="text.secondary">Working / Present / LOP Days</Typography><Typography sx={{ fontWeight: 600 }}>{data.working_days} / {data.present_days} / {data.lop_days}</Typography></Grid>
                        </Grid>

                        <Divider sx={{ mb: 2 }} />

                        <Grid container spacing={3}>
                            <Grid size={6}>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>Earnings</Typography>
                                <Stack spacing={0.75}>
                                    {earnings.map((c) => (
                                        <Stack key={c.component_code} direction="row" justifyContent="space-between">
                                            <Typography variant="body2">{c.component_name}</Typography>
                                            <Typography variant="body2">{formatCurrency(c.amount)}</Typography>
                                        </Stack>
                                    ))}
                                    {data.ot_amount > 0 && (
                                        <Stack direction="row" justifyContent="space-between">
                                            <Typography variant="body2">Overtime ({data.ot_hours}h)</Typography>
                                            <Typography variant="body2">{formatCurrency(data.ot_amount)}</Typography>
                                        </Stack>
                                    )}
                                </Stack>
                            </Grid>
                            <Grid size={6}>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>Deductions</Typography>
                                <Stack spacing={0.75}>
                                    {deductions.length === 0 && <Typography variant="body2" color="text.secondary">None</Typography>}
                                    {deductions.map((c) => (
                                        <Stack key={c.component_code} direction="row" justifyContent="space-between">
                                            <Typography variant="body2">{c.component_name}</Typography>
                                            <Typography variant="body2">{formatCurrency(c.amount)}</Typography>
                                        </Stack>
                                    ))}
                                </Stack>
                            </Grid>
                        </Grid>

                        <Divider sx={{ my: 2 }} />

                        <Grid container spacing={1}>
                            <Grid size={6}><Typography sx={{ fontWeight: 700 }}>Gross Earnings</Typography></Grid>
                            <Grid size={6}><Typography sx={{ fontWeight: 700, textAlign: 'right' }}>{formatCurrency(data.gross_earnings)}</Typography></Grid>
                            <Grid size={6}><Typography sx={{ fontWeight: 700 }}>Total Deductions</Typography></Grid>
                            <Grid size={6}><Typography sx={{ fontWeight: 700, textAlign: 'right' }}>{formatCurrency(data.total_deductions)}</Typography></Grid>
                            <Grid size={6}><Typography variant="h6" sx={{ fontWeight: 800 }}>Net Pay</Typography></Grid>
                            <Grid size={6}><Typography variant="h6" sx={{ fontWeight: 800, textAlign: 'right' }}>{formatCurrency(data.net_pay)}</Typography></Grid>
                        </Grid>
                    </Box>
                )}
            </DialogContent>
            <DialogActions className="payslip-no-print" sx={{ px: 3, pb: 3 }}>
                <Button color="inherit" onClick={onClose}>Close</Button>
                <Button variant="contained" startIcon={<Printer size={16} />} onClick={() => window.print()} disabled={!data}>
                    Print / Save as PDF
                </Button>
            </DialogActions>
        </Dialog>
    );
}

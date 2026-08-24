import { Card, Box, Typography, Stack, useTheme } from '@mui/material';
import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
    label: string;
    value: ReactNode;
    icon?: ReactNode;
    color?: 'primary' | 'success' | 'warning' | 'error' | 'info';
    trend?: { value: number; label?: string };
}

export default function StatCard({ label, value, icon, color = 'primary', trend }: StatCardProps) {
    const theme = useTheme();
    return (
        <Card sx={{ p: 2.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }} noWrap>
                        {label}
                    </Typography>
                    <Typography variant="h4" sx={{ mt: 0.5, fontSize: '1.85rem', overflowWrap: 'anywhere' }}>
                        {value}
                    </Typography>
                    {trend && (
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
                            {trend.value >= 0 ? (
                                <TrendingUp size={14} color={theme.palette.success.main} />
                            ) : (
                                <TrendingDown size={14} color={theme.palette.error.main} />
                            )}
                            <Typography
                                variant="caption"
                                sx={{ fontWeight: 700, color: trend.value >= 0 ? 'success.main' : 'error.main' }}
                            >
                                {trend.value >= 0 ? '+' : ''}
                                {trend.value}%
                            </Typography>
                            {trend.label && (
                                <Typography variant="caption" color="text.secondary">
                                    {trend.label}
                                </Typography>
                            )}
                        </Stack>
                    )}
                </Box>
                {icon && (
                    <Box
                        sx={{
                            width: 48,
                            height: 48,
                            borderRadius: 2.5,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: `${color}.main`,
                            color: `${color}.contrastText`,
                            opacity: 0.9,
                        }}
                    >
                        {icon}
                    </Box>
                )}
            </Stack>
        </Card>
    );
}

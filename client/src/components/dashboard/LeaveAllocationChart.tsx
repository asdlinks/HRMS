import { Card, Typography, useTheme } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { chartPalette } from '../../theme/palette';

interface LeaveAllocationChartProps {
    data: { type: string; allocated: number; used: number }[];
}

// Grouped bar: two real series (Allocated vs Used) per leave type — a
// categorical color job, so each series gets one fixed palette slot, never
// shaded by value. Direct value labels ship on every bar so the chart
// stays legible even where the palette's dark-mode contrast is borderline.
export default function LeaveAllocationChart({ data }: LeaveAllocationChartProps) {
    const theme = useTheme();
    const gridColor = theme.palette.divider;
    const textColor = theme.palette.text.secondary;

    return (
        <Card sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Leave Allocation vs. Used</Typography>
            {data.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No leave allocations configured.</Typography>
            ) : (
                <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                        <XAxis dataKey="type" tick={{ fill: textColor, fontSize: 12 }} axisLine={{ stroke: gridColor }} tickLine={false} />
                        <YAxis tick={{ fill: textColor, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip
                            cursor={{ fill: theme.palette.action.hover }}
                            contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${gridColor}`, borderRadius: 8 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="allocated" name="Allocated" fill={chartPalette[0]} radius={[4, 4, 0, 0]}>
                            <LabelList dataKey="allocated" position="top" fontSize={11} fill={textColor} />
                        </Bar>
                        <Bar dataKey="used" name="Used" fill={chartPalette[1]} radius={[4, 4, 0, 0]}>
                            <LabelList dataKey="used" position="top" fontSize={11} fill={textColor} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            )}
        </Card>
    );
}

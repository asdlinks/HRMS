import { Card, Typography, useTheme } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { chartPalette } from '../../theme/palette';

interface DepartmentHeadcountChartProps {
    data: { department: string; count: number }[];
}

// Single series, nominal categories (department names) — every bar takes
// the same slot-1 hue rather than a generated rainbow; horizontal layout
// keeps long department names readable instead of rotated/truncated.
export default function DepartmentHeadcountChart({ data }: DepartmentHeadcountChartProps) {
    const theme = useTheme();
    const gridColor = theme.palette.divider;
    const textColor = theme.palette.text.secondary;
    const height = Math.max(160, data.length * 40);

    return (
        <Card sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Department Headcount</Typography>
            {data.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No department data yet.</Typography>
            ) : (
                <ResponsiveContainer width="100%" height={height}>
                    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                        <XAxis type="number" tick={{ fill: textColor, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis
                            type="category"
                            dataKey="department"
                            tick={{ fill: textColor, fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                            width={120}
                        />
                        <Tooltip
                            cursor={{ fill: theme.palette.action.hover }}
                            contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${gridColor}`, borderRadius: 8 }}
                        />
                        <Bar dataKey="count" name="Headcount" fill={chartPalette[0]} radius={[0, 4, 4, 0]} barSize={18}>
                            <LabelList dataKey="count" position="right" fontSize={11} fill={textColor} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            )}
        </Card>
    );
}

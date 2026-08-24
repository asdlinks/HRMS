import { Card, Typography, useTheme } from '@mui/material';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { chartPalette } from '../../theme/palette';
import type { ReportChartConfig } from '../../api/reports';

interface ReportChartProps {
    config: ReportChartConfig;
    rows: Record<string, unknown>[];
    title: string;
    /** Called with the full data row behind the clicked bar/pie slice — lets a host page look up whatever id/name fields it needs to drill into a filtered detail view. Only wired for bar/pie (a line chart's x-axis is usually a date, not a filterable dimension). */
    onSliceClick?: (row: Record<string, unknown>) => void;
}

// One generic chart renderer driven entirely by the report's registry
// `chart` config (bar/line/pie + field names) instead of a bespoke chart
// component per report — mirrors the existing dashboard chart components'
// look (chartPalette, same grid/tooltip styling) so this reads as part of
// the same system.
export default function ReportChart({ config, rows, title, onSliceClick }: ReportChartProps) {
    const theme = useTheme();
    const gridColor = theme.palette.divider;
    const textColor = theme.palette.text.secondary;
    const tooltipStyle = { background: theme.palette.background.paper, border: `1px solid ${gridColor}`, borderRadius: 8 };

    if (rows.length === 0) {
        return (
            <Card sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
                <Typography variant="body2" color="text.secondary">No data to chart yet.</Typography>
            </Card>
        );
    }

    const rotateLabels = rows.length > 6;

    return (
        <Card sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>{title}</Typography>
            <ResponsiveContainer width="100%" height={280}>
                {config.type === 'pie' ? (
                    <PieChart>
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Pie
                            data={rows}
                            dataKey={config.valueField}
                            nameKey={config.nameField}
                            outerRadius={100}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts' PieLabelRenderProps has no index signature, so a dynamic-field accessor can't be typed more precisely than this.
                            label={(d: any) => `${d[config.nameField || '']}`}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts passes the full untyped datum for the clicked pie slice.
                            onClick={onSliceClick ? (d: any) => onSliceClick(d) : undefined}
                            style={onSliceClick ? { cursor: 'pointer' } : undefined}
                        >
                            {rows.map((_, i) => <Cell key={i} fill={chartPalette[i % chartPalette.length]} />)}
                        </Pie>
                    </PieChart>
                ) : config.type === 'line' ? (
                    <LineChart data={rows} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                        <XAxis dataKey={config.xField} tick={{ fill: textColor, fontSize: 12 }} axisLine={{ stroke: gridColor }} tickLine={false} />
                        <YAxis tick={{ fill: textColor, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line type="monotone" dataKey={config.yField} stroke={chartPalette[0]} strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                ) : (
                    <BarChart data={rows} margin={{ top: 8, right: 16, left: -16, bottom: rotateLabels ? 40 : 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                        <XAxis
                            dataKey={config.xField}
                            tick={{ fill: textColor, fontSize: 12 }}
                            axisLine={{ stroke: gridColor }}
                            tickLine={false}
                            interval={0}
                            angle={rotateLabels ? -25 : 0}
                            textAnchor={rotateLabels ? 'end' : 'middle'}
                            height={rotateLabels ? 60 : 30}
                        />
                        <YAxis tick={{ fill: textColor, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip cursor={{ fill: theme.palette.action.hover }} contentStyle={tooltipStyle} />
                        <Bar
                            dataKey={config.yField}
                            fill={chartPalette[0]}
                            radius={[4, 4, 0, 0]}
                            cursor={onSliceClick ? 'pointer' : undefined}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts passes the full untyped datum for the clicked bar.
                            onClick={onSliceClick ? (d: any) => onSliceClick(d.payload ?? d) : undefined}
                        />
                    </BarChart>
                )}
            </ResponsiveContainer>
        </Card>
    );
}

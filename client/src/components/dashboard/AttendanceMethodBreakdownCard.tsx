import { Box, Card, Stack, Typography } from '@mui/material';
import { METHOD_META } from '../attendance';
import { statusToneColors } from '../../theme/palette';

interface AttendanceMethodBreakdownCardProps {
    records: { method?: string | null }[];
}

// How today's workforce is actually checking in — Office/Face vs WFH vs
// Client Visit vs Field Work — as one proportional bar (part-to-whole reads
// better as a bar than a pie, same rationale as TodaysAttendanceBar) using
// the same method colors as MethodBadge everywhere else in the app.
export default function AttendanceMethodBreakdownCard({ records }: AttendanceMethodBreakdownCardProps) {
    const counts = new Map<string, number>();
    records.forEach((r) => {
        const key = r.method || 'Manual';
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    const total = records.length;
    const segments = Array.from(counts.entries())
        .map(([method, value]) => ({ method, value, meta: METHOD_META[method] }))
        .filter((s) => s.value > 0)
        .sort((a, b) => b.value - a.value);

    return (
        <Card sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Today's Check-in Methods</Typography>
            {total === 0 ? (
                <Typography variant="body2" color="text.secondary">No check-ins recorded yet today.</Typography>
            ) : (
                <>
                    <Box sx={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', gap: '2px' }}>
                        {segments.map((s) => {
                            const color = s.meta?.tone && s.meta.tone !== 'neutral' ? statusToneColors[s.meta.tone].main : statusToneColors.neutral.main;
                            return (
                                <Box
                                    key={s.method}
                                    sx={{ width: `${(s.value / total) * 100}%`, bgcolor: color, minWidth: 4 }}
                                    title={`${s.meta?.label || s.method}: ${s.value}`}
                                />
                            );
                        })}
                    </Box>
                    <Stack direction="row" flexWrap="wrap" spacing={3} sx={{ mt: 2.5 }}>
                        {segments.map((s) => {
                            const color = s.meta?.tone && s.meta.tone !== 'neutral' ? statusToneColors[s.meta.tone].main : statusToneColors.neutral.main;
                            return (
                                <Stack key={s.method} direction="row" spacing={1} alignItems="center">
                                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
                                    <Typography variant="body2" color="text.secondary">
                                        {s.meta?.label || s.method} <Typography component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{s.value}</Typography>
                                    </Typography>
                                </Stack>
                            );
                        })}
                    </Stack>
                </>
            )}
        </Card>
    );
}

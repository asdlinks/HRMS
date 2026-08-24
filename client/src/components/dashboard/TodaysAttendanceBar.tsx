import { Box, Card, Stack, Typography } from '@mui/material';
import { statusToneColors } from '../../theme/palette';

interface TodaysAttendanceBarProps {
    present: number;
    onLeave: number;
    notCheckedIn: number;
}

// A single proportional stacked bar (part-to-whole, 3 segments) rather than
// a donut — per the dataviz method, a 2-3 slice pie/donut is never the right
// form for a part-to-whole comparison; a bar reads magnitude far more
// accurately. Segments use the reserved status tones (present=success,
// leave=info, not-checked-in=warning), not the generic categorical palette,
// since each segment IS a state.
export default function TodaysAttendanceBar({ present, onLeave, notCheckedIn }: TodaysAttendanceBarProps) {
    const total = present + onLeave + notCheckedIn;
    const segments = [
        { label: 'Present', value: present, tone: statusToneColors.success },
        { label: 'On Leave', value: onLeave, tone: statusToneColors.info },
        { label: 'Not Checked In', value: notCheckedIn, tone: statusToneColors.warning },
    ].filter((s) => s.value > 0);

    return (
        <Card sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Today's Attendance</Typography>
            {total === 0 ? (
                <Typography variant="body2" color="text.secondary">No workforce data yet.</Typography>
            ) : (
                <>
                    <Box sx={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', gap: '2px' }}>
                        {segments.map((s) => (
                            <Box
                                key={s.label}
                                sx={{ width: `${(s.value / total) * 100}%`, bgcolor: s.tone.main, minWidth: 4 }}
                                title={`${s.label}: ${s.value}`}
                            />
                        ))}
                    </Box>
                    <Stack direction="row" flexWrap="wrap" spacing={3} sx={{ mt: 2.5 }}>
                        {segments.map((s) => (
                            <Stack key={s.label} direction="row" spacing={1} alignItems="center">
                                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.tone.main }} />
                                <Typography variant="body2" color="text.secondary">
                                    {s.label} <Typography component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{s.value}</Typography>
                                </Typography>
                            </Stack>
                        ))}
                    </Stack>
                </>
            )}
        </Card>
    );
}

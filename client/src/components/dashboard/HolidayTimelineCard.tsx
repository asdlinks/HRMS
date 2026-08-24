import { Card, Typography, Stack, Box } from '@mui/material';
import { Link } from 'react-router-dom';
import EmptyState from '../ui/EmptyState';

interface Holiday {
    name: string;
    date: string;
}

export default function HolidayTimelineCard({ holidays }: { holidays: Holiday[] }) {
    // Multiple location-scoped rows can share the same name+date (one row
    // per office the holiday was created for) — a viewer should still see
    // it once, not once per underlying row.
    const seen = new Set<string>();
    const upcoming = holidays
        .filter((h) => new Date(h.date) >= new Date(new Date().toDateString()))
        .filter((h) => {
            const key = `${h.name}-${h.date}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 5);

    return (
        <Card sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Upcoming Holidays</Typography>
            {upcoming.length === 0 ? (
                <EmptyState title="No upcoming holidays" />
            ) : (
                <Stack spacing={0}>
                    {upcoming.map((h, i) => {
                        const d = new Date(h.date);
                        return (
                            <Stack
                                key={`${h.name}-${h.date}`}
                                direction="row"
                                spacing={2}
                                alignItems="center"
                                sx={{ py: 1.25, borderBottom: i < upcoming.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}
                            >
                                <Box
                                    sx={{
                                        width: 44, textAlign: 'center', bgcolor: 'primary.main', color: 'primary.contrastText',
                                        borderRadius: 2, py: 0.5, flexShrink: 0,
                                    }}
                                >
                                    <Typography sx={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.1 }}>{d.getDate()}</Typography>
                                    <Typography sx={{ fontSize: '0.6rem', textTransform: 'uppercase', opacity: 0.85 }}>
                                        {d.toLocaleDateString('en-US', { month: 'short' })}
                                    </Typography>
                                </Box>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{h.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {d.toLocaleDateString('en-US', { weekday: 'long' })}
                                    </Typography>
                                </Box>
                            </Stack>
                        );
                    })}
                </Stack>
            )}
            <Box sx={{ mt: 1.5 }}>
                <Typography component={Link} to="/holidays" variant="caption" sx={{ color: 'primary.main', fontWeight: 700 }}>
                    View full calendar →
                </Typography>
            </Box>
        </Card>
    );
}

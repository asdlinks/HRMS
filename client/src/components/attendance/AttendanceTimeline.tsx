import { Box, Stack, Typography } from '@mui/material';
import { LogIn, Coffee, PlayCircle, LogOut, type LucideIcon } from 'lucide-react';
import { format } from 'date-fns';
import type { TimelineEvent, TimelineEventType } from './timelineEvents';

const EVENT_META: Record<TimelineEventType, { icon: LucideIcon; color: string }> = {
    checkin: { icon: LogIn, color: 'success.main' },
    'break-start': { icon: Coffee, color: 'warning.main' },
    'break-end': { icon: PlayCircle, color: 'info.main' },
    checkout: { icon: LogOut, color: 'text.secondary' },
};

export default function AttendanceTimeline({ events }: { events: TimelineEvent[] }) {
    if (events.length === 0) {
        return <Typography variant="body2" color="text.secondary">No activity recorded yet today.</Typography>;
    }

    return (
        <Stack spacing={0}>
            {events.map((e, i) => {
                const meta = EVENT_META[e.type];
                const Icon = meta.icon;
                const isLast = i === events.length - 1;
                return (
                    <Stack key={`${e.type}-${i}`} direction="row" spacing={1.5} alignItems="flex-start" sx={{ position: 'relative', pb: isLast ? 0 : 2.5 }}>
                        {!isLast && (
                            <Box sx={{ position: 'absolute', left: 11, top: 24, bottom: 0, width: '2px', bgcolor: 'divider' }} />
                        )}
                        <Box
                            sx={{
                                width: 24, height: 24, borderRadius: '50%', bgcolor: 'background.paper',
                                border: '2px solid', borderColor: meta.color, display: 'flex',
                                alignItems: 'center', justifyContent: 'center', color: meta.color, zIndex: 1, flexShrink: 0,
                            }}
                        >
                            <Icon size={12} />
                        </Box>
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{e.label}</Typography>
                            <Typography variant="caption" color="text.secondary">{format(new Date(e.time), 'h:mm a')}</Typography>
                        </Box>
                    </Stack>
                );
            })}
        </Stack>
    );
}

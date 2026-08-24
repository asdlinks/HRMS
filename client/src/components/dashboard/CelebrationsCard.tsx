import { Card, Typography, Stack, Avatar, Box, Chip, useTheme } from '@mui/material';
import { Cake, Award } from 'lucide-react';
import EmptyState from '../ui/EmptyState';

interface CelebrationUser {
    id: number;
    name: string;
    profile_photo?: string | null;
    date_of_birth?: string | null;
    joining_date?: string | null;
    designation?: string | null;
    department_name?: string | null;
}

interface Celebration {
    user: CelebrationUser;
    kind: 'birthday' | 'anniversary';
    daysAway: number;
    month: number;
    day: number;
    years?: number;
}

const WINDOW_DAYS = 14;

// Days from today (0 = today) to the next occurrence of a month/day,
// ignoring year — used for both birthdays and work anniversaries.
function daysUntilAnnualDate(monthDay: { month: number; day: number }, today: Date): number {
    const year = today.getFullYear();
    let next = new Date(year, monthDay.month, monthDay.day);
    next.setHours(0, 0, 0, 0);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (next < todayMidnight) next = new Date(year + 1, monthDay.month, monthDay.day);
    return Math.round((next.getTime() - todayMidnight.getTime()) / 86400000);
}

// Formats a month/day pair as "15 Aug" — deliberately never receives or
// renders a real year (2000 is only a leap-year placeholder so Feb 29
// formats correctly), matching the spec's "day and month only, never the
// employee's birth year" requirement.
function monthDayLabel(month: number, day: number): string {
    return new Date(2000, month, day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function buildCelebrations(users: CelebrationUser[]): Celebration[] {
    const today = new Date();
    const list: Celebration[] = [];

    for (const user of users) {
        if (user.date_of_birth) {
            const dob = new Date(user.date_of_birth);
            const month = dob.getMonth();
            const day = dob.getDate();
            const daysAway = daysUntilAnnualDate({ month, day }, today);
            if (daysAway <= WINDOW_DAYS) list.push({ user, kind: 'birthday', daysAway, month, day });
        }
        if (user.joining_date) {
            const joined = new Date(user.joining_date);
            const month = joined.getMonth();
            const day = joined.getDate();
            const daysAway = daysUntilAnnualDate({ month, day }, today);
            const years = today.getFullYear() - joined.getFullYear();
            if (daysAway <= WINDOW_DAYS && years > 0) list.push({ user, kind: 'anniversary', daysAway, month, day, years });
        }
    }
    return list.sort((a, b) => a.daysAway - b.daysAway);
}

function dayLabel(daysAway: number): string {
    if (daysAway === 0) return 'Today';
    if (daysAway === 1) return 'Tomorrow';
    return `In ${daysAway} days`;
}

export default function CelebrationsCard({ users }: { users: CelebrationUser[] }) {
    const theme = useTheme();
    const celebrations = buildCelebrations(users);

    return (
        <Card sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Celebrations</Typography>
            {celebrations.length === 0 ? (
                <EmptyState title="Nothing in the next two weeks" description="Birthdays and work anniversaries will show up here." />
            ) : (
                <Stack spacing={1.5}>
                    {celebrations.map((c) => {
                        const subtitle = [c.user.designation, c.user.department_name].filter(Boolean).join(' • ');
                        return (
                            <Stack key={`${c.kind}-${c.user.id}`} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
                                <Avatar src={c.user.profile_photo ?? undefined} sx={{ width: 34, height: 34, flexShrink: 0 }}>
                                    {c.user.name.charAt(0)}
                                </Avatar>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{c.user.name}</Typography>
                                    {subtitle && (
                                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                                            {subtitle}
                                        </Typography>
                                    )}
                                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                                        {c.kind === 'birthday' ? 'Birthday' : `Work Anniversary • ${c.years} yr${c.years === 1 ? '' : 's'}`}
                                    </Typography>
                                </Box>
                                <Stack alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
                                    <Stack direction="row" alignItems="center" spacing={0.75}>
                                        {c.kind === 'birthday' ? <Cake size={15} color={theme.palette.primary.main} /> : <Award size={15} color={theme.palette.warning.main} />}
                                        <Typography variant="caption" color="text.secondary">{monthDayLabel(c.month, c.day)}</Typography>
                                    </Stack>
                                    <Chip label={dayLabel(c.daysAway)} size="small" variant="outlined" />
                                </Stack>
                            </Stack>
                        );
                    })}
                </Stack>
            )}
        </Card>
    );
}

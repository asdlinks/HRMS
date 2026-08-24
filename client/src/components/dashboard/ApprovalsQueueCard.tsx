import { Card, Typography, Stack, Box, Chip, Avatar } from '@mui/material';
import { Link } from 'react-router-dom';
import EmptyState from '../ui/EmptyState';

interface PendingLeave {
    id: number;
    user_name?: string;
    type: string;
    status: string;
    start_date: string;
    end_date: string;
}

// Read-only queue that links into LeavesPage for the actual approve/reject
// action — the review flow (permission checks, notifications, etc.) already
// lives there; duplicating it here would be a second source of truth for
// the same business logic.
export default function ApprovalsQueueCard({ pending }: { pending: PendingLeave[] }) {
    return (
        <Card sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6">Pending Approvals</Typography>
                {pending.length > 0 && <Chip label={pending.length} color="warning" size="small" />}
            </Stack>
            {pending.length === 0 ? (
                <EmptyState title="All caught up" description="No leave requests waiting on your review." />
            ) : (
                <Stack spacing={1.25}>
                    {pending.slice(0, 5).map((l) => (
                        <Stack
                            key={l.id}
                            component={Link}
                            to="/leaves"
                            direction="row"
                            spacing={1.5}
                            alignItems="center"
                            sx={{ p: 1.25, borderRadius: 2, bgcolor: 'action.hover', textDecoration: 'none', color: 'inherit' }}
                        >
                            <Avatar sx={{ width: 32, height: 32 }}>{(l.user_name || '?').charAt(0)}</Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{l.user_name || 'Unknown'}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {l.type} · {new Date(l.start_date).toLocaleDateString()} – {new Date(l.end_date).toLocaleDateString()}
                                </Typography>
                            </Box>
                        </Stack>
                    ))}
                    {pending.length > 5 && (
                        <Typography component={Link} to="/leaves" variant="caption" sx={{ color: 'primary.main', fontWeight: 700 }}>
                            +{pending.length - 5} more →
                        </Typography>
                    )}
                </Stack>
            )}
        </Card>
    );
}

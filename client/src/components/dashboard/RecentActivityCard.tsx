import { useState, useEffect } from 'react';
import { Card, Typography, Stack, Box } from '@mui/material';
import { getNotifications } from '../../api';
import EmptyState from '../ui/EmptyState';

interface Notification {
    id: number;
    message: string;
    created_at: string;
}

export default function RecentActivityCard() {
    const [items, setItems] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getNotifications()
            .then((resp) => setItems(resp.data.slice(0, 6)))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) return null;

    return (
        <Card sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Recent Activity</Typography>
            {items.length === 0 ? (
                <EmptyState title="Nothing recent" description="Activity across your team will show up here." />
            ) : (
                <Stack spacing={0}>
                    {items.map((n, i) => (
                        <Box key={n.id} sx={{ py: 1.25, borderBottom: i < items.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
                            <Typography variant="body2">{n.message}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {new Date(n.created_at + 'Z').toLocaleString()}
                            </Typography>
                        </Box>
                    ))}
                </Stack>
            )}
        </Card>
    );
}

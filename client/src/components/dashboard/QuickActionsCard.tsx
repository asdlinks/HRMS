import { Box, Card, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export interface QuickActionItem {
    to: string;
    icon: ReactNode;
    label: string;
}

export default function QuickActionsCard({ actions }: { actions: QuickActionItem[] }) {
    return (
        <Card sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Quick Actions</Typography>
            <Stack spacing={1.5}>
                {actions.map((action) => (
                    <Box
                        key={action.to}
                        component={Link}
                        to={action.to}
                        sx={{
                            display: 'flex', alignItems: 'center', gap: 1.5, p: 1.75, borderRadius: 3,
                            textDecoration: 'none', color: 'text.primary', fontWeight: 600, border: '1px solid', borderColor: 'divider',
                            transition: 'all 0.2s',
                            '&:hover': { bgcolor: 'primary.main', color: 'primary.contrastText', borderColor: 'primary.main' },
                        }}
                    >
                        <Box sx={{ display: 'flex', color: 'primary.main', '.MuiBox-root:hover &': { color: 'inherit' } }}>
                            {action.icon}
                        </Box>
                        {action.label}
                    </Box>
                ))}
            </Stack>
        </Card>
    );
}

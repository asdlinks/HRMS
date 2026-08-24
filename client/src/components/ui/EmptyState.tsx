import { Box, Typography, Button } from '@mui/material';
import type { ReactNode } from 'react';
import { InboxIcon } from 'lucide-react';

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                py: 8,
                px: 3,
                color: 'text.secondary',
            }}
        >
            <Box
                sx={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'action.hover',
                    color: 'text.disabled',
                    mb: 2,
                }}
            >
                {icon ?? <InboxIcon size={28} />}
            </Box>
            <Typography variant="h6" color="text.primary">
                {title}
            </Typography>
            {description && (
                <Typography variant="body2" sx={{ mt: 0.5, maxWidth: 380 }}>
                    {description}
                </Typography>
            )}
            {action && (
                <Button variant="outlined" onClick={action.onClick} sx={{ mt: 3 }}>
                    {action.label}
                </Button>
            )}
        </Box>
    );
}

import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
    return (
        <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={2}
            sx={{ mb: { xs: 3, sm: 4 } }}
        >
            <Box>
                <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '1.85rem' }, letterSpacing: '-0.5px' }}>
                    {title}
                </Typography>
                {subtitle && (
                    <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
                        {subtitle}
                    </Typography>
                )}
            </Box>
            {actions && <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>{actions}</Box>}
        </Stack>
    );
}

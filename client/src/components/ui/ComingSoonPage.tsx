import { Box, Typography, Chip, Card } from '@mui/material';
import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import PageHeader from './PageHeader';

interface ComingSoonPageProps {
    title: string;
    description: string;
    icon?: ReactNode;
}

// Placeholder screen for modules whose routing/navigation exists now but
// whose implementation is scoped for a later phase (Payroll, Face Recognition
// Attendance, Recruitment, Performance, Asset Management).
export default function ComingSoonPage({ title, description, icon }: ComingSoonPageProps) {
    return (
        <Box className="fade-in">
            <PageHeader title={title} subtitle={description} />
            <Card
                sx={{
                    p: { xs: 4, sm: 8 },
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    gap: 2,
                }}
            >
                <Box
                    sx={{
                        width: 72,
                        height: 72,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                    }}
                >
                    {icon ?? <Sparkles size={32} />}
                </Box>
                <Chip label="Coming soon" color="primary" variant="outlined" size="small" />
                <Typography variant="h5">{title} is on the roadmap</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460 }}>
                    This module is planned for a future release and is not yet available. The
                    navigation entry and route are already wired up so it can be enabled here
                    without further architectural changes.
                </Typography>
            </Card>
        </Box>
    );
}

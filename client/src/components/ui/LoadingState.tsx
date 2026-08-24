import { Box, Skeleton, Stack, CircularProgress } from '@mui/material';

export function PageSpinner() {
    return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 10 }}>
            <CircularProgress size={32} />
        </Box>
    );
}

export function CardSkeletonGrid({ count = 6 }: { count?: number }) {
    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 2.5 }}>
            {Array.from({ length: count }).map((_, i) => (
                <Box key={i} sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                        <Skeleton variant="rounded" width={44} height={44} />
                        <Box sx={{ flex: 1 }}>
                            <Skeleton variant="text" width="70%" />
                            <Skeleton variant="text" width="40%" />
                        </Box>
                    </Stack>
                    <Skeleton variant="text" />
                    <Skeleton variant="text" width="60%" />
                </Box>
            ))}
        </Box>
    );
}

export function RowSkeletonList({ count = 5 }: { count?: number }) {
    return (
        <Stack spacing={1.5}>
            {Array.from({ length: count }).map((_, i) => (
                <Stack key={i} direction="row" spacing={2} alignItems="center" sx={{ p: 1.5 }}>
                    <Skeleton variant="rounded" width={40} height={40} />
                    <Box sx={{ flex: 1 }}>
                        <Skeleton variant="text" width="50%" />
                        <Skeleton variant="text" width="30%" />
                    </Box>
                    <Skeleton variant="rounded" width={80} height={28} />
                </Stack>
            ))}
        </Stack>
    );
}

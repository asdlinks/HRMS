import { Chip } from '@mui/material';
import { toneForStatus, statusToneColors } from '../../theme/palette';

export default function StatusBadge({ status }: { status: string }) {
    const tone = toneForStatus(status);
    const label = status
        ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
        : 'Unknown';

    if (tone === 'neutral') {
        return <Chip label={label} size="small" variant="outlined" />;
    }

    const { main, bgDark } = statusToneColors[tone];
    return (
        <Chip
            label={label}
            size="small"
            sx={(theme) => ({
                fontWeight: 700,
                color: main,
                bgcolor: theme.palette.mode === 'dark' ? bgDark : `${tone}.light`,
            })}
        />
    );
}

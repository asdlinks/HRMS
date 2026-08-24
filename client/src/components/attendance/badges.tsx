import { Chip } from '@mui/material';
import { statusToneColors } from '../../theme/palette';
import { METHOD_META, WORK_MODE_META, type MethodMeta } from './methodMeta';

function ToneChip({ meta, size, fallback }: { meta?: MethodMeta; size: 'small' | 'medium'; fallback: string }) {
    if (!meta) return <Chip label={fallback} size={size} variant="outlined" />;
    const Icon = meta.icon;
    if (meta.tone === 'neutral') {
        return <Chip icon={<Icon size={14} />} label={meta.label} size={size} variant="outlined" sx={{ '& .MuiChip-icon': { color: 'inherit' } }} />;
    }
    const { main, bgDark } = statusToneColors[meta.tone];
    return (
        <Chip
            icon={<Icon size={14} />}
            label={meta.label}
            size={size}
            sx={(theme) => ({
                fontWeight: 700,
                color: main,
                bgcolor: theme.palette.mode === 'dark' ? bgDark : `${meta.tone}.light`,
                '& .MuiChip-icon': { color: 'inherit' },
            })}
        />
    );
}

// Capture method (how the check-in was recorded — Face, Manual, WFH…).
export function MethodBadge({ method, size = 'small' }: { method?: string | null; size?: 'small' | 'medium' }) {
    return <ToneChip meta={method ? METHOD_META[method] : undefined} size={size} fallback={method || 'Unknown'} />;
}

// Where the employee is working from today — distinct from method (a
// manual/Face check-in implies Office; WFH/ClientVisit/FieldWork are both
// the method and the work mode).
export function WorkModeBadge({ workMode, size = 'small' }: { workMode?: string | null; size?: 'small' | 'medium' }) {
    const key = workMode || 'Office';
    return <ToneChip meta={WORK_MODE_META[key]} size={size} fallback={key} />;
}

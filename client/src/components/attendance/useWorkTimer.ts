import { useEffect, useMemo, useState } from 'react';

export interface BreakInterval {
    break_start: string | Date;
    break_end?: string | Date | null;
}

function toMs(value?: string | Date | null): number | null {
    if (!value) return null;
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
}

export function formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

// Live "worked so far" timer: check-out time minus check-in time minus every
// break interval (an open break counts as break time, not work time, until
// it's resumed) — ticks every second while a day is checked in and not yet
// checked out, freezes once check-out is recorded.
export function useWorkTimer({
    checkInTime,
    checkOutTime,
    breaks = [],
}: {
    checkInTime?: string | Date | null;
    checkOutTime?: string | Date | null;
    breaks?: BreakInterval[];
}) {
    const running = Boolean(checkInTime) && !checkOutTime;
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!running) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [running]);

    return useMemo(() => {
        const start = toMs(checkInTime);
        if (!start) return { elapsedMs: 0, breakMs: 0, formatted: '00:00:00', running: false };

        const end = toMs(checkOutTime) ?? now;
        const breakMs = breaks.reduce((sum, b) => {
            const bStart = toMs(b.break_start);
            if (!bStart) return sum;
            const bEnd = toMs(b.break_end) ?? now;
            return sum + Math.max(0, bEnd - bStart);
        }, 0);

        const elapsedMs = Math.max(0, end - start - breakMs);
        return { elapsedMs, breakMs, formatted: formatDuration(elapsedMs), running };
    }, [checkInTime, checkOutTime, breaks, now, running]);
}

import type { BreakInterval } from './useWorkTimer';

export type TimelineEventType = 'checkin' | 'break-start' | 'break-end' | 'checkout';

export interface TimelineEvent {
    type: TimelineEventType;
    time: string | Date;
    label: string;
}

export function buildTimelineEvents({
    checkInTime,
    checkOutTime,
    breaks = [],
}: {
    checkInTime?: string | Date | null;
    checkOutTime?: string | Date | null;
    breaks?: BreakInterval[];
}): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    if (checkInTime) events.push({ type: 'checkin', time: checkInTime, label: 'Checked in' });
    breaks.forEach((b) => {
        if (b.break_start) events.push({ type: 'break-start', time: b.break_start, label: 'Break started' });
        if (b.break_end) events.push({ type: 'break-end', time: b.break_end, label: 'Break ended' });
    });
    if (checkOutTime) events.push({ type: 'checkout', time: checkOutTime, label: 'Checked out' });
    return events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

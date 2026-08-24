import { Camera, Home, Briefcase, MapPin, UserCheck, Fingerprint, QrCode, Cloud, Building2, type LucideIcon } from 'lucide-react';
import type { StatusTone } from '../../theme/palette';

export interface MethodMeta { label: string; icon: LucideIcon; tone: StatusTone }

// Every value of ATTENDANCE_METHODS (server/schemas/index.js) gets a fixed
// label/icon/tone here so no page has to invent its own mapping — add a new
// method server-side and it renders correctly everywhere via this one table.
// Exported so dashboard widgets (e.g. AttendanceMethodBreakdownCard) can
// reuse the same colors/labels instead of duplicating the mapping.
export const METHOD_META: Record<string, MethodMeta> = {
    Face: { label: 'Face Recognition', icon: Camera, tone: 'success' },
    WFH: { label: 'Work From Home', icon: Home, tone: 'info' },
    ClientVisit: { label: 'Client Visit', icon: Briefcase, tone: 'warning' },
    FieldWork: { label: 'Field Work', icon: MapPin, tone: 'warning' },
    Manual: { label: 'Manual', icon: UserCheck, tone: 'neutral' },
    Biometric: { label: 'Biometric', icon: Fingerprint, tone: 'info' },
    QRCode: { label: 'QR Code', icon: QrCode, tone: 'info' },
    API: { label: 'API', icon: Cloud, tone: 'neutral' },
};

export const WORK_MODE_META: Record<string, MethodMeta> = {
    Office: { label: 'Office', icon: Building2, tone: 'success' },
    WFH: { label: 'Work From Home', icon: Home, tone: 'info' },
    ClientVisit: { label: 'Client Visit', icon: Briefcase, tone: 'warning' },
    FieldWork: { label: 'Field Work', icon: MapPin, tone: 'warning' },
};

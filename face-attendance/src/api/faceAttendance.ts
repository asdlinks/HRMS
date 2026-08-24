import api from './client';
import type { CheckInResult, SyncPayload } from '../types';

// GET /api/face-attendance/embeddings/sync (device-authed). Returns every
// active enrollment for the tenant so the kiosk can match faces locally.
export async function syncEmbeddings(): Promise<SyncPayload> {
  const { data } = await api.get<SyncPayload>('/face-attendance/embeddings/sync');
  return data;
}

export interface CheckInBody {
  userId: number;
  date: string;
  confidence?: number;
  idempotencyKey: string;
}

// POST /api/face-attendance/check-in (device-authed). The face was already
// resolved to a userId locally; this only records the attendance event.
export async function postCheckIn(body: CheckInBody): Promise<CheckInResult> {
  const { data } = await api.post<CheckInResult>('/face-attendance/check-in', body);
  return data;
}

// The server returns this exact 400 when a row already exists for the day. For
// the kiosk it is a DELIVERED state, not a failure — the unique constraint is
// the real dedup guarantee, so a queued replay that hits it should be removed.
export const ALREADY_CHECKED_IN = 'Already checked in for today';

export function isAlreadyCheckedIn(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const resp = (err as { response?: { status?: number; data?: { error?: string } } }).response;
  return resp?.status === 400 && resp?.data?.error === ALREADY_CHECKED_IN;
}

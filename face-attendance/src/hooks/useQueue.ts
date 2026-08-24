import { useCallback, useEffect, useState } from 'react';
import { isAlreadyCheckedIn, postCheckIn } from '../api/faceAttendance';
import { isNetworkError } from '../api/client';
import { enqueueCheckIn, listQueue, queueCount, removeFromQueue } from '../db/idb';
import { todayLocalDate } from '../config';
import type { QueuedCheckIn } from '../types';

export type SubmitOutcome =
  | { outcome: 'ok' }
  | { outcome: 'already' }
  | { outcome: 'queued' }
  | { outcome: 'error'; message: string };

export interface SubmitParams {
  userId: number;
  confidence?: number;
  displayName?: string;
}

// Owns the offline check-in queue (IndexedDB) and the single write path both
// the live scan and the background flusher share.
export function useQueue() {
  const [count, setCount] = useState(0);

  const refreshCount = useCallback(async () => {
    try {
      setCount(await queueCount());
    } catch {
      /* IndexedDB unavailable — leave count as-is */
    }
  }, []);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  // Live check-in. A fresh idempotencyKey is minted here — ONCE per detection
  // event — and reused on every subsequent retry of THIS attempt.
  const submit = useCallback(
    async ({ userId, confidence, displayName }: SubmitParams): Promise<SubmitOutcome> => {
      const item: QueuedCheckIn = {
        idempotencyKey: crypto.randomUUID(),
        userId,
        date: todayLocalDate(),
        confidence,
        displayName,
        createdAt: Date.now(),
      };

      if (!navigator.onLine) {
        await enqueueCheckIn(item);
        await refreshCount();
        return { outcome: 'queued' };
      }

      try {
        await postCheckIn({ userId: item.userId, date: item.date, confidence: item.confidence, idempotencyKey: item.idempotencyKey });
        return { outcome: 'ok' };
      } catch (err) {
        if (isAlreadyCheckedIn(err)) return { outcome: 'already' };
        if (isNetworkError(err)) {
          await enqueueCheckIn(item);
          await refreshCount();
          return { outcome: 'queued' };
        }
        const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Check-in failed';
        return { outcome: 'error', message };
      }
    },
    [refreshCount],
  );

  // Drain the queue in insertion order. Remove on success or the "already
  // checked in" 400 (both are delivered states). Keep + stop on a network
  // error or a 5xx (retry later). Drop a non-retryable 4xx (e.g. a policy 403)
  // so it can't poison the queue forever — logged for diagnostics.
  const flush = useCallback(async (): Promise<void> => {
    if (!navigator.onLine) return;
    const items = await listQueue();
    for (const item of items) {
      try {
        await postCheckIn({ userId: item.userId, date: item.date, confidence: item.confidence, idempotencyKey: item.idempotencyKey });
        await removeFromQueue(item.idempotencyKey);
      } catch (err) {
        if (isAlreadyCheckedIn(err)) {
          await removeFromQueue(item.idempotencyKey);
          continue;
        }
        if (isNetworkError(err)) break; // offline again — try the whole queue later
        const status = (err as { response?: { status?: number } })?.response?.status ?? 0;
        if (status >= 500) break; // transient server issue — keep and retry later
        // Non-retryable client error: drop it rather than loop forever.
        // eslint-disable-next-line no-console
        console.warn('Dropping non-retryable queued check-in', item.idempotencyKey, err);
        await removeFromQueue(item.idempotencyKey);
      }
    }
    await refreshCount();
  }, [refreshCount]);

  return { count, submit, flush, refreshCount };
}

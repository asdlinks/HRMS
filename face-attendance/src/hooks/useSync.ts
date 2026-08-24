import { useCallback, useEffect, useRef, useState } from 'react';
import { syncEmbeddings } from '../api/faceAttendance';
import { loadSync, saveSync } from '../db/idb';
import { buildMatcher, type MatcherEntry } from '../face/matcher';

// Owns the locally-cached enrollment set used for matching. Loads the last
// cached copy from IndexedDB immediately (so matching works before the first
// network sync and right through an outage), then refreshes from the server
// whenever asked.
export function useSync() {
  const [entries, setEntries] = useState<MatcherEntry[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const entriesRef = useRef<MatcherEntry[]>([]);

  const apply = useCallback((built: MatcherEntry[], when: string | null) => {
    entriesRef.current = built;
    setEntries(built);
    setSyncedAt(when);
  }, []);

  // Warm start from IndexedDB.
  useEffect(() => {
    (async () => {
      const cached = await loadSync();
      if (cached) apply(buildMatcher(cached.enrollments), cached.syncedAt);
    })();
  }, [apply]);

  const sync = useCallback(async (): Promise<void> => {
    const payload = await syncEmbeddings();
    await saveSync(payload.enrollments, payload.syncedAt);
    apply(buildMatcher(payload.enrollments), payload.syncedAt);
  }, [apply]);

  // A ref so the tight detection loop can read the latest matcher without the
  // effect that runs the loop re-subscribing on every sync.
  return { entries, entriesRef, syncedAt, enrollmentCount: entries.length, sync };
}

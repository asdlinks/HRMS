import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionStatus } from '../types';

// Tracks online/offline and exposes a transient 'syncing' state that the queue
// flusher / embedding sync can raise. Drives the always-visible status pill.
export function useConnection() {
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [syncing, setSyncingState] = useState(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const setSyncing = useCallback((v: boolean) => {
    syncingRef.current = v;
    setSyncingState(v);
  }, []);

  const status: ConnectionStatus = !online ? 'offline' : syncing ? 'syncing' : 'online';
  return { online, status, setSyncing };
}

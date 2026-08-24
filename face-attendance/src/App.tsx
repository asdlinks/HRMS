import { useCallback, useEffect, useRef, useState } from 'react';
import { useKioskSession } from './hooks/useKioskSession';
import { useConnection } from './hooks/useConnection';
import { useQueue } from './hooks/useQueue';
import { useSync } from './hooks/useSync';
import { RegistrationScreen } from './components/RegistrationScreen';
import { ScanScreen, type ScanStats } from './components/ScanScreen';
import { DiagnosticsScreen } from './components/DiagnosticsScreen';
import { ConnectionIndicator } from './components/ConnectionIndicator';
import { config, getMatchThreshold, setMatchThreshold } from './config';

const LONG_PRESS_MS = 1200;

export default function App() {
  const session = useKioskSession();
  const { online, status, setSyncing } = useConnection();
  const queue = useQueue();
  const sync = useSync();

  const [started, setStarted] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [stats, setStats] = useState<ScanStats>({ fps: 0, modelsLoaded: false, cameraResolution: null });
  const [threshold, setThresholdState] = useState(getMatchThreshold());
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;

  // ---- first-gesture: enter fullscreen + satisfy autoplay ----
  const start = useCallback(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    setStarted(true);
  }, []);

  // ---- sync + queue flush, wrapped in the 'syncing' indicator ----
  const doSync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      await sync.sync();
    } catch {
      /* keep last cached copy */
    } finally {
      setSyncing(false);
    }
  }, [sync, setSyncing]);

  const doFlush = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      await queue.flush();
    } finally {
      setSyncing(false);
    }
  }, [queue, setSyncing]);

  // Once registered: initial sync + flush, then periodic timers.
  useEffect(() => {
    if (session.status !== 'registered') return;
    void doSync();
    void doFlush();
    const syncId = window.setInterval(() => void doSync(), config.syncIntervalMs);
    const flushId = window.setInterval(() => void doFlush(), config.queueFlushIntervalMs);
    return () => {
      window.clearInterval(syncId);
      window.clearInterval(flushId);
    };
  }, [session.status, doSync, doFlush]);

  // On regaining connectivity, immediately sync + flush.
  useEffect(() => {
    if (online && session.status === 'registered') {
      void doSync();
      void doFlush();
    }
  }, [online, session.status, doSync, doFlush]);

  const setThreshold = useCallback((v: number) => {
    setThresholdState(v);
    setMatchThreshold(v);
  }, []);

  const getThreshold = useCallback(() => thresholdRef.current, []);
  const onCheckIn = useCallback(
    (userId: number, confidence: number) => queue.submit({ userId, confidence, displayName: `Employee #${userId}` }),
    [queue],
  );

  // ---- long-press corner hotspot to open diagnostics ----
  const pressTimer = useRef<number | null>(null);
  const startPress = () => {
    pressTimer.current = window.setTimeout(() => setDiagnostics(true), LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
  };

  // ---- render ----
  if (!started) {
    return (
      <div className="screen splash" onClick={start}>
        <div className="splash-inner">
          <img src="/icon.svg" width={96} height={96} alt="" />
          <h1>Mywe HR Attendance</h1>
          <p>Tap anywhere to start</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <div className="corner-hotspot" onPointerDown={startPress} onPointerUp={cancelPress} onPointerLeave={cancelPress} />

      <div className="status-bar">
        <ConnectionIndicator status={status} pending={queue.count} />
      </div>

      {session.status === 'bootstrapping' && <div className="screen splash"><div className="splash-inner"><p>Connecting…</p></div></div>}

      {session.status === 'unregistered' && (
        <RegistrationScreen identity={session.identity} error={session.error} loggingIn={session.loggingIn} onRegister={session.login} />
      )}

      {session.status === 'registered' && (
        <ScanScreen entriesRef={sync.entriesRef} getThreshold={getThreshold} onCheckIn={onCheckIn} onStats={setStats} />
      )}

      {diagnostics && (
        <DiagnosticsScreen
          device={session.device}
          cameraResolution={stats.cameraResolution}
          fps={stats.fps}
          modelsLoaded={stats.modelsLoaded}
          syncedAt={sync.syncedAt}
          enrollmentCount={sync.enrollmentCount}
          pending={queue.count}
          status={status}
          tokenExpiresAt={session.tokenExpiresAt}
          threshold={threshold}
          onThresholdChange={setThreshold}
          onForceSync={() => void doSync()}
          onClose={() => setDiagnostics(false)}
        />
      )}
    </div>
  );
}

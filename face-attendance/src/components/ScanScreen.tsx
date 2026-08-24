import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useCamera } from '../hooks/useCamera';
import { loadModels, modelsLoaded, detectorOptions, faceapi } from '../face/models';
import { matchDescriptor, type MatcherEntry } from '../face/matcher';
import { config } from '../config';
import type { SubmitOutcome } from '../hooks/useQueue';

export interface ScanStats {
  fps: number;
  modelsLoaded: boolean;
  cameraResolution: { width: number; height: number } | null;
}

type Overlay =
  | { mode: 'scanning' }
  | { mode: 'success'; title: string; subtitle: string; tone: 'ok' | 'already' | 'queued' }
  | { mode: 'failure'; title: string };

// The always-on scanning experience: live camera, a detection loop that draws a
// bounding box and matches faces locally, and the green/red result states that
// always return to scanning with no manual reset.
export function ScanScreen({
  entriesRef,
  getThreshold,
  onCheckIn,
  onStats,
}: {
  entriesRef: RefObject<MatcherEntry[]>;
  getThreshold: () => number;
  onCheckIn: (userId: number, confidence: number) => Promise<SubmitOutcome>;
  onStats: (stats: ScanStats) => void;
}) {
  const { videoRef, ready: cameraReady, error: cameraError, resolution } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(modelsLoaded());
  const [overlay, setOverlay] = useState<Overlay>({ mode: 'scanning' });

  const overlayRef = useRef<Overlay>(overlay);
  overlayRef.current = overlay;
  const busyRef = useRef(false); // a check-in POST is in flight
  const cooldownRef = useRef<Map<number, number>>(new Map());
  const failStreakRef = useRef(0);
  const resetTimerRef = useRef<number | null>(null);

  // fps bookkeeping
  const frameTimesRef = useRef<number[]>([]);
  const fpsRef = useRef(0);
  const lastStatsRef = useRef('');

  useEffect(() => {
    loadModels().then(() => setReady(true)).catch(() => setReady(false));
  }, []);

  // Report stats up to App (for the diagnostics screen) only when they change.
  const reportStats = useCallback(() => {
    const snapshot = JSON.stringify({ f: Math.round(fpsRef.current * 10), m: ready, r: resolution });
    if (snapshot !== lastStatsRef.current) {
      lastStatsRef.current = snapshot;
      onStats({ fps: fpsRef.current, modelsLoaded: ready, cameraResolution: resolution });
    }
  }, [onStats, ready, resolution]);

  useEffect(() => {
    reportStats();
  }, [reportStats]);

  const showResult = useCallback((next: Overlay, holdMs: number) => {
    setOverlay(next);
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setOverlay({ mode: 'scanning' }), holdMs);
  }, []);

  const handleMatch = useCallback(
    async (userId: number, confidence: number) => {
      const now = Date.now();
      const until = cooldownRef.current.get(userId) ?? 0;
      if (now < until) return; // this person just checked in — ignore
      if (busyRef.current) return;

      busyRef.current = true;
      // Start the cooldown immediately so a burst of frames can't double-fire
      // before the POST resolves.
      cooldownRef.current.set(userId, now + config.perUserCooldownMs);
      failStreakRef.current = 0;
      try {
        const result = await onCheckIn(userId, confidence);
        const name = `Employee #${userId}`;
        if (result.outcome === 'ok') {
          showResult({ mode: 'success', title: 'Welcome!', subtitle: `${name} — attendance recorded`, tone: 'ok' }, config.successDisplayMs);
        } else if (result.outcome === 'already') {
          showResult({ mode: 'success', title: 'Already checked in', subtitle: `${name} — you're all set for today`, tone: 'already' }, config.successDisplayMs);
        } else if (result.outcome === 'queued') {
          showResult({ mode: 'success', title: 'Saved offline', subtitle: `${name} — will sync when back online`, tone: 'queued' }, config.successDisplayMs);
        } else {
          // A real server rejection (e.g. policy) — clear cooldown so a retry
          // is possible, and show the failure state briefly.
          cooldownRef.current.delete(userId);
          showResult({ mode: 'failure', title: result.message }, config.failureDisplayMs);
        }
      } finally {
        busyRef.current = false;
      }
    },
    [onCheckIn, showResult],
  );

  // Detection loop.
  useEffect(() => {
    let active = true;
    let timer: number | null = null;

    const tick = async () => {
      if (!active) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const start = performance.now();

      if (ready && video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const detection = await faceapi
            .detectSingleFace(video, detectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (canvas) {
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            if (canvas.width !== vw || canvas.height !== vh) {
              canvas.width = vw;
              canvas.height = vh;
            }
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              if (detection) {
                const { x, y, width, height } = detection.detection.box;
                const scanning = overlayRef.current.mode === 'scanning';
                ctx.strokeStyle = scanning ? '#4f8cff' : '#22c55e';
                ctx.lineWidth = Math.max(3, canvas.width * 0.004);
                ctx.strokeRect(x, y, width, height);
              }
            }
          }

          if (detection && overlayRef.current.mode === 'scanning' && !busyRef.current) {
            const match = matchDescriptor(entriesRef.current, detection.descriptor, getThreshold());
            if (match) {
              void handleMatch(match.userId, match.confidence);
            } else {
              // Detected a face but no enrolled match — only flag failure after
              // a sustained streak so a half-turned head doesn't trip it.
              failStreakRef.current += 1;
              if (failStreakRef.current >= config.failedMatchThreshold) {
                failStreakRef.current = 0;
                showResult({ mode: 'failure', title: 'Not recognised' }, config.failureDisplayMs);
              }
            }
          } else if (!detection) {
            // No face in frame — decay the fail streak so people walking past
            // don't accumulate toward a false "not recognised".
            failStreakRef.current = Math.max(0, failStreakRef.current - 1);
          }
        } catch {
          /* a single dropped frame is fine; keep looping */
        }
      }

      // fps (rolling average over the last ~10 detections)
      const elapsed = performance.now() - start;
      const times = frameTimesRef.current;
      times.push(elapsed);
      if (times.length > 10) times.shift();
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      fpsRef.current = avg > 0 ? Math.min(1000 / Math.max(avg, config.detectIntervalMs), 1000 / config.detectIntervalMs) : 0;
      reportStats();

      timer = window.setTimeout(tick, config.detectIntervalMs);
    };

    tick();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, [ready, videoRef, entriesRef, getThreshold, handleMatch, showResult, reportStats]);

  return (
    <div className="screen scan">
      <video ref={videoRef} className="scan-video" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="scan-canvas" />

      {!ready && <div className="scan-hint">Loading face models…</div>}
      {ready && cameraError && <div className="scan-hint error">{cameraError} — check the camera and permissions</div>}
      {ready && !cameraError && !cameraReady && <div className="scan-hint">Starting camera…</div>}
      {ready && cameraReady && overlay.mode === 'scanning' && (
        <div className="scan-prompt">Look at the camera to check in</div>
      )}

      {overlay.mode === 'success' && (
        <div className={`result-overlay success tone-${overlay.tone}`}>
          <div className="result-icon">{overlay.tone === 'queued' ? '☁' : '✓'}</div>
          <div className="result-title">{overlay.title}</div>
          <div className="result-sub">{overlay.subtitle}</div>
        </div>
      )}
      {overlay.mode === 'failure' && (
        <div className="result-overlay failure">
          <div className="result-icon">!</div>
          <div className="result-title">{overlay.title}</div>
          <div className="result-sub">Please try again</div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import type { ConnectionStatus, DeviceInfo } from '../types';

function countdown(expiresAt: number | null, now: number): string {
  if (!expiresAt) return '—';
  const secs = Math.round((expiresAt - now) / 1000);
  if (secs <= 0) return 'expired (refreshing…)';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="diag-row">
      <span className="diag-label">{label}</span>
      <span className="diag-value">{value}</span>
    </div>
  );
}

// Reached via a deliberately non-accidental gesture (long-press a corner), not
// a casual tap — this is a shared physical device. Read-only status plus the
// one operator-tunable knob (match threshold) and a manual sync trigger.
export function DiagnosticsScreen({
  device,
  cameraResolution,
  fps,
  modelsLoaded,
  syncedAt,
  enrollmentCount,
  pending,
  status,
  tokenExpiresAt,
  threshold,
  onThresholdChange,
  onForceSync,
  onClose,
}: {
  device: DeviceInfo | null;
  cameraResolution: { width: number; height: number } | null;
  fps: number;
  modelsLoaded: boolean;
  syncedAt: string | null;
  enrollmentCount: number;
  pending: number;
  status: ConnectionStatus;
  tokenExpiresAt: number | null;
  threshold: number;
  onThresholdChange: (v: number) => void;
  onForceSync: () => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="screen diagnostics">
      <div className="diag-card">
        <div className="diag-head">
          <h2>Device Diagnostics</h2>
          <button className="diag-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="diag-grid">
          <Row label="Device name" value={device?.deviceName ?? '—'} />
          <Row label="Device ID" value={device?.id ?? '—'} />
          <Row label="Tenant ID" value={device?.tenantId ?? '—'} />
          <Row label="Connection" value={status} />
          <Row label="Token expires in" value={countdown(tokenExpiresAt, now)} />
          <Row label="Models loaded" value={modelsLoaded ? 'Yes' : 'Loading…'} />
          <Row label="Camera" value={cameraResolution ? `${cameraResolution.width}×${cameraResolution.height}` : 'Not ready'} />
          <Row label="Detection FPS" value={fps ? fps.toFixed(1) : '—'} />
          <Row label="Cached enrollments" value={enrollmentCount} />
          <Row label="Last sync" value={syncedAt ? new Date(syncedAt).toLocaleString() : 'never'} />
          <Row label="Offline queue" value={pending} />
        </div>

        <div className="diag-threshold">
          <label>
            Match threshold: <strong>{threshold.toFixed(2)}</strong> (lower = stricter)
            <input
              type="range"
              min={0.3}
              max={0.8}
              step={0.01}
              value={threshold}
              onChange={(e) => onThresholdChange(Number(e.target.value))}
            />
          </label>
        </div>

        <button className="diag-sync" onClick={onForceSync} disabled={status === 'offline'}>
          Force sync now
        </button>
      </div>
    </div>
  );
}

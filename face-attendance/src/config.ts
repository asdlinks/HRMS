// Central tunables for the kiosk. Anything a deployer might reasonably want to
// adjust per-site is read from a Vite env var (VITE_*) with a sane default, and
// the face-match threshold is additionally overridable at runtime from the
// diagnostics screen (persisted in localStorage) without a rebuild.

function envNum(key: string, fallback: number): number {
  const raw = import.meta.env[key as keyof ImportMetaEnv] as string | undefined;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  // All API traffic is same-origin and proxied to the HRMS server (see vite.config.ts).
  apiBase: '/api',

  // face-api.js descriptor model. Stored alongside enrollments so a future
  // model upgrade can be detected; all v0.22.2 descriptors are 128-d.
  modelVersion: 'face-api.js@0.22.2',

  // Kiosk access token TTL is 5 minutes (server utils/tokens.js KIOSK_ACCESS_TTL).
  // Refresh proactively this many ms BEFORE expiry so a call never rides an
  // already-dead token. 60s skew against a 5m token.
  tokenRefreshSkewMs: envNum('VITE_TOKEN_REFRESH_SKEW_MS', 60_000),

  // Pull the enrollment set this often while online so matching keeps working
  // through an outage from the last cached copy.
  syncIntervalMs: envNum('VITE_SYNC_INTERVAL_MS', 5 * 60_000),

  // Retry the offline check-in queue on this cadence (in addition to the
  // browser 'online' event).
  queueFlushIntervalMs: envNum('VITE_QUEUE_FLUSH_INTERVAL_MS', 20_000),

  // Face detection cadence against the live video.
  detectIntervalMs: envNum('VITE_DETECT_INTERVAL_MS', 400),

  // euclideanDistance below this = a match. Lower is stricter. 0.5–0.6 is the
  // usual face-api.js range; runtime-overridable from diagnostics.
  matchThreshold: envNum('VITE_MATCH_THRESHOLD', 0.55),

  // Don't re-fire a check-in for the same person within this window even if
  // they keep standing in frame.
  perUserCooldownMs: envNum('VITE_PER_USER_COOLDOWN_MS', 60_000),

  // A detected face must fail to match this many consecutive detections before
  // we show the red "not recognised" state — avoids a hair-trigger on a
  // half-turned head or motion blur.
  failedMatchThreshold: envNum('VITE_FAILED_MATCH_THRESHOLD', 12),

  // How long the green success / red failure states stay up before the loop
  // returns to scanning.
  successDisplayMs: envNum('VITE_SUCCESS_DISPLAY_MS', 2500),
  failureDisplayMs: envNum('VITE_FAILURE_DISPLAY_MS', 1800),

  // tinyFaceDetector input size (must be a multiple of 32). Smaller = faster.
  detectorInputSize: envNum('VITE_DETECTOR_INPUT_SIZE', 320),
  detectorScoreThreshold: envNum('VITE_DETECTOR_SCORE_THRESHOLD', 0.5),
} as const;

const THRESHOLD_KEY = 'kiosk.matchThreshold';

export function getMatchThreshold(): number {
  const stored = Number(localStorage.getItem(THRESHOLD_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : config.matchThreshold;
}

export function setMatchThreshold(value: number): void {
  localStorage.setItem(THRESHOLD_KEY, String(value));
}

// Local calendar date as YYYY-MM-DD (the server keys attendance by local day).
export function todayLocalDate(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

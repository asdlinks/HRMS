# Mywe HR — Face Recognition Attendance Kiosk (PWA)

A **standalone, installable** kiosk web app that records attendance by
recognising employees' faces. It runs on a permanently-mounted device at an
office entrance (tablet / wall display / reception PC) and authenticates as a
**device**, never as an employee — there is deliberately **no human login
form** anywhere in this app.

It is a sibling to `client/` (the HRMS SPA) and `server/` (the API). It ships
its own `package.json` / `node_modules` and talks to the **same** backend the
HRMS uses, via the already-built Stage 1 endpoints. No backend or `client/`
changes are needed to run it.

## Running it

```bash
cd face-attendance
npm install
npm run dev        # http://localhost:5174  (HRMS client uses 5173)
```

The dev server proxies `/api` to `http://localhost:5001` (the HRMS API). Start
the API first (`cd server && npm run dev` or however it's normally started).
Override the target if your API runs elsewhere:

```bash
API_TARGET=http://localhost:5001 npm run dev
```

Production build / preview:

```bash
npm run build      # type-checks then builds to dist/
npm run preview    # serves dist/ on 5174, still proxying /api
```

For a real deployment, serve `dist/` as static files behind a reverse proxy
that forwards `/api` to the HRMS server — exactly how the main `client/` is
served in production. Keeping `/api` same-origin means the httpOnly device
refresh cookie and CORS both "just work".

## Device provisioning flow (end to end)

1. **HR creates the device in the HRMS admin UI.** In the HRMS, open the
   *Kiosk Devices* page and add a device (`POST /api/kiosk-devices`). The server
   returns a **one-time device key** that is shown **once** — HR copies it.
2. **Operator pairs this kiosk once.** On first launch this app shows a
   *Device Registration* screen. The operator enters the **company code**, the
   **device name** (exactly as HR named it) and the **device key**. The app
   calls `POST /api/auth/kiosk-login`.
3. **A secure session is established.** The server returns a short-lived
   (5-minute) device access token and sets a **90-day httpOnly refresh cookie**
   (path `/api/auth`). From then on the kiosk silently refreshes
   (`POST /api/auth/kiosk-refresh`) and resumes automatically on reboot — the
   registration screen is never shown again unless the session is revoked.

> **The raw device key is NEVER persisted** — not in localStorage, not in
> IndexedDB. Only the in-memory access token and the httpOnly cookie (which JS
> can't read) survive. Non-secret identity (device name / company code / device
> id) is cached in localStorage only so the registration screen can show
> "Previously registered as …".

To **revoke** a kiosk, HR flips the device's status in the HRMS; the next
refresh (≤5 min later) fails and the kiosk drops back to the registration
screen.

## How the pieces fit together

| Concern | Where | Notes |
| --- | --- | --- |
| Device auth | `src/hooks/useKioskSession.ts`, `src/api/client.ts` | cold-start refresh, proactive 5-min refresh timer, reactive 401 retry via `kiosk-refresh` |
| Embedding sync | `src/hooks/useSync.ts`, `src/db/idb.ts` | pulls active enrollments every ~5 min, caches them in IndexedDB so matching survives outages |
| Face detection + recognition | `src/components/ScanScreen.tsx`, `src/face/*` | 100 % **in-browser** with face-api.js; only a resolved `userId` is ever sent |
| Offline queue | `src/hooks/useQueue.ts`, `src/db/idb.ts` | network-failed check-ins are queued with their idempotency key and flushed on reconnect |
| Connection status | `src/hooks/useConnection.ts`, `src/components/ConnectionIndicator.tsx` | always-visible online / offline / syncing pill |
| Diagnostics | `src/components/DiagnosticsScreen.tsx` | reached by **long-pressing the top-left corner** (~1.2 s) — not a casual tap |

### Recognition

All matching is done client-side with **face-api.js 0.22.2**:
`tinyFaceDetector` → `faceLandmark68Net` → `faceRecognitionNet` produce a
128-dimensional descriptor, matched by `euclideanDistance` against the synced
enrollment set. The default threshold is `0.55` (lower = stricter) and is
tunable live from the diagnostics screen. The server stores enrollments as
face-api.js 128-d descriptors (see
`server/migrations/mssql/017_face_enrollments.sql`) and does **no** matching
itself.

> **Note:** the embeddings-sync endpoint returns only `userId` per enrollment
> (never names — a kiosk is not allowed to enumerate who's who), so the success
> screen greets by "Employee #<id>" rather than by name. See the report / code
> comments for this deliberate limitation.

### Model weight files

face-api.js does **not** bundle model weights in the npm package. They were
downloaded into `public/models/` from the official repository:

```
https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/
  tiny_face_detector_model-weights_manifest.json  + tiny_face_detector_model-shard1
  face_landmark_68_model-weights_manifest.json    + face_landmark_68_model-shard1
  face_recognition_model-weights_manifest.json    + face_recognition_model-shard1, -shard2
```

They are loaded at runtime with `faceapi.nets.<net>.loadFromUri('/models')`.

## PWA / offline

`public/manifest.json` + `public/sw.js` make the app installable in fullscreen
and let the **app shell + model files** survive a brief network blip. The
service worker deliberately does **not** touch `/api` traffic — the offline
check-in queue lives in IndexedDB (`src/db/idb.ts`) and works whether or not the
service worker is registered.

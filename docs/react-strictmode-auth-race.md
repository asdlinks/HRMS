# Finding: session-rehydration race under React StrictMode

**Status:** Confirmed, not yet fixed. **Owner:** frontend/auth.
**Scope:** Application code (`client/src/auth/AuthContext.tsx`). Independent of the
Playwright E2E framework — discovered while building it, but affects any
browser session, automated or human.

## Root cause

`client/src/auth/AuthContext.tsx` rehydrates the session on every page load
with an unguarded effect:

```tsx
useEffect(() => {
    api.setSessionHandlers({ onRefreshed: applySession, onExpired: clearSession });
    (async () => {
        try {
            const { data } = await api.refreshSession();
            applySession(data);
        } catch {
            clearSession();
        } finally {
            setLoading(false);
        }
    })();
}, [applySession, clearSession]);
```

`client/src/main.tsx` renders the app inside `<React.StrictMode>`. In
development builds, React 18's StrictMode deliberately mounts a component,
runs its effects, discards that render, and mounts it again — specifically to
surface effects with side effects that aren't idempotent or cancellable. This
effect has no mount-guard and no cleanup/abort logic, so **both invocations
independently call `POST /api/auth/refresh`**, each presenting whatever
refresh-token cookie was current in the browser at the moment they fired —
which, since both fire back-to-back before either's request resolves, is
usually the *same* cookie value.

On the server (`server/routes/auth.routes.js`), refresh tokens are single-use
and rotate on every call. If a token that's already been rotated is presented
again, the server treats it as theft and revokes **every** refresh token for
that user (`revokeAllUserRefreshTokens`), not just the one being replayed:

```js
if (stored.revoked_at) {
    await authRepo.revokeAllUserRefreshTokens(stored.user_id);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    throw new HttpError(401, 'Session invalidated, please log in again');
}
```

So: whichever of the two StrictMode-duplicated requests resolves second
presents an already-rotated cookie, and the server responds by silently
logging out **every active session that user has**, including in completely
unrelated browser tabs or automated test workers.

## Why it occurs

1. `<React.StrictMode>` is enabled in `main.tsx`, and its double-invoke-effects
   behavior is active in development builds (React strips it in production).
2. The rehydration effect performs a non-idempotent, non-cancellable network
   call with no ref-guard to prevent a second concurrent invocation.
3. The server's refresh-token rotation is user-scoped on reuse detection
   (correct, standard practice for theft detection) but has no tolerance
   window for a near-simultaneous duplicate presentation of the same token
   from the same origin.

## How this was found

While building the Playwright E2E framework's `AuthenticationManager`, cached
sessions for the most heavily-used test persona (`admin`) were observed
expiring far more often than for lightly-used personas, even though each
worker slot holds its own independent refresh-token lineage and never shares
a cookie with another slot. Direct verification:

- Extracted a refresh-token cookie value straight from a session file the
  moment after it was written and confirmed via `curl` that the server
  accepted it and rotated it correctly — ruling out file corruption or a
  stale/expired token.
- Confirmed the *pattern* was specific to whichever persona had the most
  page-mounts across the run (i.e. the most opportunities for the race),
  and that a **single occurrence invalidated every other slot's session for
  that same user**, consistent with the user-scoped (not token-scoped)
  revocation on reuse detection.
- Confirmed `React.StrictMode` is active and the effect has no mount-guard.

## Production impact

**None, if the production build is used as intended.** React strips
StrictMode's double-invoke behavior from production bundles — this is a
development/staging-only symptom of `dev.mywetechnologies.com` running an
unminified/dev-mode build. If any deployed environment intended to represent
"production" is *actually* running a dev-mode build (rather than
`vite build` output), this becomes a live, production-facing bug: a real
user's session (and every other tab/device they're logged into) could be
silently logged out at essentially random intervals tied to how often they
navigate.

## Development/staging impact

Directly reproducible on `dev.mywetechnologies.com` today. Impact:

- Occasional, non-deterministic "logged out" experience for a developer or
  tester manually using the dev environment, with no visible error beyond
  being returned to the login page.
- In automated testing, this is **fully absorbed** by
  `AuthenticationManager`'s recovery logic (`[SESSION EXPIRED]` →
  `[LOGIN]` → `[SESSION RECOVERED]`) — no test fails because of it — but it
  does mean a heavily-used test persona logs in more often than the
  framework's steady-state design target of "once per worker slot," which is
  worth knowing when interpreting login-volume numbers against the server's
  rate limiter.

## Recommended application fix

Guard the effect so only the first real mount performs the refresh call,
regardless of how many times StrictMode invokes it:

```tsx
const hasRehydrated = useRef(false);

useEffect(() => {
    if (hasRehydrated.current) return;
    hasRehydrated.current = true;

    api.setSessionHandlers({ onRefreshed: applySession, onExpired: clearSession });
    (async () => {
        try {
            const { data } = await api.refreshSession();
            applySession(data);
        } catch {
            clearSession();
        } finally {
            setLoading(false);
        }
    })();
}, [applySession, clearSession]);
```

This is the standard, minimal-diff pattern for making a StrictMode-sensitive
mount effect idempotent without disabling StrictMode itself (which has other,
unrelated value for catching bugs elsewhere in the app). It requires no
server-side change and does not affect the theft-detection logic, which
should remain as-is for genuine reuse-after-rotation scenarios.

This fix is **not** included in the Playwright authentication framework
changes — it is application code, out of scope for that work, and is
recorded here for the frontend/auth owner to review and apply independently.

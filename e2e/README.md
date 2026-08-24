# Employee Master E2E Suite (Playwright)

Automates the browser-drivable test cases from `docs/EmployeeMaster_TestCases.csv`
(Page Object Model, data-driven, tagged `@smoke`/`@regression`/`@sanity`).

## Scope

Only UI-reachable cases are automated. Not automated (need DB access, load
tooling, or aren't reachable through any page in this app): Database
Validation (`EM-DB-*`), Performance (`EM-PF-*`), and a few Security/Validation
rows that require raw JSON/DB inspection (`EM-SC-01` partially covered via the
profile page, `EM-SC-02`, `EM-SC-03`, `EM-SC-09`, `EM-VD-06`, `EM-VD-11`,
`EM-VD-12`, `EM-NG-16`, `EM-NG-19`, `EM-NG-20`). Each spec file's tests are
commented with the CSV Test ID(s) they cover.

## One-time setup

```bash
npm install                      # installs @playwright/test, already run once
npx playwright install chromium  # browser binary, already run once
cp e2e/.env.e2e.example e2e/.env.e2e
```

Fill in `e2e/.env.e2e` with real credentials for the dev tenant at
`E2E_BASE_URL` (defaults to `https://dev.mywetechnologies.com`). Every persona
is optional — a persona left blank makes every spec that needs it **skip**
(not fail) with a message naming what's missing. See the comments in
`e2e/.env.e2e.example` for exactly which permission set each persona needs.

**Tenant data prerequisite**: creation flows require the tenant to have at
least one Department and one Designation already configured — the suite
picks the first real option in those (required) dropdowns since it can't know
tenant-specific lookup values in advance (`EmployeeFormDialog.selectRequiredLookups()`).

## Running

```bash
npm run e2e              # everything
npm run e2e:smoke        # @smoke only — critical happy paths
npm run e2e:regression   # @regression — negative/validation/edge coverage
npm run e2e:sanity       # @sanity — lighter visibility/gating checks
npm run e2e:ui           # Playwright's interactive UI mode
npm run e2e:report       # open the last HTML report
npm run e2e:typecheck    # tsc --noEmit over the whole suite
```

Screenshots, traces, and video are captured automatically on failure
(`playwright.config.ts` → `use: { screenshot, trace, video }`).

## Layout

```
e2e/
  config/auth.config.ts           single source of truth for every auth-related
                                  setting (endpoints, timeouts, retry count,
                                  cross-run mode, verbosity) — no magic values
                                  live in AuthenticationManager itself
  auth/AuthenticationManager.ts   the ONLY place auth logic lives: login,
                                  storage-state creation/loading/validation,
                                  recovery, file management, logging
  auth/types.ts                   shared types/interfaces for the above
  global-setup.ts                 runs once per `npm run e2e` invocation —
                                  clears cached sessions unless E2E_REUSE_AUTH=true
  fixtures/personas.ts             persona credential loading + personaUserFile() path
  fixtures/auth.ts                 thin Playwright-fixture wrapper around
                                  AuthenticationManager (adminPage/managerPage/...,
                                  skip if persona unconfigured)
  fixtures/test-data.ts            data-driven boundary/validation datasets, uniqueEmployee()
  pages/                           Page Object Model — one class per page/dialog/component
  tests/*.spec.ts                  one file per feature area (see file names)
```

### Authentication architecture

All authentication — login, storage-state creation/loading/validation,
session recovery, file management, and logging — is centralized in
`AuthenticationManager` (`auth/AuthenticationManager.ts`), configured
entirely through `AuthConfig` (`config/auth.config.ts`). `fixtures/auth.ts`
is a thin wrapper: it only wires that class into Playwright's fixture
lifecycle (`adminPage`, `managerPage`, etc.) and closes the browser context
afterward. **If you're changing *how* auth works, change
`AuthenticationManager` or `auth.config.ts`; `auth.ts` should never need
auth-specific logic added to it, and no other file in the suite should touch
cookies, the login endpoint, or a session file directly.**

```
                         ┌─────────────────────────┐
   test needs            │   fixtures/auth.ts       │   thin Playwright glue —
   `adminPage`  ────────► │   (usePersonaPage)       │   no auth logic here
                         └────────────┬─────────────┘
                                      │ acquireSession(persona, browser)
                                      ▼
                         ┌─────────────────────────┐
                         │  AuthenticationManager   │◄── config/auth.config.ts
                         │  (one per worker slot)   │    (endpoints, timeouts,
                         └────────────┬─────────────┘     retries, mode, logging)
                                      │
                    ┌─────────────────┼──────────────────┐
                    ▼                 ▼                  ▼
             read/write         login via a       validate/refresh via
             e2e/.auth/         scratch API       a scratch API context
             <persona>.         context (not      (POST /api/auth/refresh,
             slot<N>.json       rate-limited      not rate-limited, no
                                except login)     browser page involved)
```

**Why login happens per worker slot, not per test.** Each configured persona
logs in via a direct `POST /api/auth/login` call (not the UI), but only once
per (persona, worker slot) — not once per test. The resulting session is
persisted to `e2e/.auth/<persona>.slot<N>.json`, where `N` is Playwright's
`parallelIndex` (a stable slot number 0..workers-1 — *not* the ever-increasing
`workerIndex`). Every test still gets its own fresh `browser.newContext()`,
seeded from that file; at teardown, the context's *current* storage state is
written back to the same file for the next test in that slot.

**Why it has to be per-slot, not one shared login for everyone.** The app's
`AuthContext` proactively calls `POST /api/auth/refresh` on every page mount
(`client/src/auth/AuthContext.tsx`), and the server rotates the refresh-token
cookie on every such call, revoking *all* of a user's sessions if an
already-rotated cookie is ever replayed (theft detection —
`server/routes/auth.routes.js`). Two concurrently-running contexts that share
one refresh-token lineage will race: whichever loses gets its whole session
revoked. Giving each worker slot its own independent lineage means no two
*concurrent* contexts ever present the same cookie — the only way to keep
parallelism safe against this auth design without an app change.

**Why a recycled worker doesn't cost another login.** Playwright can
tear down and replace a worker process after a test failure — a new process,
with nothing in memory. Because the session cache lives on disk keyed by slot
(not in the process's memory keyed by its own `workerIndex`), the replacement
process picks up the same slot's file and reuses it instead of logging in
again. A worker failing 10 times in a row still costs zero extra logins.

**Why validation is an API call, not a page navigation.** Confirming a
cached session is still good — and picking up its current, possibly
already-rotated cookie — is done with a single `POST /api/auth/refresh`
against a throwaway `APIRequestContext`, not by opening a browser page and
checking where it redirects to. That endpoint is exactly what the app itself
uses to answer "is this session valid", it's *not* subject to the login rate
limiter (only `POST /api/auth/login` is), and an HTTP status code is a
direct, deterministic signal — no browser launch, no rendering, no
navigation-timing heuristics. A full page load is only ever used for the
handoff to the actual test, never for validation.

**Recovery from an invalid/expired session.** If that refresh call comes
back non-2xx, the cached file is deleted and exactly one fresh login is
performed. If the login itself fails for an auth-level reason (bad
credentials, rate-limited — anything the server responded to with a non-2xx
status), it fails immediately with a clear `AuthenticationError`; there is no
retry loop for that. A *transient*, connection-level failure on the login
call (timeout, connection reset) is retried up to
`AuthConfig.maxRecoveryAttempts` times — see "Error handling" below.

#### Recovery flow

```
resolveState(persona)
        │
        ▼
  read cached file ──► missing? ──► [CACHE MISS] ──► login() ──► done
        │
        ▼ found
   [CACHE HIT]
        │
        ▼
  POST /api/auth/refresh (scratch APIRequestContext, cheap, not rate-limited)
        │
   ┌────┴────┐
  2xx        non-2xx / network error
   │              │
   ▼              ▼
[SESSION      [SESSION EXPIRED]
 VALID]            │
   │          delete cached file
   │               │
   │               ▼
   │           login() ── AuthenticationError (bad creds/429)? ──► throw immediately
   │               │
   │               ▼ success
   │        [SESSION RECOVERED]
   │               │
   └───────┬───────┘
           ▼
   write current state to disk, hand to test
```

### Configuration guide

Every configurable value lives in `config/auth.config.ts` — nothing in
`AuthenticationManager` is a hardcoded literal.

| Setting | Source | Default | Purpose |
|---|---|---|---|
| `authDir` | fixed | `e2e/.auth` | where session files live |
| `baseURL` | `E2E_BASE_URL` | `https://dev.mywetechnologies.com` | app origin for login/refresh calls |
| `tenantCode` | `E2E_TENANT_CODE` (via `fixtures/personas.ts`) | — | sent with every login |
| `loginEndpoint` / `refreshEndpoint` | fixed | `/api/auth/login` / `/api/auth/refresh` | the two auth API routes |
| `requestTimeoutMs` | fixed | 15000 | timeout on the login/refresh HTTP calls |
| `maxRecoveryAttempts` | fixed | 2 | retries for a *transient* (network) login failure only |
| `reuseAcrossRuns` | `E2E_REUSE_AUTH` | `false` | see "Cross-run authentication behavior" |
| `verboseLogging` | `E2E_AUTH_VERBOSE` | `false` | also log routine cache-hit/session-valid lines |

To change a default, edit `config/auth.config.ts` directly (the fixed values)
or the corresponding env var in `e2e/.env.e2e` (the overridable ones). Don't
add a second place that reads these — if a new module needs a different
setting, it almost certainly doesn't: authentication is per-persona, not
per-module (see "Future module compatibility" below).

### Cross-run authentication behavior

By default (`E2E_REUSE_AUTH` unset), `global-setup.ts` clears every cached
session file (`e2e/.auth/*.slot*.json`) once, before any worker starts, so
**every run regenerates its own logins from scratch** — you never rely on a
session left over from a previous, possibly much-earlier, run.

Set `E2E_REUSE_AUTH=true` (in `e2e/.env.e2e` or the shell) to skip that clear
and let already-valid cached sessions carry over between separate
`npm run e2e` invocations. In this mode, `global-setup.ts` also prunes any
session file whose slot number is beyond the current run's `workers` count,
so lowering `workers` between sessions doesn't leave orphaned files behind.

| | Default (unset) | `E2E_REUSE_AUTH=true` |
|---|---|---|
| First run ever | `workers × personas` logins | `workers × personas` logins |
| Next run, same day | `workers × personas` logins again | 0 logins for personas whose session is still valid |
| Safety | Always fresh; never trusts old state | Still self-heals — an invalid/expired cached session logs in again automatically, it's just not forced to |
| Best for | CI, shared/unattended runs, anything security-sensitive | Rapid local iteration, a CI cache step you trust |

**`workers × personas` is a best case, not a hard ceiling, when Playwright
`retries` is enabled** (`playwright.config.ts` sets `retries: 2` in CI). A
retried test isn't guaranteed to land back in the same worker slot as its
original attempt, so a run with many retried failures can trigger more
logins than the simple `workers × personas` count — each retry that lands in
a slot that's never seen that persona before is a legitimate cache miss, not
a bug. The real worst case is closer to `(workers + total retries across the
run) × personas`.

**`E2E_REUSE_AUTH=true` provides no benefit on ephemeral CI runners** — a
fresh container/checkout on every run means there's nothing in `e2e/.auth/`
to reuse in the first place, so this mode only pays off on a local machine or
a self-hosted/persistent runner whose workspace survives between runs (or a
CI setup that explicitly caches `e2e/.auth/` between jobs).

Either way, a session is only ever reused after `AuthenticationManager`
confirms it against a live `/api/auth/refresh` call — reuse is never blind.
A heavily-used persona (in this suite, `admin`) may still trigger more logins
than the ideal "once per slot" in either mode — see "Troubleshooting" below,
this is a known, separately-tracked application-level issue, not a bug in
this framework.

### Troubleshooting guide

**"`[LOGIN]` keeps appearing for the same persona far more than
`workers` times in one run."** Check whether it's specifically the `admin`
persona (or another heavily-used one). This is a known upstream issue: the
app's `AuthContext` can occasionally revoke *all* of a user's sessions across
every slot due to a React StrictMode double-invoked effect — see
`docs/react-strictmode-auth-race.md`. `AuthenticationManager` self-heals it
automatically (you'll see `[SESSION EXPIRED]` → `[LOGIN]` →
`[SESSION RECOVERED]`); it costs an extra login, it doesn't fail the test.

**"`Login failed ... 429 Too many login attempts"` / `AuthenticationError`
thrown immediately.** The server's login rate limiter (20 requests / 15
minutes per IP — `server/routes/auth.routes.js`) is exhausted. Lower
`workers` (cost is `workers × personas` per cold start), wait for the window
to reset, or reduce how often you run the full suite back-to-back. This is
never retried automatically — retrying into an active rate limit only makes
it worse.

**"A test is stuck on the login page / `getByRole('heading', {name: 'Welcome
Back'})` shows up in a failure's page snapshot."** This means a session that
`AuthenticationManager` believed was valid stopped being valid *during* the
test itself (after the manager handed off the page) — almost always the same
StrictMode race, happening inside the test's own page mount rather than
during the manager's validation step. Re-run the specific test; if it's
persistent rather than occasional, it's a different issue — check the
server/app logs, not this framework.

**"Nothing in `e2e/.auth/` after a run."** Check credentials are actually
set in `e2e/.env.e2e` for that persona — `hasCredentials()` returning false
causes a clean `test.skip()`, not a file write. Look for a "Persona ... is
not configured" skip message in the test output.

**"A `.slot<N>.json` file looks wrong / I want to force a fresh login."**
Delete the specific file, or delete the whole `e2e/.auth/` directory — it's
regenerated automatically on next use. In default mode this happens for you
automatically at the start of every run anyway.

### Best practices

- **Never read or write an `e2e/.auth/*.json` file from a spec file.** If a
  test needs identity info, use `readPersonaUser()` (`fixtures/personas.ts`),
  which reads the small `.user.json` sidecar — not the session file.
- **Never call `/api/auth/login` or set auth cookies directly in a test.**
  Use the existing `adminPage`/`managerPage`/etc. fixtures; if a new
  permission combination is needed, add a persona to
  `fixtures/personas.ts` + `e2e/.env.e2e.example`, not a one-off login in a
  spec file.
- **New feature-module spec files need zero auth code.** Import
  `test`/`expect` from `fixtures/auth.ts` and use the persona fixture that
  matches the permission you're testing — see "Future module compatibility."
- **Prefer `E2E_AUTH_VERBOSE=true` over adding `console.log` calls** when
  debugging the auth layer — it's already wired to show cache hits and
  session-valid checks; don't reintroduce ad hoc logging in
  `AuthenticationManager`.
- **Don't lower `maxRecoveryAttempts` to 1 to "fail faster.**" It only
  governs retries for genuine network-level failures (connection errors,
  timeouts) — auth-level failures already fail on the first attempt
  regardless of this setting.

### Future module compatibility

Adding tests for Company, Branch, Department, Designation, Shift, Employee,
Attendance, Leave, Payroll, Reports, Platform Admin, Subscription, or any
other HRMS module requires **no changes to the authentication framework**.
Every module is reached through the same RBAC personas
(`admin`/`manager`/`hrDirectory`/`usersManageOnly`/`employeeSelf`), each
already carrying whatever permission set that module's tests need to
exercise (see `e2e/.env.e2e.example` for exactly which permissions each
persona has). A new spec file just imports the existing fixtures:

```ts
import { test, expect } from '../fixtures/auth';

test('a payroll test', async ({ adminPage }) => {
  await adminPage.goto('/payroll');
  // ...
});
```

If a genuinely new *permission combination* is needed that none of the
existing five personas has, add one more persona to `PERSONAS` in
`fixtures/personas.ts` and document its credentials in
`e2e/.env.e2e.example` — `AuthenticationManager` picks it up automatically
without any code change, since it operates on `PersonaKey` generically and
has no per-module branching anywhere in it.

## Design notes / known caveats

- **No `data-testid` convention exists in this codebase.** Locators use
  `getByLabel`/`getByRole`/visible text throughout. A few icon-only delete
  buttons (Branch/Designation/Employment Type/Department rows) have no
  accessible name at all — those use a structural locator (nearest row, then
  its one `IconButton`) instead.
- Row action buttons (Edit/Delete/etc. in the Employees table) *do* get a
  reliable accessible name from MUI: `Tooltip`'s `describeChild` defaults to
  `false`, so it sets `aria-label` = the tooltip title unconditionally —
  confirmed by reading `node_modules/@mui/material/Tooltip/Tooltip.js`
  directly rather than assumed.
- `EM-FN-17`/`EM-NG-10` need a pre-locked account. Set `E2E_LOCKED_ACCOUNT_NAME`
  to an employee who is already locked (`locked_until` in the future) — the
  suite only looks them up by name and never attempts to log in as them.
- This suite has been syntax- and type-checked (`npm run e2e:typecheck`,
  `playwright test --list`) but **not run against a live login** — no working
  credentials were available at authoring time. Expect to spend a first pass
  fixing any locator that assumed DOM structure slightly differently than the
  real deployed app renders it.

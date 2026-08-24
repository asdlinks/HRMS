# Milestone 1 — Foundation Cutover: SQL Server + Real Auth + Configurable RBAC

Status: **complete**. Plan: `C:\Users\vishnupriya\.claude\plans\swirling-dreaming-narwhal.md`

## What this milestone did

1. Cut the running app over from SQLite (`server/db.js`) to SQL Server (`db_mywe_hrms`) — the app no longer reads or writes the SQLite file.
2. Replaced the login system with real JWT auth (access token in memory + httpOnly-cookie refresh token, rotated on every refresh, revoked on logout/reuse-detection).
3. Replaced the hardcoded 4-role string model with a database-driven RBAC system (`roles`, `permissions`, `role_permissions`, `user_roles`) that a System Administrator can reconfigure without a code deploy.
4. Restructured the 876-line monolithic `server/index.js` into `config/ → db/ → repositories/ → middleware/ → routes/`, so future modules (Payroll, etc.) can be added without editing a shared file.
5. Fixed two real, previously-live vulnerabilities (below) plus one found during verification.

## Security fixes (not just refactoring)

| # | Issue | Where | Fix |
|---|---|---|---|
| 1 | Every protected route trusted `requesterRole`/`requesterId` sent by the **client** in the request body/query — any caller could claim `requesterRole=super_admin` and get admin-level responses. | `server/index.js` (old) | `middleware/auth.js` verifies a JWT and sets `req.auth` server-side; nothing reads client-supplied identity anymore. Regression-tested: replaying the old spoofed-role payload now returns 403. |
| 2 | `POST /api/login` returned the full `users` row, including the bcrypt password hash, to the client. | `server/index.js` (old) | `routes/auth.routes.js` explicitly strips `password` before responding. |
| 3 | `PATCH /api/users/:id/reset-password` had no authorization check at all — anyone who could reach the API could reset any user's password. | `server/index.js` (old) | Gated behind a new `users.password.reset` permission, deliberately kept separate from `users.manage`/`users.view.*` so granting "can reset passwords" doesn't also grant browsing access to employee data. |
| 4 | *(found during verification)* `GET /api/users` and `GET /api/users/:id` used `SELECT users.*`, leaking every user's bcrypt password hash to any caller who could list the directory — and the new RBAC model widened who could call it (employees now have directory read). | `server/repositories/users.repository.js` | Replaced with an explicit safe-column list everywhere except the one function (`getUserWithPassword`) used solely for internal bcrypt comparisons. |

## RBAC model

- **`permissions`** — a fixed vocabulary (21 codes), not tenant-scoped. One taxonomy covers view/apply/approve-style capabilities across leaves, attendance, users, departments, locations, holidays, settings, reports, notifications, voice.
- **`roles`** — tenant-scoped, editable, seeded with the 4 legacy roles (`employee`, `manager`, `hr`, `super_admin`) marked `is_system` (protects them from deletion, not from edit).
- **`role_permissions`** — the actual configurable lever. Edit this table (eventually via an admin UI in a later milestone) to change what a role can do.
- **`user_roles`** — many-to-many, so a user can hold more than one role later without a schema change.
- `users.role` (the old CHECK-constrained string) is **kept, not dropped**, as a one-milestone rollback safety net. No new code reads it for authorization.
- No `menu_items` table yet — `client/src/config/menuConfig.js` declares sidebar entries with a `requiredPermission`, filtered against the permissions returned at login. A DB-backed version is a natural follow-up once an admin editor screen exists.

Seed script (`server/migrations/mssql/005_seed_rbac_assignments.js`) is idempotent — re-running it is safe and applies any new permission grants without duplicating roles or assignments. Verified by running it twice (0 new rows on the second run).

### Notable permission-design decision: `users.view.directory`

The original `GET /api/users` had no restriction in its "list everyone" branch — any authenticated caller (including employees) got the full non-admin directory. Gating that endpoint behind `users.view.team`/`users.view.all` (manager/hr/admin only) would have silently broken `MyTeamPage`, an employee-facing feature. Added `users.view.directory` — granted to **all four roles** — for basic name/department read access, while `users.view.team`/`users.view.all` remain required for the fuller Employees management page (create/edit/delete).

## Auth flow

- `POST /api/auth/login` — body `{ tenantCode, email, password }`. Resolves tenant by `slug`, then user by `(tenant_id, email)`. Returns `{ accessToken, user, permissions }` and sets an httpOnly refresh cookie scoped to `/api/auth`.
- `POST /api/auth/refresh` — reads the cookie, rotates it, returns a new access token. Reuse of an already-rotated (revoked) token revokes every session for that user (theft response) — verified.
- `POST /api/auth/logout` — revokes the current refresh token, clears the cookie.
- `POST /api/auth/change-password` — identity from the verified token, not a body field.
- **No self-service "forgot password."** By design (explicit product decision): an employee who forgets their password contacts HR/an admin, who resets it via `PATCH /api/users/:id/reset-password` (gated by `users.password.reset`). No email package, no reset-token table.
- Zero `localStorage` use for auth. Access token lives in a JS variable inside `AuthContext`; on page load the app attempts a silent `POST /api/auth/refresh` (cookie sent automatically) to rehydrate the session.

## Files

```
server/
  config/env.js                          -- env validation + connection-string parsing, shared
  db/pool.js, db/sql.js                  -- mssql connection pool + thin query/transaction helpers
  middleware/auth.js                     -- JWT verification -> req.auth
  middleware/authorize.js                -- requirePermission()/requireAnyPermission()
  middleware/errorHandler.js             -- HttpError + centralized error responses
  repositories/*.repository.js           -- one per domain, every function takes tenantId first
  routes/*.routes.js + routes/index.js   -- one per domain, mounted under /api
  utils/tokens.js                        -- JWT signing, opaque refresh-token generation/hashing
  index.js                               -- ~45 lines: app wiring only
  migrations/mssql/003_auth.sql          -- refresh_tokens
  migrations/mssql/004_rbac.sql          -- permissions, roles, role_permissions, user_roles + seed catalogue
  migrations/mssql/005_seed_rbac_assignments.js -- idempotent role/grant/assignment seeding

client/src/
  auth/AuthContext.jsx                   -- login/logout/session state, no localStorage
  auth/ProtectedRoute.jsx                -- permission-gated route wrapper
  config/menuConfig.js                   -- declarative sidebar entries + requiredPermission
  api/index.js                           -- axios interceptors (attach token, silent-refresh-on-401)
```

## Verified

- Login → real user, no password hash in response.
- Spoofed `requesterRole=super_admin` in a request body is ignored server-side; caller still gets 403 (core vulnerability closed).
- 401 with no token, 401 with tampered token, 403 with valid token but missing permission.
- Refresh rotates the cookie; reusing a revoked refresh token revokes the whole session chain.
- `users.password.reset` is independent of `users.view.*`/`users.manage` — verified an employee gets 403 on the reset-password endpoint even though they can read the directory.
- Password hash does not appear in `GET /api/users` or `GET /api/users/:id` responses.
- All 6 real migrated users still map to the correct role and permission count (21/15/6/6/6/6) after every seed re-run.
- `npm run build` succeeds in both `server/` (boots cleanly) and `client/` (Vite build, no errors).
- All testing used a temporary throwaway user, created and deleted via script — no real user's password was touched, and the 6 real users are confirmed unchanged in the database.

## Known follow-ups (explicitly out of scope for this milestone)

- **Cosmetic `user.role` checks remain** in ~9 page components (default form values, hiding super_admin from dropdowns, dashboard welcome text, which settings tab opens by default). These are UI convenience, not access control — every actual mutation is enforced server-side by the new permission middleware regardless of what the UI shows. Left as-is rather than rewriting business logic outside this milestone's stated scope.
- **`EmployeeDashboard`'s "team leaves this week" widget** now shows nothing for employees. It previously worked by spoofing `role=hr` in a request to see department-mates' leaves — exactly the client-trust bypass this milestone closes. No employee-appropriate permission exists yet for "see when teammates are out"; left as a disclosed gap rather than inventing a new permission mid-milestone.
- **super_admin's sidebar** now shows two extra items (Daily Check-In, Leave Cancellation) it didn't show before — a minor menu-config simplification (single permission-filtered list instead of 4 hand-maintained per-role arrays) traded a small cosmetic difference for a much simpler, real RBAC-driven menu. No new capability is granted (super_admin already had access to those routes directly).
- **Pre-existing `npm audit` findings** in both `client/` and `server/` dependency trees (vite/react-router/axios majors, tar/minimatch transitively via mssql/nodemon) predate this milestone and weren't touched — upgrading them is a separate, unrelated risk/effort tradeoff.
- **Bundle size warning** (~668 KB main JS chunk) is pre-existing, not introduced here.
- Full manual browser click-through wasn't performed (no browser-automation tool available in this session) — verification was done via direct API calls against the real server and a real (temporary, disposable) account, plus a clean production build. Recommend a manual pass through the actual UI before considering this fully signed off.

## Next milestone

Per the approved roadmap: design system + app shell (Milestone 2), before touching Leave/Attendance feature work, Payroll, or the Face Recognition PWA. Waiting for go-ahead.

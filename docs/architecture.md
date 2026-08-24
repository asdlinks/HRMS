# Architecture

## Overview

Mywe HRMS is a shared-database, shared-schema multi-tenant application. One
SQL Server database (`db_mywe_hrms`) holds every tenant's data, isolated by a
`tenant_id` column (and foreign key) on every tenant-owned table. See
[`docs/migration/phase1-database-design.md`](migration/phase1-database-design.md)
for the original multi-tenancy design rationale and
[`docs/database.md`](database.md) for the current table inventory.

```
┌─────────────────────┐        ┌──────────────────────────┐        ┌──────────────┐
│  React 19 + TS SPA   │  REST  │  Express 5 API            │  TDS   │  SQL Server  │
│  (client/, Vite)     │◄──────►│  (server/, one router per │◄──────►│  db_mywe_hrms│
│  MUI v6 design system│  JSON  │  domain under /api)        │        │  (shared,    │
└─────────────────────┘        └──────────────────────────┘        │  tenant_id)  │
                                                                      └──────────────┘
```

## Auth flow

- `POST /api/auth/login` — `{ tenantCode, email, password }` → resolves the
  tenant by `slug`, then the user by `(tenant_id, email)`. Returns
  `{ accessToken, user, permissions }` and sets an httpOnly refresh-token
  cookie scoped to `/api/auth`.
- `POST /api/auth/refresh` — reads the cookie, verifies + rotates it, issues
  a new access token. Presenting an already-rotated (revoked) token is
  treated as theft and revokes every session for that user.
- `POST /api/auth/logout` — revokes the current refresh token.
- The access token lives only in a JS variable inside `AuthContext`
  (`client/src/auth/AuthContext.tsx`) — never `localStorage`. On page load
  the app attempts a silent refresh (the cookie is sent automatically) to
  rehydrate the session.
- Every route past `/api/auth` runs through `middleware/auth.js`, which
  verifies the JWT and populates `req.auth = { userId, tenantId, permissions }`
  from the **verified token**, never from anything client-supplied.

## RBAC (roles, permissions)

- **`permissions`** — a fixed vocabulary (22 codes) of what a route can
  check: `leaves.view.own`, `users.manage`, `settings.manage`, etc. Not
  tenant-scoped — it's the taxonomy every tenant's roles are built from.
- **`roles`** — tenant-scoped, editable. Seeded with `employee`, `manager`,
  `hr`, `super_admin` (marked `is_system`, protected from deletion), but a
  System Administrator can create additional roles through
  Settings → Roles & Permissions (`client/src/pages/SettingsPage.tsx`,
  `server/routes/roles.routes.js`).
- **`role_permissions`** — the actual configurable lever: which permissions
  a role grants. Editable through the same Settings tab, or directly via
  migration for the initial seed.
- **`user_roles`** — many-to-many; the UI currently treats it as
  single-role-per-user (`PUT /api/users/:id/role` replaces, not adds), but
  the schema supports more without a migration.
- `users.role` (the pre-RBAC CHECK-constrained string) is still present as a
  historical column but **nothing reads it for authorization** — every
  permission check goes through `req.auth.permissions`, populated at login
  from `role_permissions` via `rbac.repository.js`.
- Middleware: `requirePermission(code)` / `requireAnyPermission([codes])` in
  `server/middleware/authorize.js` gate individual routes.

### Client-side permission checks

`AuthContext` exposes `hasPermission(code)` / `hasAnyPermission(codes)`,
backed by the permission list returned at login. Every page-level UI branch
(what a user can see or do) is expressed in terms of these — there are no
`user.role === '...'` string comparisons left in page components. Where the
legacy UI drew a distinction that doesn't map onto a single permission (e.g.
"super_admin only", which no one permission uniquely identifies), the
convention used throughout is a **composite check**:

```ts
// super_admin is the only seeded role holding both of these permissions —
// manager has only users.view.team, hr has only users.view.all.
const isSuperAdminLike = hasPermission('users.view.team') && hasPermission('users.view.all');
```

This keeps the UI's access model expressible entirely in terms of granted
permissions (so it stays correct if an admin edits `role_permissions`)
without inventing narrow, single-purpose permission codes for cosmetic UI
gates. One exception did get a real permission: whether a leave application
notifies a manager/admin is now `leaves.notify_on_apply`
(`server/migrations/mssql/007_leaves_notify_permission.sql`), because that
was a genuine business rule, not a UI cosmetic.

## Configuration surfaces (System Administrator, no code deploy)

| What | Where configured | Storage |
|---|---|---|
| Leave types & annual allocations | Settings → General Config | `settings` table (`leave_allocations` JSON key) |
| Locations | Settings → Locations | `locations` table |
| Holidays & flexi-holidays | Settings → Holiday Config | `holidays` / `flexi_holidays` tables |
| Attendance rules (weekly off days, off Saturdays) | Settings → Attendance Rules | `settings` table (`attendance_rules` JSON key) |
| Sidebar navigation | Settings → Menu Management | `menu_items` table |
| Roles & permission grants | Settings → Roles & Permissions | `roles` / `role_permissions` tables |
| Role assignment per employee | Settings → Roles & Permissions | `user_roles` table |

The sidebar (`client/src/components/Sidebar.tsx`) reads from
`client/src/config/menuConfig.ts` as a **seed/fallback list** — the
`menu_items` table (`GET /api/menu`) is the live source of truth once
migrated; the static file exists so the app still renders a sensible nav if
that table is ever empty for a tenant.

## TypeScript migration

The client was plain JavaScript/JSX before this phase. The migration
strategy is **incremental, convert-as-touched**: `tsconfig.json` and Vite's
built-in TS support were added, and every file created or redesigned during
this phase is `.tsx`/`.ts`. Files not touched (a small voice-command feature:
`useVoiceCommands.js`, `VoiceConfirmationModal.jsx`) remain `.jsx` —
`allowJs: true` / `checkJs: false` in `tsconfig.json` lets them coexist
without blocking the type-checked build. A full mechanical conversion of
those remaining files is a reasonable Phase 3 task; it wasn't done here
because they weren't otherwise being changed and converting working code
with no other motivation adds risk without value.

## Future modules

Routes and navigation entries exist (behind a `ComingSoonPage` placeholder)
for **Payroll**, **Recruitment**, **Performance**, and **Asset Management** —
see `client/src/App.tsx` and the `menu_items` seed in
`server/migrations/mssql/006_menu_items.sql`. No backend logic exists for
them yet, per the explicit instruction not to implement future modules this
phase.

**Face Recognition Attendance** is planned as a **separate PWA** (not part of
this SPA) that shares this app's database, auth, and employee records — see
[`face-attendance/README.md`](../face-attendance/README.md) for the
architecture note.

## Logging & validation

- **Structured logging**: `pino` (+ `pino-http` for request logs), replacing
  the previous `console.error`-only error handling. Configured in
  `server/utils/logger.js`, pretty-printed in development via `pino-pretty`,
  JSON in production. Request logging skips non-`/api` paths (static asset
  serving) to keep signal high.
- **Request validation**: `zod` schemas in `server/schemas/index.js`, applied
  via `middleware/validate.js` on every mutating route (leave apply/approve,
  user create/update, holiday/location/department create, settings bulk
  update, attendance check-in, role/menu admin endpoints). Malformed request
  bodies are rejected with a `400` before reaching a repository.

# API Reference

All routes are mounted under `/api`. Everything except `/api/auth/*` requires
a valid `Authorization: Bearer <accessToken>` header (`middleware/auth.js`);
routes additionally marked with a permission require that code in the
caller's token (`middleware/authorize.js`). Mutating routes marked ✓validated
run their body through a `zod` schema (`server/schemas/index.js`) before
reaching a repository.

## Auth (`/api/auth`) — unauthenticated by definition

| Method | Path | Notes |
|---|---|---|
| POST | `/login` | `{ tenantCode, email, password }` → `{ accessToken, user, permissions }` + refresh cookie |
| POST | `/refresh` | Reads refresh cookie, rotates it, returns new access token |
| POST | `/logout` | Revokes current refresh token |
| POST | `/change-password` | ✓validated — requires auth; identity from token, not body |

## Users (`/api/users`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | `users.view.all` \| `users.view.team` \| `users.view.directory` | Scope narrows by highest permission held |
| GET | `/:id` | self, or `users.view.all`/`users.view.team` | |
| POST | `/` | `users.manage` | ✓validated |
| PATCH | `/:id` | `users.manage` | |
| DELETE | `/:id` | `users.manage` | Cascades: notifications, attendance, leaves, refresh tokens, user_roles |
| PATCH | `/:id/reset-password` | `users.password.reset` | ✓validated — independent of `users.manage` |
| PUT | `/:id/role` | `settings.manage` | ✓validated — assigns a configurable role, tenant-checked on both role and target user |

## Leaves (`/api/leaves`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | `leaves.view.own` \| `.view.team` \| `.view.all` | |
| POST | `/` | `leaves.apply.own` \| `leaves.apply.any` | ✓validated — flexi-holiday auto-approve, probation rule, `leaves.notify_on_apply` gates the manager/admin notification |
| PATCH | `/:id` | owner (cancel) or `leaves.approve` | ✓validated |

## Departments, Locations, Holidays (`/api/departments`, `/api/locations`, `/api/holidays`, `/api/flexi-holidays`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | — (auth only) | |
| POST | `/` | `departments.manage` / `locations.manage` / `holidays.manage` | ✓validated |
| DELETE | `/:id` | same | Departments/locations block delete if employees are assigned |

## Attendance (`/api/attendance`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/monthly` | self, or `attendance.view.team` | `?userId&month&year` |
| GET | `/today` | — | Whole-tenant "who's checked in today" |
| POST | `/check-in` | `attendance.checkin` | ✓validated — enforces tracking-start-date rules |

## Settings (`/api/settings`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | — | Flat key→JSON-parsed-value map (`leave_allocations`, `attendance_link`, `attendance_rules`, ...) |
| POST | `/bulk` | `settings.manage` | ✓validated — upserts any number of keys in one transaction |

## Menu (`/api/menu`) — new in Phase 2

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | — | Tenant's nav entries, ordered by `sort_order` |
| PUT | `/` | `settings.manage` | ✓validated — replaces the full nav set in one transaction |

## Roles & Permissions (`/api/roles`) — new in Phase 2

All routes gated by `settings.manage`.

| Method | Path | Notes |
|---|---|---|
| GET | `/permissions` | Full permission catalogue |
| GET | `/` | Tenant's roles, each with its granted permission codes and user count |
| POST | `/` | ✓validated — create a role |
| PUT | `/:id/permissions` | ✓validated — replace a role's full permission set |
| DELETE | `/:id` | System roles (`is_system`) cannot be deleted |

## Reports (`/api/reports`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/monthly` | `reports.view` | `?month&year&departmentId` — aggregated check-ins/leaves/holidays per employee |

## Notifications (`/api/notifications`)

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Caller's own unread notifications only (no `:userId` param — ownership implicit from token) |
| POST | `/read` | Marks caller's own notifications read |

## Voice (`/api/voice`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/intent` | `voice.use` | Parses a transcript into a structured intent |
| POST | `/execute` | `voice.use` | Executes a confirmed voice-driven action |

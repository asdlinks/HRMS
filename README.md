# Mywe HRMS

A commercial, multi-tenant Human Resource Management System — employee
directory, attendance, leave management, holiday calendars, reporting, and
system administration (configurable roles, permissions, navigation and
attendance rules).

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Material UI v6, Vite |
| Backend | Node.js, Express 5 |
| Database | SQL Server (multi-tenant, shared schema) |
| Auth | JWT access tokens + httpOnly rotating refresh cookie, DB-driven RBAC |

See [`docs/architecture.md`](docs/architecture.md) for how these fit together,
[`docs/folder-structure.md`](docs/folder-structure.md) for where things live,
[`docs/api.md`](docs/api.md) for the route inventory, and
[`docs/database.md`](docs/database.md) for the schema.

## Getting started

Prerequisites: Node.js 18+, access to a SQL Server instance.

```bash
npm run install-all      # installs root, client, and server dependencies
```

Create `server/.env` (see `server/config/env.js` for the full list) with at
least:

```
MSSQL_CONNECTION_STRING="Server=host,1433;Database=db_mywe_hrms;User Id=...;Password=...;"
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
COOKIE_SECRET=...
CORS_ORIGIN=http://localhost:5173
PORT=5001
```

Apply database migrations (idempotent — safe to re-run):

```bash
node server/migrations/mssql/run-migrations.js
```

Run both apps in dev mode:

```bash
npm run dev               # client on :5173, server on :5001
```

## Project scripts

| Location | Script | Purpose |
|---|---|---|
| root | `npm run install-all` | Install root + client + server dependencies |
| root | `npm run dev` | Run client and server together (via `concurrently`) |
| `client/` | `npm run dev` | Vite dev server |
| `client/` | `npm run build` | Production build (`vite build`) |
| `client/` | `npm run typecheck` | `tsc --noEmit` — TypeScript type checking |
| `client/` | `npm run lint` | ESLint |
| `server/` | `npm run dev` | `nodemon index.js` |
| — | `node server/migrations/mssql/run-migrations.js` | Apply pending SQL migrations |

## Modules

**Live:** Employee Directory, Departments, Attendance (daily check-in +
calendar), Leave Management (apply/approve/cancel, flexi holidays), Holiday
Calendar, Reports (monthly CSV export), Settings (leave policy, locations,
holidays, attendance rules, menu management, roles & permissions, account
security), an AI voice assistant, and a notification center.

**Scaffolded, not yet built** (routing/navigation exist behind a
"Coming soon" screen; see [`docs/architecture.md`](docs/architecture.md#future-modules)):
Payroll, Recruitment, Performance, Asset Management.

**Planned as a separate app:** Face Recognition Attendance — see
[`face-attendance/README.md`](face-attendance/README.md) for the architecture
note (shared database, shared auth, no code yet).

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — system overview, auth/RBAC flow, multi-tenancy
- [`docs/folder-structure.md`](docs/folder-structure.md) — where things live and why
- [`docs/api.md`](docs/api.md) — route inventory by domain
- [`docs/database.md`](docs/database.md) — table inventory
- [`docs/milestones/`](docs/milestones/) — dated records of each delivered phase

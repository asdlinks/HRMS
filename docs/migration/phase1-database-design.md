# Phase 1 — Database Analysis & Design

Source: `server/leave_management.db` (schema defined in `server/db.js`)
Target: SQL Server database `db_mywe_hrms`
Migrations: `server/migrations/mssql/` (`001_initial_schema.sql`, `002_multitenancy.sql`)
Runner: `server/migrations/mssql/run-migrations.js`

Scope of this phase is schema only — no rows were copied from SQLite. The
running app (Express API + SQLite driver) is untouched; it still reads and
writes `leave_management.db`. A tenant-aware backend and cutting the app
over to SQL Server are later-phase work.

## Multi-tenancy model

Chosen: **shared database, shared schema, `tenant_id` column** on every
tenant-owned table (not schema-per-tenant or database-per-tenant) — cheapest
to run and operate, easiest to extend, standard for early-stage SaaS.
Isolation is enforced by scoping every application query with
`WHERE tenant_id = @tenant_id`, not by the database engine (see the RLS note
below for a stronger option once the backend is tenant-aware).

Two new tables carry the tenant model:

- **`tenants`** — one row per customer organization. `slug` is the
  subdomain/tenant key used to resolve which tenant a request belongs to
  before any other query runs (e.g. `acme` → `acme.mywehr.app`). Carries
  `status`, `plan`, `seat_limit`, `billing_email`, `timezone`,
  `trial_ends_at` — the fields a provisioning/billing flow needs.
- **`platform_admins`** — Mywe's own ops staff who manage tenants and
  plans. Deliberately outside the tenant model: no `tenant_id`, invisible
  to any customer's own users.

Every one of the original 9 tables gained a `tenant_id INT NOT NULL`
column with a FK to `tenants(id)`, denormalized directly onto each table
(not just `users`) rather than inferred through joins — this keeps every
query filterable by tenant without a join, and is the prerequisite if
row-level security is added later.

## Tables (12) and relationships

```
tenants ──< departments ──< users >── locations >── tenants
tenants ──< locations
tenants ──< users
                 │  ╲
                 │   ╲ (self: manager_id)
                 │
     ┌───────────┼───────────┐
     │           │           │
  leaves   notifications  attendance
  (+tenant_id everywhere)

locations ──< holidays        (+tenant_id)
locations ──< flexi_holidays  (+tenant_id)
settings   (tenant_id + key composite PK — one row per tenant per setting)

platform_admins   (standalone — no tenant_id, vendor-side only)
```

All 8 original foreign keys were preserved, plus 9 new `tenant_id` FKs (17 total):

| FK | From | To |
|---|---|---|
| FK_users_department | users.department_id | departments.id |
| FK_users_manager | users.manager_id | users.id (self) |
| FK_users_location | users.location_id | locations.id |
| FK_leaves_user | leaves.user_id | users.id |
| FK_holidays_location | holidays.location_id | locations.id |
| FK_flexi_holidays_location | flexi_holidays.location_id | locations.id |
| FK_notifications_user | notifications.user_id | users.id |
| FK_attendance_user | attendance.user_id | users.id |
| FK_departments_tenant | departments.tenant_id | tenants.id |
| FK_locations_tenant | locations.tenant_id | tenants.id |
| FK_users_tenant | users.tenant_id | tenants.id |
| FK_leaves_tenant | leaves.tenant_id | tenants.id |
| FK_settings_tenant | settings.tenant_id | tenants.id |
| FK_holidays_tenant | holidays.tenant_id | tenants.id |
| FK_flexi_holidays_tenant | flexi_holidays.tenant_id | tenants.id |
| FK_notifications_tenant | notifications.tenant_id | tenants.id |
| FK_attendance_tenant | attendance.tenant_id | tenants.id |

## Type mapping rules (SQLite → SQL Server, unchanged from the single-org design)

| SQLite | SQL Server | Why |
|---|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `INT IDENTITY(1,1)` | direct equivalent |
| `TEXT` (names, emails, free text) | `NVARCHAR(n)` / `NVARCHAR(MAX)` | sized per column; MAX for reason/message bodies |
| `TEXT` (ISO date strings) | `DATE` | joining_date, leave/holiday dates were 'YYYY-MM-DD' strings |
| `DATETIME DEFAULT CURRENT_TIMESTAMP` | `DATETIME2 DEFAULT SYSUTCDATETIME()` | higher precision, explicit UTC |
| `INTEGER` 0/1 flags | `BIT` | is_half_day, is_read, probation_message_shown |
| `TEXT CHECK(x IN (...))` | `NVARCHAR(n)` + `CHECK` | SQL Server has no native ENUM |

## Per-tenant uniqueness (new in this pass)

| Before | After | Why |
|---|---|---|
| `UNIQUE(name)` on departments/locations | `UNIQUE(tenant_id, name)` | two tenants can each name a department "Engineering" |
| `UNIQUE(email)` on users | `UNIQUE(tenant_id, email)` | login is always resolved inside a tenant first, so email only needs to be unique within it |
| filtered unique index on `employee_id` | filtered unique on `(tenant_id, employee_id)` | same "SQL Server UNIQUE only tolerates one NULL" fix as before, now scoped per tenant |
| `UNIQUE(user_id, date)` on attendance | `UNIQUE(tenant_id, user_id, date)` | leads with tenant_id, matching the denormalized pattern used everywhere else |
| `PRIMARY KEY ([key])` on settings | `PRIMARY KEY (tenant_id, [key])` | each tenant gets its own settings row instead of sharing one global store |
| `plan` column | `[plan]` | `PLAN` is a reserved T-SQL keyword (query-plan hint syntax); bracket-quoted like `settings.[key]` |

## Verification

After running `001_initial_schema.sql` (no-op, already applied) and
`002_multitenancy.sql`, confirmed via `sys.tables` / `sys.foreign_keys`:

- 12 tables (9 original + `tenants` + `platform_admins` + `__migrations`)
- 17 foreign keys, matching the design above exactly
- All 9 original tables carry a `tenant_id` column; `tenants` and
  `platform_admins` do not (by design)

## Migration workflow going forward

`server/migrations/mssql/` is a proper migration history, not a single
flat script. Each numbered `NNN_description.sql` file is applied once and
recorded in a `__migrations` tracking table:

```
MSSQL_CONNECTION_STRING="Server=host,port;Database=db;User Id=user;Password=pass;" \
  node server/migrations/mssql/run-migrations.js
```

Running it again only applies files not yet recorded — safe to re-run
after adding a new migration. Connection details are read from environment
variables only (`MSSQL_CONNECTION_STRING`, or `MSSQL_SERVER` /
`MSSQL_PORT` / `MSSQL_DATABASE` / `MSSQL_USER` / `MSSQL_PASSWORD`) — never
hardcode credentials into a migration file.

## Considered, not built

**Row-Level Security.** SQL Server can enforce tenant isolation at the
engine level with a filter predicate function + security policy on
`tenant_id`, on top of app-level `WHERE tenant_id = @tenant_id` filtering.
This is a strong defense-in-depth option now that the column exists on
every table. Deferred for this pass because it requires the application to
call `sp_set_session_context @key = 'tenant_id', @value = ...` on every
connection — enabling RLS before that exists would silently return zero
rows to every query. Worth adding once the backend is tenant-aware.

**Tenant-aware backend.** JWTs need to carry `tenant_id`, every Express
route/query needs a tenant scope, and a signup/provisioning endpoint needs
to create the `tenants` row (and seed default departments/settings) for a
new customer. Out of scope for this database-only pass.

# Database

SQL Server, shared schema, shared database (`db_mywe_hrms`) across all
tenants. Migrations live in `server/migrations/mssql/`, are numbered,
idempotent (guarded by `IF NOT EXISTS`), and tracked in a `__migrations`
table by `run-migrations.js`.

## Multi-tenancy

`tenants` is the root. Every tenant-owned table carries a `tenant_id INT NOT
NULL` foreign key to it, and uniqueness constraints that were global in the
original single-tenant schema (`users.email`, `departments.name`, ...) were
moved to be per-tenant (`UQ_users_tenant_email`, etc.) in
`002_multitenancy.sql`. `platform_admins` is the one exception — vendor-side
staff, deliberately outside the tenant model.

## Tables

| Table | Purpose | Key columns |
|---|---|---|
| `tenants` | One row per customer org | `slug` (login company code), `status`, `plan` |
| `platform_admins` | Vendor staff, not tenant-scoped | `email`, `password` |
| `departments` | | `tenant_id`, `name` |
| `locations` | | `tenant_id`, `name` |
| `users` | | `tenant_id`, `email`, `password` (bcrypt), `role` (legacy, unused for authz), `department_id`, `manager_id`, `location_id`, `probation_period`, `joining_date` |
| `leaves` | | `tenant_id`, `user_id`, `type`, `start_date`, `end_date`, `status`, `is_half_day` |
| `settings` | Tenant-scoped key/value config | PK `(tenant_id, [key])` — holds `leave_allocations`, `attendance_link`, `attendance_rules` as JSON strings |
| `holidays` / `flexi_holidays` | | `tenant_id`, `name`, `date`, `location_id` (NULL = all locations) |
| `notifications` | | `tenant_id`, `user_id`, `message`, `is_read` |
| `attendance` | | `tenant_id`, `user_id`, `date`, unique per `(tenant_id, user_id, date)` |
| `refresh_tokens` | Opaque refresh-token storage (hash only) | `user_id`, `tenant_id`, `token_hash`, `expires_at`, `revoked_at`, `replaced_by` (rotation chain) |
| `permissions` | Fixed vocabulary, **not** tenant-scoped | `code` (e.g. `leaves.approve`), `module` |
| `roles` | | `tenant_id`, `code`, `name`, `is_system` |
| `role_permissions` | The configurable RBAC lever | `(role_id, permission_id)` |
| `user_roles` | Many-to-many (UI treats as single-role) | `(user_id, role_id)` |
| `menu_items` | Admin-configurable navigation | `tenant_id`, `name`, `path`, `icon`, `permission`, `any_permission` (comma-separated), `sort_order`, `is_active`, `is_placeholder` |

## Migration history

| File | What it added |
|---|---|
| `001_initial_schema.sql` | Base single-tenant schema (departments, locations, users, leaves, settings, holidays, flexi_holidays, notifications, attendance) |
| `002_multitenancy.sql` | `tenants`, `platform_admins`, `tenant_id` on every table, per-tenant uniqueness |
| `003_auth.sql` | `refresh_tokens` |
| `004_rbac.sql` | `permissions`, `roles`, `role_permissions`, `user_roles` + 21-permission seed |
| `005_seed_rbac_assignments.js` | One-time idempotent seed: creates the 4 legacy roles per tenant, grants them permissions matching pre-RBAC behavior, assigns every existing user |
| `006_menu_items.sql` | `menu_items` table, seeded from the client's static nav list |
| `007_leaves_notify_permission.sql` | `leaves.notify_on_apply` permission, granted to `employee`/`hr` — replaces a hardcoded role check |

## Notes for future migrations

- Keep every new mutating table `tenant_id`-scoped, following `006_menu_items.sql`.
- `run-migrations.js` splits each file on standalone `GO` lines and runs each
  batch separately (matches `sqlcmd`/SSMS batch semantics) — write new
  migrations with the same `GO`-separated structure.
- All existing migrations are safe to re-run; keep new ones idempotent too
  (`IF NOT EXISTS` guards on `CREATE TABLE`/`CREATE INDEX`, `NOT EXISTS`
  subqueries before seed `INSERT`s).

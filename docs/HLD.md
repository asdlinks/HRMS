# High-Level Design (HLD) — Mywe HRMS

| | |
|---|---|
| Document type | High-Level Design (SDLC design-phase deliverable) |
| System | Mywe HRMS — multi-tenant Human Resource Management System |
| Audience | Engineering, QA, new contributors, technical stakeholders |
| Status | Living document — reflects the system as of the current dev branch |

---

## 1. Introduction

### 1.1 Purpose

This document describes the high-level architecture, module decomposition,
data design, and cross-cutting concerns of Mywe HRMS. It is the
design-phase artifact that sits between the business/requirements view
(what the product must do) and the low-level design (how each module is
implemented).

### 1.2 Scope

Mywe HRMS is a commercial, multi-tenant SaaS product covering the core
employee lifecycle: directory, attendance, leave, payroll, organization
structure, reporting, and system administration — plus a vendor-side
platform console for onboarding and operating tenants. This document
covers the product as a whole; it does not cover individual sprint-level
task breakdowns.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| Tenant | One customer organization; all its data is isolated by `tenant_id` |
| RBAC | Role-Based Access Control — permissions → roles → users |
| Platform Admin | Vendor-side staff operating the SaaS, outside the tenant model |
| HLD / LLD | High-Level / Low-Level Design |
| SaaS | Software as a Service — the application is centrally hosted and delivered over the internet rather than installed per customer |
| SPA | Single-Page Application — a web app that loads once and then updates its content dynamically, without full-page reloads |
| PWA | Progressive Web App — a web app that can be installed on a device and behave like a native app (offline support, home-screen icon) |
| REST | Representational State Transfer — an architectural style for web APIs built on standard HTTP verbs (GET, POST, PUT, DELETE) |
| JWT | JSON Web Token — a compact, signed token that proves a user's identity and claims on each request, without a server-side session lookup |
| TDS | Tabular Data Stream — the network protocol SQL Server clients use to talk to the database engine |
| ORM | Object-Relational Mapper — a library that lets code manipulate database rows as objects instead of writing raw SQL |
| CRUD | Create, Read, Update, Delete — the four basic data operations |
| PII | Personally Identifiable Information — data that can identify a specific individual (e.g. bank account, national ID) |
| CSV | Comma-Separated Values — a plain-text tabular file format |
| FK | Foreign Key — a column that references another table's primary key, enforcing a relationship between the two |
| IIS | Internet Information Services — Microsoft's web server, used to host the application on Windows |

## 2. Goals and Design Principles

- **Multi-tenant from the ground up** — one deployment, one database, many
  customer organizations, strictly isolated by `tenant_id`.
- **Configuration over code** — leave policy, holidays, attendance rules,
  navigation, roles/permissions, org structure, and payroll structures are
  all admin-editable at runtime; adding a tenant-specific rule should
  rarely require a deploy.
- **Least-privilege, permission-driven access** — no role-name string
  comparisons; every authorization decision is a permission check backed
  by a database-configurable grant.
- **Module boundaries mirror domain boundaries** — one route file + one
  repository file per business domain, so a module can be reasoned about,
  tested, and extended independently.
- **Separation of tenant product and vendor operations** — the platform
  console (subscription, provisioning, system health) is a distinct app
  surface from the tenant-facing HR product, sharing infrastructure but
  not authorization scope.

## 3. System Architecture Overview

### 3.1 Logical architecture

```
┌────────────────────────────┐        ┌────────────────────────────┐
│   Tenant SPA (client/)     │        │  Platform Console SPA       │
│   React 19 + TS + MUI v6   │        │  (client/src/platform-admin)│
│   HR product UI            │        │  Vendor operations UI       │
└──────────────┬─────────────┘        └──────────────┬──────────────┘
               │ REST / JSON (JWT bearer + refresh cookie)
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Express 5 API (server/)                       │
│  routes/*.routes.js  →  middleware (auth, authorize, validate)   │
│                      →  repositories/*.repository.js             │
│  routes/platformAdmin/*  → separate auth + authorization scope   │
└──────────────────────────────┬───────────────────────────────────┘
                                │ TDS (mssql / tedious)
                                ▼
                  ┌───────────────────────────────┐
                  │   SQL Server — db_mywe_hrms   │
                  │   Shared schema, tenant_id-   │
                  │   scoped rows per tenant table│
                  └───────────────────────────────┘
```

A third, currently code-free surface — a Face Recognition Attendance PWA
(`face-attendance/`) — is planned to share this same database, auth model,
and employee records rather than duplicate them.

### 3.2 Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19, TypeScript, Material UI v6, Vite | Two SPAs: tenant product + platform console |
| Backend | Node.js, Express 5 | One process, domain-partitioned routers under `/api` |
| Database | Microsoft SQL Server 2022 (Express Edition), database pinned at compatibility level 130 | Shared database, shared schema, tenant-isolated by FK. The *engine* is current (2022); the *database's* compatibility level is what's held back at 130 (SQL Server 2016's T-SQL surface) — see Section 8 |
| Auth | JWT access tokens (in-memory only) + `httpOnly` rotating refresh cookie | DB-driven RBAC, no client-side role strings |
| Validation | Zod schemas | Applied to every mutating route before it reaches a repository |
| Logging | Pino (+ `pino-http`) | Structured, JSON in production, pretty in dev |

### 3.3 Why This Stack (Technology Rationale)

This section explains *what each technology is*, *why that specific
version was chosen*, and *what it's used for* in this system — useful
background for anyone new to the stack.

- **React 19** — A JavaScript library for building user interfaces out of
  reusable "components" (a button, a leave-approval card, an attendance
  table). Used to build both SPAs — the tenant-facing HR product and the
  vendor-side Platform Console. A SPA updates the page in place instead of
  reloading the whole browser tab on every click, which is what makes the
  app feel fast and app-like rather than like a stack of separate web
  pages. Version 19 was chosen because there is no legacy frontend to stay
  compatible with — a new project defaults to the current major version
  rather than an older one, to get the latest performance and developer
  tooling improvements.
- **TypeScript** — JavaScript with an optional static type system layered
  on top. Plain JavaScript only reveals that the wrong shape of data was
  passed into a function when it crashes at runtime — often in
  production. TypeScript catches that mismatch while the code is still
  being written, directly in the editor. In a system with many entities
  flowing between frontend and backend (employees, roles, payroll runs,
  leave requests), that safety net meaningfully cuts down on a whole class
  of bugs. A current stable release is used for the same reason as React:
  no legacy constraint holding it back.
- **Material UI (MUI) v6** — A component library that implements Google's
  Material Design system as ready-made React components (buttons, tables,
  dialogs, date pickers, form fields). Purpose: nobody hand-builds a date
  picker from scratch. Using one library everywhere keeps the look and
  feel consistent across every module, gives accessibility (keyboard
  navigation, screen readers) for free, and lets engineers focus on HR
  business logic instead of pixel-level UI plumbing. Version 6 is the
  current major release compatible with React 19.
- **Vite** — The build tool and local development server for the
  frontend. Purpose: when a file is saved, Vite reflects the change in the
  browser almost instantly (hot module reload) instead of requiring a
  full rebuild and page refresh. It also produces the optimized, minified
  static files shipped to production.
- **Node.js** — The JavaScript runtime the backend API runs on. Purpose:
  using JavaScript/TypeScript on both frontend and backend means one
  language and one set of skills cover the whole stack — an engineer
  isn't context-switching between two ecosystems to fix one bug. Node also
  suits the kind of work this API does: many small, concurrent requests
  that mostly wait on database I/O rather than heavy CPU computation.
- **Express 5** — A minimal web framework on top of Node.js for defining
  HTTP routes and middleware. Purpose: every incoming request passes
  through a defined pipeline — authenticate (who are you?), authorize (are
  you allowed to do this?), validate (is your data well-formed?) — before
  it ever reaches business logic. Express wires that pipeline together
  per route, one router file per business domain. Version 5 is the
  current major release, chosen for the same reason as the frontend
  stack — a greenfield backend with no version constraint to work around.
- **Microsoft SQL Server** — The relational database. Purpose: HR/payroll
  data is deeply relational — an attendance record references an
  employee, who references a department and a role, who references
  permissions, and a payroll run touches all of it atomically. A
  relational database with transactions (all-or-nothing writes) is what
  prevents a partially-applied payroll run or an employee left in an
  inconsistent state if something fails halfway through. SQL Server
  specifically is what's provisioned for this project rather than an
  open-source alternative — that's the infrastructure available to run
  against. The underlying engine is a current release (2022), but the
  database itself has a compatibility-level setting pinned to an older
  value (SQL Server 2016's behavior) — see Section 8 for what that means
  in practice.
- **JWT (JSON Web Token) + rotating refresh cookie** — The authentication
  mechanism. Purpose: after login, the server hands back a signed token
  proving "this is user X, with these permissions" — the API can verify
  that token on every request without a database round-trip to check who
  is calling. The short-lived access token lives only in browser memory
  (not persistent browser storage), which limits the damage if a script
  injection ever reads page memory. The longer-lived refresh token, used
  to silently obtain a new access token, sits in an `httpOnly` cookie
  (client-side JavaScript cannot read it at all) and rotates to a new
  value on every use, so a stolen refresh token has a very short window
  to be replayed before it's invalidated.
- **Zod** — A schema validation library. Purpose: before any mutating
  request (create/update/delete) touches the database, Zod checks that
  the incoming data matches the expected shape and types — correct field
  names, correct data types, required fields present. Malformed input is
  rejected with a clear error immediately, instead of causing a confusing
  failure deeper in the system.
- **Pino** — A structured logging library. Purpose: instead of printing
  loose text to the console, Pino emits each log line as JSON. That makes
  logs machine-parseable — searchable and filterable by log-analysis
  tools — which matters once diagnosing an issue that happened in
  production rather than on a developer's own machine.

### 3.4 Deployment view

Single Node.js process serves the API; the client SPAs are built as static
assets (Vite build) and served alongside it via IIS. Database migrations
are plain, numbered, idempotent SQL/JS files applied via a custom
runner — no ORM migration framework; this keeps schema evolution
auditable and safe to re-run.

## 4. Functional / Module Design

The product is organized into cohesive, independently extensible modules.
Each module follows the same pattern end to end: a permission set → a
route file → a repository → (where applicable) admin-configurable settings
→ a client page.

### 4.1 Core Platform

- **Authentication** — tenant-scoped login (`tenantCode` + email +
  password), short-lived JWT access token, rotating refresh token in an
  `httpOnly` cookie. Refresh-token reuse is treated as theft and revokes
  all sessions for that user.
- **RBAC (roles & permissions)** — a fixed, module-specific permission
  vocabulary; tenant-scoped, editable roles; a `role_permissions` grant
  table as the single configurable lever. Client and server both authorize
  purely off granted permission codes.
- **Users / Employee Directory** — CRUD, manager hierarchy, role
  assignment, password reset, PII/banking data (added Phase 13) held to a
  stricter access permission than general profile fields.
- **Organization Structure** — Branches, Designations, Employment Types,
  Employee Categories as admin-managed lookup tables feeding the employee
  record (Phase 10B). Cost Centers were introduced and later fully removed
  (migration 041) after being judged unnecessary overhead.
- **Company Profile & Documents** — tenant-level company metadata and a
  document repository (policies, letters, etc.) with its own permission
  surface.
- **Dynamic Navigation & Settings** — sidebar and admin-settings content
  are DB-driven (`menu_items`), not hardcoded, and simplified/reorganized
  across Phase 11 to reduce redundant nav entries.

### 4.2 Attendance

- Daily check-in, monthly calendar view, admin-configurable rules (weekly
  off days, off-Saturdays), Shifts and Work Modes as first-class
  configuration (Phase 7), and Attendance Policies governing which roles
  must clock in at all (Phase 12B), enforced at three UI surfaces
  (Employee dashboard, Manager dashboard, app-shell popup).
- **Kiosk devices** — a separate device-registration surface for
  physical/shared check-in hardware.
- Designed to interoperate with the (not-yet-built) Face Recognition
  Attendance PWA via the same `attendance` table and employee identity.

### 4.3 Leave Management

- Apply / approve / cancel, half-day support, flexi-holiday auto-approval,
  probation-period rules, and a permission-gated notification to the
  approving manager/admin on apply.

### 4.4 Payroll

Fully built (superseding the earlier "Coming soon" placeholder): salary
grades, payroll structures and components, per-employee payroll
assignments, overtime, payroll runs, payslips, and CSV payroll export
reporting.

### 4.5 Reporting

A dedicated reports workspace (dashboard, analytics workspace,
saved/favorite reports, report viewer) with team-scoped visibility
enforced at the database layer via a SQL Server table-valued function
(`033_report_team_scope_function.sql`), plus monthly attendance/leave
aggregate exports.

### 4.6 Notifications

An in-app notification center — per-user, own-record-only reads, backing
the leave-apply and other cross-user alerts.

### 4.7 Voice Assistant

An AI-assisted voice command feature that parses a transcript into a
structured intent, presents it for confirmation, then executes it through
the same permission-gated route surface as manual UI actions — no
privilege bypass for voice-driven operations.

### 4.8 Platform Console (vendor-side)

A structurally separate portal (`client/src/platform-admin`,
`server/routes/platformAdmin`) for the SaaS vendor's own staff:
tenant/company provisioning, subscription plan catalogue and enforcement
(employee-limit and module gating per plan), platform dashboard, tenant
usage, and system-health monitoring. `platform_admins` is a deliberately
separate identity space from tenant users — not tenant-scoped, not part of
the tenant RBAC graph.

## 5. Data Design

### 5.1 Multi-tenancy model

Shared database, shared schema. `tenants` is the root entity; every
tenant-owned table carries a `tenant_id` foreign key, and every uniqueness
constraint that would be global in a single-tenant design (e.g. user
email) is scoped to `(tenant_id, column)` instead. `platform_admins` is
the sole exception, living outside the tenant boundary by design.

### 5.2 Key entity groups

| Group | Representative tables |
|---|---|
| Tenancy & platform | `tenants`, `platform_admins`, `subscription_plans` |
| Identity & access | `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `refresh_tokens` |
| Org structure | `departments`, `locations`, `branches`, `designations`, `employment_types`, `employee_categories` |
| Attendance | `attendance`, `shifts`, `work_modes`, attendance policy tables, `kiosk_devices` |
| Leave | `leaves`, `holidays`, `flexi_holidays` |
| Payroll | `salary_grades`, payroll structures/components, payroll assignments, payroll runs, payslips |
| Configuration | `settings` (tenant-scoped key/JSON-value store), `menu_items` |
| Collaboration | `notifications`, `company_documents`, `announcements` |

This HLD intentionally stops at the entity-group level rather than full
column-level detail.

### 5.3 Schema evolution

Forty-plus numbered, idempotent migrations (`server/migrations/mssql/`)
form the authoritative schema history, applied by a custom runner rather
than an ORM migration tool — chosen so every change is a reviewable,
re-runnable SQL/JS file rather than framework-generated diff output.

## 6. Security Design

- **Authentication**: bcrypt-hashed passwords; JWT access tokens held only
  in memory on the client (never `localStorage`); refresh tokens as
  opaque, hashed, rotating values in an `httpOnly` cookie scoped to
  `/api/auth`.
- **Authorization**: every route past `/api/auth` resolves identity from a
  verified token (`req.auth`), never from client-supplied fields;
  permission checks are middleware-enforced (`requirePermission`,
  `requireAnyPermission`), and permissions were split from coarse
  (`settings.manage`) to module-specific view/manage grants in Phase 10 to
  close over-privileged-role gaps.
- **Tenant isolation**: every repository function is `tenantId`-first and
  filters by it; cross-tenant data leakage is treated as the primary
  security invariant of the whole system.
- **Input validation**: Zod schemas front every mutating route, rejecting
  malformed payloads with 400 before they reach persistence.
- **Hardening history**: a dedicated security-hardening migration and
  verification pass (Phase 8) audited the whole system pre-commercial-
  launch and closed the highest-priority findings (tenant-status
  enforcement, permission granularity, etc.).

## 7. Non-Functional Considerations

| Concern | Approach |
|---|---|
| Observability | Structured JSON logging (Pino) in production; request logging scoped to `/api` traffic |
| Extensibility | New domains follow the established routes→repository→schema→page pattern; new tenant-owned tables follow the `menu_items` precedent (tenant FK, scoped uniqueness, `tenantId`-first repository functions) |
| Data integrity | All queries parameterized; no string-built SQL anywhere in the codebase |
| Configurability | Business rules (leave policy, attendance rules, nav, roles, org structure, payroll structures) are admin-editable without a deploy |
| Portability | Incrementally migrated JS→TypeScript on the client (convert-as-touched), so legacy and new code coexist without blocking builds |

## 8. Assumptions and Constraints

- The database **engine** is current — SQL Server 2022 (Express Edition)
  — but the **database** `db_mywe_hrms` has its `compatibility_level`
  pinned at 130 (SQL Server 2016's compat level), most likely left over
  from a migration/restore off an older instance that was never bumped
  after the engine upgrade. Compatibility level, not engine version, gates
  which T-SQL language features are available, so functions introduced
  after compat level 130 (e.g. `STRING_AGG`, added at compat level 140 /
  SQL Server 2017) are unavailable even though the underlying engine
  supports them. Code deliberately avoids that newer T-SQL surface (e.g.
  using `FOR XML PATH` string concatenation instead of `STRING_AGG`) to
  stay correct against the current setting, rather than assuming the
  compatibility level will be raised.
- Single shared database serves all tenants — horizontal scaling is
  vertical-and-connection-pool based, not per-tenant database sharding.
- The Face Recognition Attendance surface is a design placeholder only; no
  production code exists for it yet.

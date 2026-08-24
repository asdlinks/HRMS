# Folder Structure

```
Mywe_HR/
├── client/                       React 19 + TypeScript SPA (Vite)
│   ├── src/
│   │   ├── api/                  domain-split API modules + shared axios client (client.ts)
│   │   ├── auth/                 AuthContext, ProtectedRoute
│   │   ├── components/           Header, Sidebar, OrgTree, VoiceConfirmationModal
│   │   │   └── ui/                design-system primitives (PageHeader, DataTable, StatCard,
│   │   │                          ConfirmDialog, EmptyState, LoadingState, StatusBadge,
│   │   │                          ComingSoonPage) — reused across every page
│   │   ├── config/                menuConfig.ts (nav seed/fallback)
│   │   ├── hooks/                 useVoiceCommands
│   │   ├── layout/                AppShell (header+sidebar+content shell), SearchContext,
│   │   │                          dimensions
│   │   ├── pages/                 one file per route
│   │   ├── theme/                 MUI theme factory (palette.ts, index.ts), ThemeModeProvider
│   │   ├── types/                 shared TypeScript types (AuthUser, Settings, MenuItem, ...)
│   │   ├── App.tsx                route table (lazy-loaded pages)
│   │   └── main.tsx                entry point (providers: theme, snackbar, auth, search)
│   └── tsconfig.json
│
├── server/                        Node.js + Express 5 API
│   ├── config/env.js               env validation + connection-string parsing (shared)
│   ├── db/                         pool.js (mssql connection pool), sql.js (query/transaction helpers)
│   ├── middleware/                 auth.js, authorize.js, errorHandler.js, validate.js
│   ├── repositories/                one per domain — every function takes tenantId first
│   ├── routes/                      one per domain, mounted under /api by routes/index.js
│   ├── schemas/                     zod request-body schemas, one file for all mutating routes
│   ├── utils/                       tokens.js (JWT/refresh), logger.js (pino)
│   ├── migrations/mssql/            numbered, idempotent .sql files + run-migrations.js
│   ├── voice_parser.js              AI voice-assistant intent parsing (live feature)
│   └── index.js                     app wiring only
│
├── face-attendance/                 architecture placeholder for a future standalone PWA
│   └── README.md                    no code yet — see docs/architecture.md#future-modules
│
└── docs/
    ├── architecture.md
    ├── folder-structure.md          (this file)
    ├── api.md
    ├── database.md
    ├── migration/                   Phase 1 (SQLite → SQL Server) design docs
    └── milestones/                  dated record of each delivered phase
```

## Conventions

- **Server**: one `*.routes.js` + one `*.repository.js` per domain (leaves,
  users, holidays, ...). Routes handle HTTP concerns (permission checks,
  status codes, request shaping); repositories are the only code that talks
  to the database, and every query is parameterized (`db/sql.js`'s
  `bindParams`) — no string-built SQL.
- **Client**: pages own their data-fetching and business logic; shared
  presentation goes in `components/ui/`. Cross-page interaction state (the
  header search box) lives in a small context (`layout/SearchContext.tsx`)
  rather than being threaded through the router as props.
- **Multi-tenancy**: every repository function that touches tenant-owned
  data takes `tenantId` as its first argument and filters by it — this is
  the isolation boundary between tenants sharing one database. When adding a
  new admin/config table, follow the `menu_items` pattern
  (`server/migrations/mssql/006_menu_items.sql`): a `tenant_id` FK, a
  composite/tenant-scoped uniqueness constraint, and every repository query
  parameterized on it.

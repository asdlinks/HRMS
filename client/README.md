# Mywe HRMS — Client

React 19 + TypeScript + Material UI, built with Vite. See the
[repo-level README](../README.md) and [`docs/`](../docs) for the full picture
— this file covers only what's specific to running the frontend.

## Structure

```
src/
  api/          domain-split API modules (auth, users, leaves, ...) + shared axios client
  auth/         AuthContext (session state, no localStorage) + ProtectedRoute
  components/   shared components (Header, Sidebar, OrgTree, VoiceConfirmationModal)
  components/ui design-system primitives (PageHeader, DataTable, StatCard, ConfirmDialog, ...)
  config/       menuConfig.ts — seed/fallback for the DB-backed navigation menu
  hooks/        useVoiceCommands
  layout/       AppShell, SearchContext, layout dimensions
  pages/        one file per route
  theme/        MUI theme factory + light/dark ThemeModeProvider
  types/        shared TypeScript types
```

Pages and new components are TypeScript (`.tsx`); a handful of untouched
files remain `.jsx` (`OrgTree`'s voice-adjacent siblings, `useVoiceCommands.js`,
`VoiceConfirmationModal.jsx`) — see
[`docs/architecture.md`](../docs/architecture.md#typescript-migration) for the
migration strategy.

## Scripts

- `npm run dev` — Vite dev server (proxies API calls to `http://localhost:5001` in development)
- `npm run build` — production build to `dist/`
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint (flat config, separate rule sets for `.jsx` and `.tsx`)

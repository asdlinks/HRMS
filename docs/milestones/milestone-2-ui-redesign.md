# Milestone 2 — Enterprise UI Redesign, Config Platform, Backend Hardening

Status: **complete**. Plan: `C:\Users\vishnupriya\.claude\plans\sequential-spinning-parnas.md`

## What this milestone did

1. **Design system + full UI redesign.** Every page (Login, dashboards,
   Attendance, Employees, My Team, Employee Profile, Departments, Leaves,
   Leave Cancellation, Holiday Calendar, Reports, Settings) was rebuilt on
   Material UI v6 with a shared theme (light/dark, toggle in the header),
   replacing ~4,000 lines of hand-rolled `<style>` CSS-in-JS blocks. New
   reusable primitives: `PageHeader`, `DataTable` (MUI DataGrid wrapper),
   `StatCard`, `StatusBadge`, `EmptyState`, loading skeletons,
   `ConfirmDialog`, `ComingSoonPage`.
2. **TypeScript**, incrementally: `tsconfig.json` added, every file touched
   this milestone is `.tsx`/`.ts` — effectively the whole `client/src`
   surface except a small untouched voice-command feature.
3. **Client-side RBAC completed.** Milestone 1 closed the server-side gap
   and left ~30 `user.role === '...'` UI checks across 10 files as an
   explicit known follow-up. All of them are now `hasPermission`/
   `hasAnyPermission` checks. Where no single permission matched the old
   role-string exactly, a documented composite check is used (see
   `docs/architecture.md`); one case (leave-apply notifications) became a
   real new permission (`leaves.notify_on_apply`) instead, because it was a
   genuine business rule.
4. **Configuration platform**, closing the "no menus/roles/attendance-rules
   config" gap:
   - `menu_items` table + `/api/menu` — Settings → Menu Management (reorder,
     rename, show/hide nav entries).
   - Roles & Permissions admin UI — `/api/roles` — create roles, edit a
     role's permission grants, assign a role to an employee, all through
     Settings instead of only via a migration script.
   - Attendance rules (weekly off days, which Saturdays are off) moved from
     hardcoded client logic (`App.jsx`) into `settings.attendance_rules`,
     editable in Settings → Attendance Rules.
5. **Backend hardening**: `zod` request validation on every mutating route,
   `pino` structured logging (replacing `console.error`), API client split
   from one 99-line file into per-domain modules
   (`client/src/api/{auth,users,leaves,...}.ts`).
6. **Dependency/dead-code cleanup**: removed `sqlite3` and the leftover
   SQLite driver/db file, fixed two phantom client dependencies
   (`react-hot-toast`, `react-select` were imported but never installed —
   the app could not have built in this state) by using already-installed
   libraries (`notistack`, MUI `Autocomplete`) instead of adding new ones.
7. **Performance**: route-level code splitting (`React.lazy`), manual vendor
   chunking (MUI/DataGrid/recharts split from the app bundle) — initial JS
   payload dropped from a single ~1.24 MB bundle to a ~137 KB gzipped
   initial chunk plus on-demand page chunks (2–22 KB each).
8. **Future-module scaffolding**: routes + nav entries (permission-gated,
   rendering a shared `ComingSoonPage`) for Payroll, Recruitment,
   Performance, Asset Management. `/face-attendance/README.md` records the
   architecture for a future standalone PWA sharing this app's database,
   auth, and employee records — no code.
9. **Security fix found during this milestone**: `setUserRole` (the new
   role-assignment repository function) verified the target *role* belonged
   to the caller's tenant but not the target *user* — a caller with
   `settings.manage` could have assigned a role to a `userId` from a
   different tenant. Fixed before merge; verified via a live round-trip test
   against the real database.

## Verified

- `client`: `npm run typecheck` (0 errors), `npm run lint` (0 errors/warnings),
  `npm run build` succeeds (chunked output, see performance note above).
- `server`: boots cleanly against the real SQL Server database; all new/
  changed migrations (`006_menu_items.sql`, `007_leaves_notify_permission.sql`)
  applied successfully via `run-migrations.js`.
- Live smoke test against the running server: login returns the expected
  21-permission token for `super_admin`; `GET /api/menu`, `GET /api/roles`,
  `GET /api/roles/permissions` return real tenant data; a malformed
  `POST /api/leaves` body is rejected with `400` by the new zod validation;
  a full menu replace round-trips correctly through `PUT /api/menu`.
- `leaves.notify_on_apply` confirmed granted to `employee`/`hr` (not
  `manager`/`super_admin`) after the migration ran, matching the pre-existing
  behavior it replaced.

## Known follow-ups (explicitly out of scope for this milestone)

- **Dashboard layout is not admin-configurable.** Genuinely large scope
  (widget system, per-role layouts); flagged in the original plan as a
  Phase 3 item, not attempted here.
- **Remaining `.jsx` files**: `useVoiceCommands.js`, `VoiceConfirmationModal.jsx`,
  and the voice feature's server counterpart (`voice_parser.js`) were left
  untouched — they're a working, self-contained feature this milestone
  didn't otherwise need to change, and converting working code with no other
  motivation adds risk without value. A full mechanical TS conversion is a
  reasonable, low-risk Phase 3 task.
- **`voice.routes.js`, `notifications.routes.js`** were not audited for
  validation coverage in this pass — only routes explicitly listed as
  mutating in the original plan got `zod` schemas. Worth a follow-up sweep.
- **Payroll and Face Recognition Attendance** remain unbuilt by design —
  routing/nav placeholders only, per the explicit instruction not to
  implement future modules this phase.
- **`npm audit` findings** (client: 15, server: 5, mostly transitive/dev
  dependencies) predate and were not addressed in this milestone —
  upgrading majors is a separate risk/effort tradeoff.
- Manual click-through in an actual browser was not performed in this
  session (no browser-automation tool available); verification was build +
  typecheck + lint + live API smoke testing against the real server/database.
  Recommend a manual UI pass, especially for the redesigned Leaves drawer,
  Employees org-tree modals, and the new Settings admin tabs, before
  considering this fully signed off.

## Next milestone

Recommended Phase 3 candidates, roughly in priority order: manual browser
QA pass; dashboard configurability; complete the remaining `.jsx`→`.tsx`
conversion; Payroll module build-out; Face Recognition Attendance PWA
build-out; address `npm audit` findings.

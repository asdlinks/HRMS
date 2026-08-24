# HLD - Module Design & Functionality (Mywe HRMS)

| | |
|---|---|
| Document type | High-Level Design - module reference (SDLC design-phase deliverable) |
| Scope | Design and functionality of each product module, at a high level only |

---

## 1. Core Platform

### 1.1 Authentication
- **Purpose**: Secure, tenant-scoped sign-in.
- **Functionality**: Login with `tenantCode + email + password`; session refresh; logout revokes session.
- **Design**: Short-lived JWT access token (client memory only) + rotating httpOnly refresh cookie; refresh-token reuse is treated as theft and revokes all sessions for that user.

### 1.2 RBAC - Roles & Permissions
- **Purpose**: Control who can see/do what, per tenant.
- **Functionality**: Admin defines roles, assigns a fixed set of module-specific permissions (view/manage) to each role, assigns roles to users.
- **Design**: `role_permissions` grant table is the single configurable lever; no hardcoded role-name checks anywhere in client or server - every authorization decision reads a permission code.

### 1.3 Users / Employee Directory
- **Purpose**: Single source of truth for employee records.
- **Functionality**: Create/edit/deactivate employees, manager hierarchy, role assignment, password reset, PII & banking details.
- **Design**: PII/banking fields sit behind a stricter permission than general profile fields.

### 1.4 Organization Structure
- **Purpose**: Model how the tenant's organization is structured.
- **Functionality**: Manage Departments, Locations, Branches, Designations, Employment Types, Employee Categories - all feed dropdowns on the employee record.
- **Design**: Admin-managed lookup tables, editable without a deploy.

### 1.5 Company Profile & Documents
- **Purpose**: Tenant-level company info and shared document repository.
- **Functionality**: Edit company profile/settings; upload, categorize, and share company documents (policies, letters).
- **Design**: Own permission surface, separate from employee-level document access.

### 1.6 Dynamic Navigation & Settings
- **Purpose**: Let the sidebar and admin settings reflect what a tenant/role actually has access to.
- **Functionality**: Menu items and settings sections render from configuration, not hardcoded routes.
- **Design**: DB-driven `menu_items`; keeps nav in sync with permissions automatically.

### 1.7 Announcements
- **Purpose**: Broadcast tenant-wide or team-wide messages.
- **Functionality**: Admin/manager creates announcements; employees see them on their dashboard.

---

## 2. Attendance

- **Purpose**: Track employee presence and working patterns.
- **Functionality**:
  - Daily check-in/check-out, monthly attendance calendar.
  - Shifts and Work Modes as configurable entities (assign employees to a shift/work mode).
  - Attendance Policies define which roles must clock in at all.
  - Holiday calendar feeds attendance/leave calculations.
  - Kiosk Devices - registration of shared/physical check-in hardware for non-personal-device check-ins.
- **Design**: Policy enforcement surfaces at three points (Employee dashboard, Manager dashboard, app-shell popup) so a policy change is visible everywhere at once. Built to interoperate with a future Face Recognition Attendance app via the same attendance table and employee identity.

---

## 3. Leave Management

- **Purpose**: Manage employee leave end to end.
- **Functionality**: Apply, approve/reject, cancel; half-day leave; flexi-holiday auto-approval; probation-period leave rules; notifies the approving manager/admin on apply.
- **Design**: Leave policy (types, quotas, probation rules) is admin-configurable, not code-level.

---

## 4. Payroll

- **Purpose**: Run payroll end to end for a tenant.
- **Functionality**:
  - **Salary Grades** - pay bands used across the org.
  - **Payroll Structures & Components** - define what makes up a payslip (earnings, deductions).
  - **Payroll Assignments** - attach a structure/grade to each employee.
  - **Overtime** - capture and cost overtime hours.
  - **Payroll Runs** - execute a payroll cycle, view run detail/status.
  - **Payslips** - per-employee payslip view.
  - **Reports & Export** - payroll dashboard, CSV export for finance/accounting.
- **Design**: Each sub-area (structures, assignments, runs) is a distinct module internally but presented as one connected workflow: Structure → Assignment → Run → Payslip.

---

## 5. Reporting

- **Purpose**: Give admins/managers visibility into HR data without ad-hoc queries.
- **Functionality**: Reports dashboard, analytics workspace, saved/favorite reports, report viewer, monthly attendance/leave aggregate exports.
- **Design**: Report visibility is team-scoped - a manager only ever sees data for their own reporting line, enforced at the database layer, not just hidden in the UI.

---

## 6. Notifications

- **Purpose**: Keep users informed of events relevant to them.
- **Functionality**: In-app notification center; per-user, own-record-only; powers leave-apply alerts and other cross-user events.

---

## 7. Voice Assistant

- **Purpose**: Let users perform actions via natural-language voice commands.
- **Functionality**: Speak a command → transcript parsed into a structured intent → user confirms → action executes.
- **Design**: Executes through the same permission-gated routes as manual UI actions - voice is a new input method, not a new privilege path.

---

## 8. Platform Console (Vendor-side)

- **Purpose**: Let the SaaS vendor operate the product across all tenants - this is not part of the tenant-facing HR product.
- **Functionality**: Tenant/company provisioning, subscription plan catalogue (employee-limit and module gating per plan), platform dashboard, tenant usage, system-health monitoring.
- **Design**: Separate identity space (`platform_admins`) and separate app surface from tenant users/roles - vendor staff are never part of any tenant's RBAC graph.

---

## 9. Module Interaction (at a glance)

```
Employee Directory ──feeds──▶ Org Structure, Payroll Assignments,
                               Attendance, Leave, RBAC (role assignment)

Attendance + Leave ──feeds──▶ Reporting, Payroll (attendance-linked pay)

Payroll Structures ──feeds──▶ Payroll Assignments ──feeds──▶ Payroll Runs ──▶ Payslips

RBAC (permissions) ──gates──▶ every module's UI and API access

Platform Console ──provisions & gates (plan limits)──▶ everything above, per tenant
```

---

## 10. Traceability

Module-level detail (API routes, screens, sub-features) beyond this summary
lives alongside the per-module page/route source under
`client/src/pages/` and `server/routes/`.

# Module 2 — Identity & Access

Status: implemented (local adapter) · Schema: `iam` · Depends on: Module 1 (Platform Setup)

Neon Auth owns credentials and sessions. This module answers two questions only: who this login is in the school, and what they may do.

## Entities

| Table | Purpose |
|---|---|
| `iam.app_user` | School identity linked to `neon_auth.user` (uuid) and `core.person` |
| `iam.role` | Named role (`super_admin` is system-seeded) |
| `iam.permission` | `(module, resource, action)` triple |
| `iam.role_permission` | Grants a permission to a role; optional JSON row-scope `condition` |
| `iam.user_role` | Assignment, campus-scoped (`campus_id` NULL = all campuses), dated |
| `iam.user_device` | Push tokens per platform |

A person may have more than one login profile (`UNIQUE (person_id, profile_type_id)`): staff, student, parent.

## Lookups

| Type | Codes |
|---|---|
| `profile_type` | staff, student, parent |
| `user_status` | pending, active, suspended, disabled (final) |
| `permission_action` | view, create, update, delete, approve, export, print |
| `device_platform` | android, ios, web |
| `record_status` | active, inactive, archived (roles) |

## Auth contract

1. Browser authenticates with Neon Auth and receives a short-lived JWT.
2. Data API / Functions read `auth.uid()` and resolve `iam.app_user` via `auth_user_id`.
3. Server functions run `SET LOCAL app.user_id = '<app_user.id>'` so audit and RLS see the actor.
4. RLS uses `iam.current_user_id()` and `iam.has_permission(module, resource, action, campus_id)`.
5. Never ship a database connection string to the browser. Never migrate password hashes from legacy.

## Permission model

- Resource names are stable codes (`user`, `role`, `permission`, `user_role`, `user_device`).
- Super Admin bypasses the matrix (`iam.role.code = 'super_admin'`).
- `user_role.campus_id` scopes the grant. A NULL campus is global.
- `role_permission.condition` is reserved for row filters (e.g. `{"campus":"own"}`). Evaluated in server functions, not in SQL triggers.

## Screens (admin SPA)

| Route | Screen |
|---|---|
| `/login` | Email / password (Neon Auth in production; local adapter in this preview) |
| `/iam/users` | Paginated users; create staff/student/parent login |
| `/iam/users/:id` | Profile, status, campus-scoped roles, devices |
| `/iam/roles` | Roles list; system roles are not deletable |
| `/iam/roles/:id` | Permission matrix (module x resource x action) |
| `/iam/permissions` | Permission catalog |
| `/iam/devices` | Registered devices / push tokens |

## Local preview adapter

This environment has no Neon project. `server/` stands in for Neon Auth + Data API:

- SQLite file `server/data/sms.db` holds foundation + IAM tables.
- `iam_credential` (password hash) exists only in the adapter. Production uses Neon Auth; this table is not in `01_foundation_schema.sql`.
- JWT session cookie `sms_session` (httpOnly) stands in for the Neon Auth JWT.

Seed logins:

| Email | Password | Role |
|---|---|---|
| admin@school.local | Admin@123 | Super Admin |
| staff@school.local | Staff@123 | Teacher |

## Definition of done

- [x] Design note
- [x] Foundation tables (`iam.*`) in `schema/01_foundation_schema.sql`
- [x] RLS helpers and policies in `schema/02_iam_rls.sql`
- [x] Admin UI for users, roles, matrix, devices
- [x] SQL / API checks per role
- [ ] `neon-js` types (when Neon branch exists)
- [ ] Legacy mapping (users re-invited; hashes not migrated)

# Foundation (modules 1–3)

Entities, lookups and statuses match `packages/db/migrations/001_foundation.sql`.

## Runtime

Admin CRUD uses Neon Data API (`@neondatabase/neon-js`) with JWT from Neon Auth. RLS (`iam.has_permission`) enforces access. Configure `VITE_NEON_DATABASE_URL` (see `apps/admin/.env.example`). Apply `001`–`004`.

Public views in `004_data_api.sql` expose entity keys (`campus`, `lookup_type`, …) so the client can `.from('campus')`.

## Screens

- Lookup manager — all enum / status sets
- CRUD engine screens for campus, session, wing, class, subject, house, department, designation, geography, person, roles, users, permissions, settings, rules, workflows, custom fields, templates
- Permission matrix
- Rule simulator (json-logic subset over `late_count` / `absent_days`)

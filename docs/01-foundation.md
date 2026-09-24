# Foundation (modules 1–3)

Entities, lookups and statuses match `packages/db/migrations/001_foundation.sql`.

## Runtime in this environment

Neon is not provisioned in the preview workspace. The admin app talks to a local Express API (`apps/api`) that implements the foundation tables in JSON with the same seed as the SQL file. Swap the API for Neon Data API + RLS when the project is attached.

## Screens

- Lookup manager — all enum / status sets
- CRUD engine screens for campus, session, wing, class, subject, house, department, designation, geography, person, roles, users, settings, rules, workflows, custom fields, templates
- Permission matrix
- Rule simulator (json-logic subset over `late_count` / `absent_days`)

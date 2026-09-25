# @sms/api — not the CRUD path

This Express JSON store was a preview stand-in. **Simple CRUD goes through Neon Data API + RLS** from `apps/admin`. Do not proxy `/api` here.

Enrolment, bootstrap, and session identity are Postgres RPCs (`enrol_application`, `bootstrap_staff`, `me`) in `packages/db/migrations/004_data_api.sql`.

Keep this package only as a local seed/reference. Do not start it from `start.sh`.

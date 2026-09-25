# Phase 2 — Calendar, students, admission, front office

SQL: `packages/db/migrations/002_student_admission_calendar_front.sql`
RLS: `packages/db/migrations/003_rls.sql`
Data API: `packages/db/migrations/004_data_api.sql`

## Status sets

All statuses are lookups (`application_status`, `student_status`, `enrollment_status`, `enquiry_status`, `complaint_status`, `pass_status`, `exit_status`, `form_sale_status`). No free-text status columns.

## Enrolment conversion

RPC `enrol_application` (Data API: `client.rpc('enrol_application', { p_application_id, p_class_section_id, p_house_id, p_roll_no, p_admitted_on })`)

- Requires application status in submitted / under_review / test_scheduled / offered / accepted
- Creates `student.student` with `core.next_code('student')` (`STD-#####`)
- Copies `application_guardian` → `guardian_link`
- Inserts current-session `enrollment`
- Sets application to `enrolled` and form sale to `used`

UI: Tools → Enrol from application.

## RLS

`iam.current_user_id()` reads `app.user_id`, `auth.user_id()`, or JWT `sub`.
`iam.has_permission(resource, action)` is used by generated policies on every business table. Lookups stay readable to any authenticated app user.

First Neon Auth login with an empty `iam.app_user` table becomes Super Admin via `bootstrap_staff`.

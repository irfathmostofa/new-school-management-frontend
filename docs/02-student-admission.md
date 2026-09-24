# Phase 2 — Calendar, students, admission, front office

SQL: `packages/db/migrations/002_student_admission_calendar_front.sql`
RLS: `packages/db/migrations/003_rls.sql`

## Status sets

All statuses are lookups (`application_status`, `student_status`, `enrollment_status`, `enquiry_status`, `complaint_status`, `pass_status`, `exit_status`, `form_sale_status`). No free-text status columns.

## Enrolment conversion

`POST /api/applications/:id/enrol` `{ class_section_id, house_id?, roll_no?, admitted_on? }`

- Requires application status in submitted / under_review / test_scheduled / offered / accepted
- Creates `student.student` with `core.next_code('student')` (API: `STD-#####`)
- Copies `application_guardian` → `guardian_link`
- Inserts current-session `enrollment`
- Sets application to `enrolled` and form sale to `used`

UI: Tools → Enrol from application.

## RLS

`iam.current_user_id()` reads `app.user_id` or the Neon Auth JWT `sub`.
`iam.has_permission(resource, action)` is used by generated policies on every business table. Lookups stay readable to any authenticated app user.

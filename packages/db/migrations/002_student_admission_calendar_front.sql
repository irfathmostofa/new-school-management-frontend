-- =====================================================================
-- SMS  |  Phase 2 schema  v0.1
-- Modules: 4 Front Office | 5 Admission | 6 Student | 8 Academic Calendar
-- Depends on: 001_foundation.sql
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS student;
CREATE SCHEMA IF NOT EXISTS admission;
CREATE SCHEMA IF NOT EXISTS front;
CREATE SCHEMA IF NOT EXISTS cal;

-- ---------------------------------------------------------------------
-- Lookups for phase 2
-- ---------------------------------------------------------------------
INSERT INTO core.lookup_type (code, name, is_status, is_system) VALUES
  ('student_status','Student status',true,true),
  ('enrollment_status','Enrollment status',true,true),
  ('incident_category','Incident category',false,true),
  ('incident_severity','Incident severity',false,true),
  ('exit_type','Student exit type',false,true),
  ('exit_status','Exit / TC status',true,true),
  ('application_status','Admission application status',true,true),
  ('form_sale_status','Admission form sale status',true,true),
  ('enquiry_status','Enquiry status',true,true),
  ('enquiry_source','Enquiry source',false,true),
  ('visitor_purpose','Visitor purpose',false,true),
  ('call_direction','Call direction',false,true),
  ('postal_direction','Postal direction',false,true),
  ('complaint_status','Complaint status',true,true),
  ('complaint_source','Complaint source',false,true),
  ('pass_type','Gate / temporary pass type',false,true),
  ('pass_status','Pass status',true,true),
  ('holiday_type','Holiday type',false,true),
  ('event_audience','Event audience',false,true),
  ('notice_audience','Notice audience',false,true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO core.lookup_value (lookup_type_id, code, label, sort_order, is_final, is_system)
SELECT t.id, v.code, v.label, v.ord, v.is_final, true
FROM (VALUES
  ('student_status','active','Active',1,false),
  ('student_status','inactive','Inactive',2,false),
  ('student_status','alumni','Alumni',3,true),
  ('student_status','transferred','Transferred',4,true),
  ('student_status','withdrawn','Withdrawn',5,true),
  ('enrollment_status','enrolled','Enrolled',1,false),
  ('enrollment_status','promoted','Promoted',2,true),
  ('enrollment_status','repeated','Repeated',3,false),
  ('enrollment_status','transferred','Transferred',4,true),
  ('enrollment_status','withdrawn','Withdrawn',5,true),
  ('incident_category','discipline','Discipline',1,false),
  ('incident_category','academic','Academic',2,false),
  ('incident_category','health','Health',3,false),
  ('incident_category','other','Other',9,false),
  ('incident_severity','low','Low',1,false),
  ('incident_severity','medium','Medium',2,false),
  ('incident_severity','high','High',3,false),
  ('exit_type','tc','Transfer certificate',1,false),
  ('exit_type','transfer','Internal transfer',2,false),
  ('exit_type','withdrawal','Withdrawal',3,false),
  ('exit_status','draft','Draft',1,false),
  ('exit_status','pending','Pending approval',2,false),
  ('exit_status','issued','Issued',3,true),
  ('exit_status','cancelled','Cancelled',4,true),
  ('application_status','draft','Draft',1,false),
  ('application_status','submitted','Submitted',2,false),
  ('application_status','under_review','Under review',3,false),
  ('application_status','test_scheduled','Test scheduled',4,false),
  ('application_status','waitlisted','Waitlisted',5,false),
  ('application_status','offered','Offer issued',6,false),
  ('application_status','accepted','Accepted',7,false),
  ('application_status','enrolled','Enrolled',8,true),
  ('application_status','rejected','Rejected',9,true),
  ('application_status','withdrawn','Withdrawn',10,true),
  ('form_sale_status','sold','Sold',1,false),
  ('form_sale_status','used','Used',2,true),
  ('form_sale_status','cancelled','Cancelled',3,true),
  ('enquiry_status','open','Open',1,false),
  ('enquiry_status','follow_up','Follow up',2,false),
  ('enquiry_status','converted','Converted to application',3,true),
  ('enquiry_status','closed','Closed',4,true),
  ('enquiry_source','walk_in','Walk-in',1,false),
  ('enquiry_source','phone','Phone',2,false),
  ('enquiry_source','web','Website',3,false),
  ('enquiry_source','referral','Referral',4,false),
  ('visitor_purpose','meeting','Meeting',1,false),
  ('visitor_purpose','admission','Admission',2,false),
  ('visitor_purpose','delivery','Delivery',3,false),
  ('visitor_purpose','other','Other',9,false),
  ('call_direction','inbound','Inbound',1,false),
  ('call_direction','outbound','Outbound',2,false),
  ('postal_direction','in','Incoming',1,false),
  ('postal_direction','out','Outgoing',2,false),
  ('complaint_status','open','Open',1,false),
  ('complaint_status','in_progress','In progress',2,false),
  ('complaint_status','resolved','Resolved',3,true),
  ('complaint_status','closed','Closed',4,true),
  ('complaint_source','parent','Parent',1,false),
  ('complaint_source','student','Student',2,false),
  ('complaint_source','staff','Staff',3,false),
  ('pass_type','gate','Gate pass',1,false),
  ('pass_type','temporary','Temporary campus pass',2,false),
  ('pass_status','active','Active',1,false),
  ('pass_status','used','Used',2,true),
  ('pass_status','expired','Expired',3,true),
  ('pass_status','cancelled','Cancelled',4,true),
  ('holiday_type','public','Public holiday',1,false),
  ('holiday_type','school','School holiday',2,false),
  ('holiday_type','exam_break','Exam break',3,false),
  ('event_audience','all','Everyone',1,false),
  ('event_audience','staff','Staff',2,false),
  ('event_audience','students','Students',3,false),
  ('event_audience','parents','Parents',4,false),
  ('notice_audience','all','Everyone',1,false),
  ('notice_audience','staff','Staff',2,false),
  ('notice_audience','students','Students',3,false),
  ('notice_audience','parents','Parents',4,false)
) AS v(type_code, code, label, ord, is_final)
JOIN core.lookup_type t ON t.code = v.type_code
WHERE NOT EXISTS (
  SELECT 1 FROM core.lookup_value lv
  WHERE lv.lookup_type_id = t.id AND lv.code = v.code
);

-- ---------------------------------------------------------------------
-- MODULE 6 — STUDENT
-- ---------------------------------------------------------------------
CREATE TABLE student.student (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  person_id       bigint NOT NULL UNIQUE REFERENCES core.person(id),
  student_code    text NOT NULL UNIQUE,
  campus_id       bigint NOT NULL REFERENCES core.campus(id),
  admitted_on     date,
  application_id  bigint,
  status_id       integer NOT NULL DEFAULT core.lv('student_status','active') REFERENCES core.lookup_value(id),
  legacy_id       bigint,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

CREATE TABLE student.guardian_link (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id           bigint NOT NULL REFERENCES student.student(id) ON DELETE CASCADE,
  person_id            bigint NOT NULL REFERENCES core.person(id),
  relationship_type_id integer NOT NULL REFERENCES core.lookup_value(id),
  is_primary           boolean NOT NULL DEFAULT false,
  is_emergency         boolean NOT NULL DEFAULT false,
  lives_with           boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id),
  UNIQUE (student_id, person_id)
);
CREATE UNIQUE INDEX guardian_link_one_primary ON student.guardian_link (student_id) WHERE is_primary;

CREATE TABLE student.health (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id      bigint NOT NULL UNIQUE REFERENCES student.student(id) ON DELETE CASCADE,
  allergies       text,
  conditions      text,
  physician_name  text,
  physician_phone text,
  notes           text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

CREATE TABLE student.previous_school (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id     bigint NOT NULL REFERENCES student.student(id) ON DELETE CASCADE,
  name           text NOT NULL,
  last_class     text,
  years_attended text,
  leaving_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

CREATE TABLE student.enrollment (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id        bigint NOT NULL REFERENCES student.student(id),
  session_id        bigint NOT NULL REFERENCES core.academic_session(id),
  class_section_id  bigint NOT NULL REFERENCES core.class_section(id),
  house_id          bigint REFERENCES core.house(id),
  roll_no           integer,
  status_id         integer NOT NULL DEFAULT core.lv('enrollment_status','enrolled') REFERENCES core.lookup_value(id),
  enrolled_on       date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id),
  UNIQUE (student_id, session_id)
);

CREATE TABLE student.club (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  status_id  integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

CREATE TABLE student.club_membership (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id    bigint NOT NULL REFERENCES student.club(id),
  student_id bigint NOT NULL REFERENCES student.student(id),
  session_id bigint NOT NULL REFERENCES core.academic_session(id),
  role       text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id),
  UNIQUE (club_id, student_id, session_id)
);

CREATE TABLE student.incident (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id  bigint NOT NULL REFERENCES student.student(id),
  occurred_on date NOT NULL DEFAULT current_date,
  category_id integer NOT NULL REFERENCES core.lookup_value(id),
  severity_id integer NOT NULL REFERENCES core.lookup_value(id),
  description text NOT NULL,
  action_taken text,
  status_id   integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

CREATE TABLE student.exit_request (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id   bigint NOT NULL REFERENCES student.student(id),
  exit_type_id integer NOT NULL REFERENCES core.lookup_value(id),
  requested_on date NOT NULL DEFAULT current_date,
  effective_on date,
  reason       text,
  tc_number    text UNIQUE,
  status_id    integer NOT NULL DEFAULT core.lv('exit_status','draft') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

-- ---------------------------------------------------------------------
-- MODULE 5 — ADMISSION
-- ---------------------------------------------------------------------
CREATE TABLE admission.form_batch (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id     bigint NOT NULL REFERENCES core.academic_session(id),
  campus_id      bigint NOT NULL REFERENCES core.campus(id),
  class_level_id bigint NOT NULL REFERENCES core.class_level(id),
  price          numeric(14,2) NOT NULL DEFAULT 0,
  sold_from      date,
  sold_to        date,
  status_id      integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

CREATE TABLE admission.form_sale (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id    bigint NOT NULL REFERENCES admission.form_batch(id),
  serial_no   text NOT NULL,
  sold_on     date NOT NULL DEFAULT current_date,
  buyer_name  text NOT NULL,
  buyer_phone text,
  amount      numeric(14,2) NOT NULL DEFAULT 0,
  status_id   integer NOT NULL DEFAULT core.lv('form_sale_status','sold') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id),
  UNIQUE (batch_id, serial_no)
);

CREATE TABLE admission.application (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  form_sale_id        bigint REFERENCES admission.form_sale(id),
  session_id          bigint NOT NULL REFERENCES core.academic_session(id),
  campus_id           bigint NOT NULL REFERENCES core.campus(id),
  class_level_id      bigint NOT NULL REFERENCES core.class_level(id),
  applicant_person_id bigint NOT NULL REFERENCES core.person(id),
  status_id           integer NOT NULL DEFAULT core.lv('application_status','draft') REFERENCES core.lookup_value(id),
  submitted_at        timestamptz,
  custom_data         jsonb NOT NULL DEFAULT '{}',
  notes               text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

ALTER TABLE student.student
  ADD CONSTRAINT student_application_fk
  FOREIGN KEY (application_id) REFERENCES admission.application(id);

CREATE TABLE admission.application_guardian (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id       bigint NOT NULL REFERENCES admission.application(id) ON DELETE CASCADE,
  person_id            bigint NOT NULL REFERENCES core.person(id),
  relationship_type_id integer NOT NULL REFERENCES core.lookup_value(id),
  UNIQUE (application_id, person_id)
);

CREATE TABLE admission.test (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id     bigint NOT NULL REFERENCES core.academic_session(id),
  class_level_id bigint NOT NULL REFERENCES core.class_level(id),
  name           text NOT NULL,
  held_on        date,
  venue          text,
  status_id      integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

CREATE TABLE admission.test_score (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id bigint NOT NULL REFERENCES admission.application(id) ON DELETE CASCADE,
  test_id        bigint NOT NULL REFERENCES admission.test(id),
  marks          numeric(6,2),
  remarks        text,
  UNIQUE (application_id, test_id)
);

CREATE TABLE admission.waitlist (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id bigint NOT NULL UNIQUE REFERENCES admission.application(id),
  position       integer NOT NULL,
  added_on       date NOT NULL DEFAULT current_date
);

-- ---------------------------------------------------------------------
-- MODULE 4 — FRONT OFFICE
-- ---------------------------------------------------------------------
CREATE TABLE front.enquiry (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id     bigint REFERENCES core.academic_session(id),
  campus_id      bigint REFERENCES core.campus(id),
  class_level_id bigint REFERENCES core.class_level(id),
  inquirer_name  text NOT NULL,
  phone          text,
  source_id      integer REFERENCES core.lookup_value(id),
  notes          text,
  follow_up_on   date,
  status_id      integer NOT NULL DEFAULT core.lv('enquiry_status','open') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

CREATE TABLE front.visitor (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campus_id   bigint REFERENCES core.campus(id),
  name        text NOT NULL,
  purpose_id  integer REFERENCES core.lookup_value(id),
  visiting    text,
  badge_no    text,
  in_at       timestamptz NOT NULL DEFAULT now(),
  out_at      timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

CREATE TABLE front.call_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  direction_id integer NOT NULL REFERENCES core.lookup_value(id),
  phone        text,
  caller_name  text,
  subject      text,
  notes        text,
  logged_at    timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

CREATE TABLE front.postal (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  direction_id integer NOT NULL REFERENCES core.lookup_value(id),
  ref_no       text,
  from_to      text,
  subject      text,
  received_on  date NOT NULL DEFAULT current_date,
  status_id    integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

CREATE TABLE front.complaint (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id  integer REFERENCES core.lookup_value(id),
  person_id  bigint REFERENCES core.person(id),
  subject    text NOT NULL,
  body       text,
  lodged_on  date NOT NULL DEFAULT current_date,
  status_id  integer NOT NULL DEFAULT core.lv('complaint_status','open') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

CREATE TABLE front.gate_pass (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id  bigint REFERENCES student.student(id),
  person_id   bigint REFERENCES core.person(id),
  pass_type_id integer NOT NULL REFERENCES core.lookup_value(id),
  valid_from  timestamptz NOT NULL DEFAULT now(),
  valid_to    timestamptz,
  reason      text,
  status_id   integer NOT NULL DEFAULT core.lv('pass_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

-- ---------------------------------------------------------------------
-- MODULE 8 — ACADEMIC CALENDAR
-- ---------------------------------------------------------------------
CREATE TABLE cal.term (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id bigint NOT NULL REFERENCES core.academic_session(id),
  name       text NOT NULL,
  starts_on  date NOT NULL,
  ends_on    date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id),
  CHECK (ends_on > starts_on),
  UNIQUE (session_id, name)
);

CREATE TABLE cal.week (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  term_id   bigint NOT NULL REFERENCES cal.term(id) ON DELETE CASCADE,
  week_no   smallint NOT NULL,
  starts_on date NOT NULL,
  ends_on   date NOT NULL,
  UNIQUE (term_id, week_no)
);

CREATE TABLE cal.holiday (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id     bigint NOT NULL REFERENCES core.academic_session(id),
  campus_id      bigint REFERENCES core.campus(id),
  name           text NOT NULL,
  starts_on      date NOT NULL,
  ends_on        date NOT NULL,
  holiday_type_id integer NOT NULL REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE cal.working_day (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id        bigint NOT NULL REFERENCES core.academic_session(id),
  employee_group_id integer NOT NULL REFERENCES core.lookup_value(id),
  weekday           smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_working        boolean NOT NULL DEFAULT true,
  UNIQUE (session_id, employee_group_id, weekday)
);

CREATE TABLE cal.event (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id  bigint NOT NULL REFERENCES core.academic_session(id),
  campus_id   bigint REFERENCES core.campus(id),
  title       text NOT NULL,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz,
  location    text,
  audience_id integer REFERENCES core.lookup_value(id),
  status_id   integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

CREATE TABLE cal.notice (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id   bigint REFERENCES core.academic_session(id),
  campus_id    bigint REFERENCES core.campus(id),
  title        text NOT NULL,
  body         text NOT NULL,
  published_at timestamptz,
  audience_id  integer REFERENCES core.lookup_value(id),
  status_id    integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES iam.app_user(id), updated_by bigint REFERENCES iam.app_user(id)
);

-- ---------------------------------------------------------------------
-- updated_at triggers + lookup binds
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_schema AS s, c.table_name AS t
    FROM information_schema.columns c
    JOIN information_schema.tables x
      ON x.table_schema = c.table_schema AND x.table_name = c.table_name AND x.table_type = 'BASE TABLE'
    WHERE c.column_name = 'updated_at' AND c.table_schema IN ('student','admission','front','cal')
  LOOP
    EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I.%I
                    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at()', r.s, r.t);
  END LOOP;
END $$;

SELECT core.bind_lookup(t::regclass, 'status_id', 'record_status')
FROM unnest(ARRAY[
  'student.club','student.incident',
  'admission.form_batch','admission.test',
  'front.postal','cal.event','cal.notice'
]) AS t;

SELECT core.bind_lookup(t::regclass, c, ty)
FROM (VALUES
  ('student.student',              'status_id',            'student_status'),
  ('student.guardian_link',        'relationship_type_id', 'relationship_type'),
  ('student.enrollment',           'status_id',            'enrollment_status'),
  ('student.incident',             'category_id',          'incident_category'),
  ('student.incident',             'severity_id',          'incident_severity'),
  ('student.exit_request',         'exit_type_id',         'exit_type'),
  ('student.exit_request',         'status_id',            'exit_status'),
  ('admission.form_sale',          'status_id',            'form_sale_status'),
  ('admission.application',        'status_id',            'application_status'),
  ('admission.application_guardian','relationship_type_id','relationship_type'),
  ('front.enquiry',                'source_id',            'enquiry_source'),
  ('front.enquiry',                'status_id',            'enquiry_status'),
  ('front.visitor',                'purpose_id',           'visitor_purpose'),
  ('front.call_log',               'direction_id',         'call_direction'),
  ('front.postal',                 'direction_id',         'postal_direction'),
  ('front.complaint',              'source_id',            'complaint_source'),
  ('front.complaint',              'status_id',            'complaint_status'),
  ('front.gate_pass',              'pass_type_id',         'pass_type'),
  ('front.gate_pass',              'status_id',            'pass_status'),
  ('cal.holiday',                  'holiday_type_id',      'holiday_type'),
  ('cal.working_day',              'employee_group_id',    'employee_group'),
  ('cal.event',                    'audience_id',          'event_audience'),
  ('cal.notice',                   'audience_id',          'notice_audience')
) AS x(t, c, ty);

-- =====================================================================
-- School Management System  |  Foundation schema  v0.1
-- Modules: 1 Platform Setup | 2 Identity & Access | 3 Shared Services
-- Target : Neon Postgres (15+) with Neon Auth (Better Auth, schema neon_auth)
--
-- CONVENTIONS
--  * Schemas per domain: core, iam, shared (later: student, hr, fee, acc ...)
--  * snake_case, singular table names, <thing>_id foreign keys
--  * Business PK  : bigint GENERATED ALWAYS AS IDENTITY
--    (legacy import: INSERT ... OVERRIDING SYSTEM VALUE)
--  * Lookup PK    : integer identity; ALL enum-like values AND statuses live in
--    core.lookup_type / core.lookup_value (no free-text status columns)
--  * Type safety for lookups: FK + trigger (core.bind_lookup) guarantees a column
--    only accepts values of its own lookup type (e.g. gender_id cannot hold a status)
--  * Every business table: created_at, updated_at, created_by, updated_by
--  * Money = numeric(14,2), dates = date, moments = timestamptz, flags = boolean
--  * Logic lives in server functions; DB triggers only for integrity + audit
--  * Per request, server function should run:  SET LOCAL app.user_id = '<app_user.id>'
--    so the audit trigger knows the actor.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE SCHEMA IF NOT EXISTS core;    -- platform setup, lookups, people
CREATE SCHEMA IF NOT EXISTS iam;     -- users, roles, permissions
CREATE SCHEMA IF NOT EXISTS shared;  -- settings, rules, workflow, templates, audit

-- ---------------------------------------------------------------------
-- 1. LOOKUP ENGINE
-- ---------------------------------------------------------------------
CREATE TABLE core.lookup_type (
  id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        text NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  name        text NOT NULL,
  description text,
  is_status   boolean NOT NULL DEFAULT false,  -- group is a status set (badges, final states)
  is_system   boolean NOT NULL DEFAULT false,  -- seeded; code is referenced by app code
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.lookup_value (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lookup_type_id smallint NOT NULL REFERENCES core.lookup_type(id),
  code           text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9_]*$'),
  label          text NOT NULL,
  label_alt      text,                          -- second language (Bangla / Arabic)
  sort_order     integer NOT NULL DEFAULT 0,
  is_default     boolean NOT NULL DEFAULT false,
  is_final       boolean NOT NULL DEFAULT false, -- terminal status (approved, closed, archived ...)
  color          text,
  meta           jsonb NOT NULL DEFAULT '{}',
  is_active      boolean NOT NULL DEFAULT true,
  is_system      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lookup_type_id, code)
);
CREATE UNIQUE INDEX lookup_value_one_default ON core.lookup_value (lookup_type_id) WHERE is_default;

-- core.lv('record_status','active') -> id   (used in defaults, seeds and server functions)
CREATE FUNCTION core.lv(p_type text, p_code text) RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT lv.id
  FROM core.lookup_value lv
  JOIN core.lookup_type lt ON lt.id = lv.lookup_type_id
  WHERE lt.code = p_type AND lv.code = p_code
$$;

-- Trigger: column must reference a lookup_value of the given type
CREATE FUNCTION core.enforce_lookup_type() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_id integer := (to_jsonb(NEW) ->> TG_ARGV[0])::integer;
BEGIN
  IF v_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM core.lookup_value lv
    JOIN core.lookup_type lt ON lt.id = lv.lookup_type_id
    WHERE lv.id = v_id AND lt.code = TG_ARGV[1]
  ) THEN
    RAISE EXCEPTION '%.% must reference a lookup value of type "%"',
      TG_TABLE_NAME, TG_ARGV[0], TG_ARGV[1] USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION core.bind_lookup(p_table regclass, p_column text, p_type text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %s
       FOR EACH ROW EXECUTE FUNCTION core.enforce_lookup_type(%L, %L)',
    'lk_' || p_column, p_column, p_table, p_column, p_type);
END $$;

-- ---------------------------------------------------------------------
-- 2. FILE REFERENCES (bytes live in object storage; DB keeps pointers)
-- ---------------------------------------------------------------------
CREATE TABLE shared.file (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_provider text NOT NULL DEFAULT 'r2',
  bucket           text NOT NULL,
  storage_key      text NOT NULL,
  file_name        text NOT NULL,
  mime_type        text,
  size_bytes       bigint,
  checksum_sha256  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       bigint,
  UNIQUE (bucket, storage_key)
);

-- ---------------------------------------------------------------------
-- 3. MODULE 1 - PLATFORM SETUP  (schema: core)
-- ---------------------------------------------------------------------
-- Registry of the 26 application modules (permissions, settings, rules point here)
CREATE TABLE core.module (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true
);

CREATE TABLE core.campus (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  short_name text,
  address    text,
  phone      text,
  email      text,
  status_id  integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint
);

CREATE TABLE core.school_wing (            -- Early Years, Primary ...
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  status_id  integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint
);

CREATE TABLE core.academic_session (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text NOT NULL UNIQUE,          -- '2026-2027'
  name       text NOT NULL,
  starts_on  date NOT NULL,
  ends_on    date NOT NULL,
  status_id  integer NOT NULL DEFAULT core.lv('session_status','planned') REFERENCES core.lookup_value(id),
  is_current boolean NOT NULL DEFAULT false,  -- exactly one; several sessions may be "open"
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint,
  CHECK (ends_on > starts_on),
  EXCLUDE USING gist (daterange(starts_on, ends_on, '[]') WITH &&)
);
CREATE UNIQUE INDEX academic_session_one_current ON core.academic_session (is_current) WHERE is_current;

CREATE TABLE core.class_level (            -- master list: Nursery, Grade 1 ... (not per session)
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  name_alt   text,
  wing_id    bigint REFERENCES core.school_wing(id),
  sort_order integer NOT NULL DEFAULT 0,
  status_id  integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint
);

CREATE TABLE core.class_offering (         -- a class running in a session at a campus
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id     bigint NOT NULL REFERENCES core.academic_session(id),
  campus_id      bigint NOT NULL REFERENCES core.campus(id),
  class_level_id bigint NOT NULL REFERENCES core.class_level(id),
  status_id      integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint,
  UNIQUE (session_id, campus_id, class_level_id)
);

CREATE TABLE core.class_section (          -- Morning / Day / A ...
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_offering_id bigint NOT NULL REFERENCES core.class_offering(id),
  name              text NOT NULL,
  capacity          integer CHECK (capacity > 0),
  sort_order        integer NOT NULL DEFAULT 0,
  status_id         integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint,
  UNIQUE (class_offering_id, name)
);

CREATE TABLE core.subject (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  name_alt   text,
  status_id  integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint
);

CREATE TABLE core.class_offering_subject (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_offering_id bigint NOT NULL REFERENCES core.class_offering(id),
  subject_id        bigint NOT NULL REFERENCES core.subject(id),
  is_reportable     boolean NOT NULL DEFAULT true,   -- appears on report card (legacy report_eligibility)
  sort_order        integer NOT NULL DEFAULT 0,
  status_id         integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint,
  UNIQUE (class_offering_id, subject_id)
);

CREATE TABLE core.house (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  color      text,
  campus_id  bigint REFERENCES core.campus(id),
  status_id  integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint
);

CREATE TABLE core.department (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code               text NOT NULL UNIQUE,
  name               text NOT NULL,
  department_type_id integer REFERENCES core.lookup_value(id),
  parent_id          bigint REFERENCES core.department(id),
  status_id          integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint
);

CREATE TABLE core.designation (            -- replaces legacy "title" + "designation"
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  rank_order integer NOT NULL DEFAULT 0,
  status_id  integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint
);

CREATE TABLE core.geo_unit (               -- country > division > district > upazila (level via lookup)
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id bigint REFERENCES core.geo_unit(id),
  level_id  integer NOT NULL REFERENCES core.lookup_value(id),
  name      text NOT NULL
);
CREATE UNIQUE INDEX geo_unit_unique_name ON core.geo_unit ((COALESCE(parent_id, 0)), lower(name));

-- Human-readable code generator (STD-00001, EMP-00001 ...)
CREATE TABLE core.id_sequence (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_code text NOT NULL,                        -- 'student', 'employee', 'fee_invoice' ...
  session_id  bigint REFERENCES core.academic_session(id),  -- NULL = never resets
  prefix      text NOT NULL DEFAULT '',
  padding     smallint NOT NULL DEFAULT 5,
  next_number bigint NOT NULL DEFAULT 1,
  UNIQUE NULLS NOT DISTINCT (entity_code, session_id)
);

CREATE FUNCTION core.next_code(p_entity text, p_session bigint DEFAULT NULL) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  UPDATE core.id_sequence
     SET next_number = next_number + 1
   WHERE entity_code = p_entity AND session_id IS NOT DISTINCT FROM p_session
  RETURNING prefix || lpad((next_number - 1)::text, padding, '0') INTO v;
  IF v IS NULL THEN
    RAISE EXCEPTION 'No id_sequence configured for entity "%" (session %)', p_entity, p_session;
  END IF;
  RETURN v;
END $$;

-- Person: one row per human; student / guardian / employee tables (later) point here
CREATE TABLE core.person (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name     text NOT NULL,
  last_name      text,
  name_alt       text,
  date_of_birth  date,
  gender_id      integer REFERENCES core.lookup_value(id),
  religion_id    integer REFERENCES core.lookup_value(id),
  nationality_id integer REFERENCES core.lookup_value(id),
  blood_group_id integer REFERENCES core.lookup_value(id),
  photo_file_id  uuid REFERENCES shared.file(id),
  status_id      integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint
);

CREATE TABLE core.person_contact (          -- replaces father_contact, mother_contact, sms_contact1 ...
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  person_id  bigint NOT NULL REFERENCES core.person(id) ON DELETE CASCADE,
  kind_id    integer NOT NULL REFERENCES core.lookup_value(id),   -- phone / whatsapp / email
  value      text NOT NULL,
  label      text,
  is_primary boolean NOT NULL DEFAULT false,
  use_for_sms boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint,
  UNIQUE (person_id, kind_id, value)
);
CREATE UNIQUE INDEX person_contact_one_primary ON core.person_contact (person_id, kind_id) WHERE is_primary;
CREATE INDEX person_contact_value_idx ON core.person_contact (value);

CREATE TABLE core.person_address (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  person_id   bigint NOT NULL REFERENCES core.person(id) ON DELETE CASCADE,
  kind_id     integer NOT NULL REFERENCES core.lookup_value(id),   -- present / permanent
  geo_unit_id bigint REFERENCES core.geo_unit(id),
  line1       text,
  line2       text,
  postal_code text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint,
  UNIQUE (person_id, kind_id)
);

CREATE TABLE core.person_identifier (       -- NID, birth certificate, passport, TIN
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  person_id          bigint NOT NULL REFERENCES core.person(id) ON DELETE CASCADE,
  identifier_type_id integer NOT NULL REFERENCES core.lookup_value(id),
  value              text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint,
  UNIQUE (person_id, identifier_type_id),
  UNIQUE (identifier_type_id, value)
);

-- ---------------------------------------------------------------------
-- 4. MODULE 2 - IDENTITY & ACCESS  (schema: iam)
--    Credentials/sessions are owned by Neon Auth; this schema only holds
--    "who is this login in the school" and "what may they do".
-- ---------------------------------------------------------------------
CREATE TABLE iam.role (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  is_system   boolean NOT NULL DEFAULT false,
  status_id   integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint
);

CREATE TABLE iam.app_user (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_user_id    uuid NOT NULL UNIQUE,      -- neon_auth."user".id (FK added in section 9)
  person_id       bigint NOT NULL REFERENCES core.person(id),
  profile_type_id integer NOT NULL REFERENCES core.lookup_value(id),   -- staff / student / parent
  status_id       integer NOT NULL DEFAULT core.lv('user_status','pending') REFERENCES core.lookup_value(id),
  last_login_at   timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint,
  UNIQUE (person_id, profile_type_id)
);

CREATE TABLE iam.permission (               -- module + resource + action
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module_id bigint NOT NULL REFERENCES core.module(id),
  resource  text NOT NULL,                  -- 'student', 'fee_invoice', 'salary_run' ...
  action_id integer NOT NULL REFERENCES core.lookup_value(id),
  UNIQUE (module_id, resource, action_id)
);

CREATE TABLE iam.role_permission (
  role_id       bigint NOT NULL REFERENCES iam.role(id) ON DELETE CASCADE,
  permission_id bigint NOT NULL REFERENCES iam.permission(id) ON DELETE CASCADE,
  condition     jsonb,                      -- optional row scope, e.g. {"campus":"own"}
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    bigint,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE iam.user_role (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES iam.app_user(id) ON DELETE CASCADE,
  role_id    bigint NOT NULL REFERENCES iam.role(id),
  campus_id  bigint REFERENCES core.campus(id),   -- NULL = all campuses
  valid_from date NOT NULL DEFAULT current_date,
  valid_to   date,
  created_at timestamptz NOT NULL DEFAULT now(), created_by bigint,
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX user_role_unique ON iam.user_role (user_id, role_id, (COALESCE(campus_id, 0)));

CREATE TABLE iam.user_device (               -- push tokens (was users/students "device" column)
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES iam.app_user(id) ON DELETE CASCADE,
  platform_id  integer NOT NULL REFERENCES core.lookup_value(id),
  push_token   text NOT NULL UNIQUE,
  last_seen_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 5. MODULE 3 - SHARED SERVICES  (schema: shared)
-- ---------------------------------------------------------------------
-- 5a. Settings (Tier 1): typed, scoped, effective-dated
CREATE TABLE shared.setting_definition (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module_id     bigint NOT NULL REFERENCES core.module(id),
  key           text NOT NULL,
  name          text NOT NULL,
  description   text,
  data_type_id  integer NOT NULL REFERENCES core.lookup_value(id),
  default_value jsonb,
  validation    jsonb,                      -- {"min":0,"max":60} etc.
  is_active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint,
  UNIQUE (module_id, key)
);

CREATE TABLE shared.setting_value (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  definition_id  bigint NOT NULL REFERENCES shared.setting_definition(id),
  scope_type_id  integer NOT NULL REFERENCES core.lookup_value(id),  -- global / campus / employee_group ...
  scope_id       bigint,                                             -- id in the scoped table; NULL for global
  value          jsonb NOT NULL,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to   date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint,
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  EXCLUDE USING gist (
    definition_id WITH =, scope_type_id WITH =, (COALESCE(scope_id, 0)) WITH =,
    (daterange(effective_from, effective_to, '[)')) WITH &&
  )
);

-- 5b. Rule engine (Tier 2): catalogs maintained by developers, rules composed by admins
CREATE TABLE shared.rule_action_type (        -- the action catalog
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          text NOT NULL UNIQUE,         -- 'deduct_days', 'add_allowance', 'require_approval' ...
  name          text NOT NULL,
  description   text,
  module_id     bigint REFERENCES core.module(id),   -- NULL = usable everywhere
  params_schema jsonb NOT NULL DEFAULT '{}',  -- JSON Schema used to validate + render the admin form
  is_active     boolean NOT NULL DEFAULT true
);

CREATE TABLE shared.rule_set (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module_id    bigint NOT NULL REFERENCES core.module(id),
  code         text NOT NULL UNIQUE,          -- 'payroll.attendance_deduction'
  name         text NOT NULL,
  description  text,
  subject_type text NOT NULL,                 -- what a run evaluates: 'employee_month', 'fee_invoice' ...
  eval_mode_id integer NOT NULL DEFAULT core.lv('rule_eval_mode','all_matching') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint
);

CREATE TABLE shared.rule_fact_definition (    -- facts a condition may use (late_count, working_days ...)
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_set_id  bigint NOT NULL REFERENCES shared.rule_set(id),
  code         text NOT NULL,
  name         text NOT NULL,
  data_type_id integer NOT NULL REFERENCES core.lookup_value(id),
  description  text,
  UNIQUE (rule_set_id, code)
);

CREATE TABLE shared.rule (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_set_id    bigint NOT NULL REFERENCES shared.rule_set(id),
  rule_key       uuid NOT NULL DEFAULT gen_random_uuid(),   -- same across versions of one rule
  version        integer NOT NULL DEFAULT 1,
  name           text NOT NULL,
  priority       integer NOT NULL DEFAULT 100,               -- lower runs first
  scope_type_id  integer NOT NULL DEFAULT core.lv('scope_type','global') REFERENCES core.lookup_value(id),
  scope_id       bigint,
  condition      jsonb NOT NULL DEFAULT '{}',                -- json-logic tree; {} = always
  actions        jsonb NOT NULL CHECK (jsonb_typeof(actions) = 'array'),
  status_id      integer NOT NULL DEFAULT core.lv('rule_status','draft') REFERENCES core.lookup_value(id),
  effective_from date,
  effective_to   date,
  published_by   bigint,
  published_at   timestamptz,
  notes          text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint,
  UNIQUE (rule_key, version),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);
CREATE INDEX rule_lookup_idx ON shared.rule (rule_set_id, status_id, priority);

CREATE TABLE shared.rule_evaluation_log (     -- explainability: why was this salary cut applied?
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_ref      text NOT NULL,                 -- e.g. payroll run id
  rule_id      bigint REFERENCES shared.rule(id),
  subject_type text NOT NULL,
  subject_id   bigint NOT NULL,
  matched      boolean NOT NULL,
  input_facts  jsonb NOT NULL,
  result       jsonb,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rule_eval_run_idx ON shared.rule_evaluation_log (run_ref);
CREATE INDEX rule_eval_subject_idx ON shared.rule_evaluation_log (subject_type, subject_id);

-- 5c. Approval workflow (multi-level chains; entity status itself stays in lookup)
CREATE TABLE shared.workflow (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module_id   bigint NOT NULL REFERENCES core.module(id),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  entity_type text NOT NULL,                  -- 'leave_application', 'requisition', 'fee_discount' ...
  description text,
  status_id   integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint
);

CREATE TABLE shared.workflow_step (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workflow_id      bigint NOT NULL REFERENCES shared.workflow(id) ON DELETE CASCADE,
  step_no          smallint NOT NULL,
  name             text NOT NULL,
  approver_type_id integer NOT NULL REFERENCES core.lookup_value(id),   -- role / designation / user
  approver_ref_id  bigint,                    -- iam.role.id | core.designation.id | iam.app_user.id
  min_approvals    smallint NOT NULL DEFAULT 1,
  condition        jsonb,                     -- step applies only when true (e.g. amount > 50000)
  UNIQUE (workflow_id, step_no)
);

CREATE TABLE shared.approval_request (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workflow_id     bigint NOT NULL REFERENCES shared.workflow(id),
  entity_type     text NOT NULL,
  entity_id       bigint NOT NULL,
  requested_by    bigint NOT NULL,
  current_step_no smallint NOT NULL DEFAULT 1,
  status_id       integer NOT NULL DEFAULT core.lv('approval_status','pending') REFERENCES core.lookup_value(id),
  snapshot        jsonb,                      -- what was submitted, frozen
  requested_at    timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint
);
CREATE UNIQUE INDEX approval_request_one_open ON shared.approval_request (entity_type, entity_id) WHERE completed_at IS NULL;

CREATE TABLE shared.approval_action (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id     bigint NOT NULL REFERENCES shared.approval_request(id) ON DELETE CASCADE,
  step_no        smallint NOT NULL,
  actor_user_id  bigint NOT NULL REFERENCES iam.app_user(id),
  action_type_id integer NOT NULL REFERENCES core.lookup_value(id),   -- approve / reject / return / comment
  comment        text,
  acted_at       timestamptz NOT NULL DEFAULT now()
);

-- 5d. Custom fields (values are stored in a custom_data jsonb column on each entity)
CREATE TABLE shared.custom_field_def (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type_id integer NOT NULL REFERENCES core.lookup_value(id),
  key            text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  label          text NOT NULL,
  label_alt      text,
  data_type_id   integer NOT NULL REFERENCES core.lookup_value(id),
  is_required    boolean NOT NULL DEFAULT false,
  options        jsonb,                       -- choices for select / multi_select
  validation     jsonb,
  group_label    text,
  sort_order     integer NOT NULL DEFAULT 0,
  status_id      integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint,
  UNIQUE (entity_type_id, key)
);

-- 5e. Document / message templates (letters, certificates, SMS, ID cards ...)
CREATE TABLE shared.doc_template (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code             text NOT NULL,
  version          integer NOT NULL DEFAULT 1,
  module_id        bigint REFERENCES core.module(id),
  template_type_id integer NOT NULL REFERENCES core.lookup_value(id),
  name             text NOT NULL,
  language         text NOT NULL DEFAULT 'en',
  subject          text,
  body             text NOT NULL,             -- placeholders like {{employee.name}}
  placeholders     jsonb NOT NULL DEFAULT '[]',
  status_id        integer NOT NULL DEFAULT core.lv('record_status','active') REFERENCES core.lookup_value(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint, updated_by bigint,
  UNIQUE (code, version)
);

-- 5f. Notification queue (in-app / push / SMS / email)
CREATE TABLE shared.notification (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel_id          integer NOT NULL REFERENCES core.lookup_value(id),
  recipient_person_id bigint REFERENCES core.person(id),
  to_address          text,                   -- phone / email / push token for the channel
  template_id         bigint REFERENCES shared.doc_template(id),
  title               text,
  body                text NOT NULL,
  payload             jsonb NOT NULL DEFAULT '{}',
  status_id           integer NOT NULL DEFAULT core.lv('notification_status','queued') REFERENCES core.lookup_value(id),
  scheduled_at        timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  read_at             timestamptz,
  attempts            smallint NOT NULL DEFAULT 0,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          bigint
);
CREATE INDEX notification_queue_idx ON shared.notification (status_id, scheduled_at);
CREATE INDEX notification_person_idx ON shared.notification (recipient_person_id, created_at DESC);

-- 5g. Audit log (append-only; consider monthly partitioning once volume grows)
CREATE TABLE shared.audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor_user_id bigint,
  action        text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  table_name    text NOT NULL,
  record_id     text,
  old_data      jsonb,
  new_data      jsonb
);
CREATE INDEX audit_log_record_idx ON shared.audit_log (table_name, record_id);
CREATE INDEX audit_log_time_idx ON shared.audit_log (occurred_at DESC);

-- ---------------------------------------------------------------------
-- 6. GENERIC TRIGGER FUNCTIONS
-- ---------------------------------------------------------------------
CREATE FUNCTION shared.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE FUNCTION shared.audit_row() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  j_old jsonb;
  j_new jsonb;
BEGIN
  IF TG_OP <> 'INSERT' THEN j_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN j_new := to_jsonb(NEW); END IF;
  INSERT INTO shared.audit_log (actor_user_id, action, table_name, record_id, old_data, new_data)
  VALUES (NULLIF(current_setting('app.user_id', true), '')::bigint,
          TG_OP, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
          COALESCE(j_new ->> 'id', j_old ->> 'id'), j_old, j_new);
  RETURN NULL;
END $$;

-- ---------------------------------------------------------------------
-- 7. ATTACH updated_at TRIGGERS + created_by/updated_by FKs TO EVERY TABLE THAT HAS THEM
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_schema AS s, c.table_name AS t
    FROM information_schema.columns c
    JOIN information_schema.tables x
      ON x.table_schema = c.table_schema AND x.table_name = c.table_name AND x.table_type = 'BASE TABLE'
    WHERE c.column_name = 'updated_at' AND c.table_schema IN ('core','iam','shared')
  LOOP
    EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I.%I
                    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at()', r.s, r.t);
  END LOOP;

  FOR r IN
    SELECT c.table_schema AS s, c.table_name AS t, c.column_name AS col
    FROM information_schema.columns c
    JOIN information_schema.tables x
      ON x.table_schema = c.table_schema AND x.table_name = c.table_name AND x.table_type = 'BASE TABLE'
    WHERE c.column_name IN ('created_by','updated_by','published_by')
      AND c.table_schema IN ('core','iam','shared')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ADD FOREIGN KEY (%I) REFERENCES iam.app_user(id)', r.s, r.t, r.col);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 8. BIND EVERY LOOKUP COLUMN TO ITS LOOKUP TYPE
-- ---------------------------------------------------------------------
-- 8a. all "status_id -> record_status" columns
SELECT core.bind_lookup(t::regclass, 'status_id', 'record_status')
FROM unnest(ARRAY[
  'core.campus','core.school_wing','core.class_level','core.class_offering','core.class_section',
  'core.subject','core.class_offering_subject','core.house','core.department','core.designation',
  'core.person','iam.role','shared.workflow','shared.custom_field_def','shared.doc_template'
]) AS t;

-- 8b. everything else
SELECT core.bind_lookup(t::regclass, c, ty)
FROM (VALUES
  ('core.academic_session',   'status_id',          'session_status'),
  ('core.department',         'department_type_id', 'department_type'),
  ('core.geo_unit',           'level_id',           'geo_level'),
  ('core.person',             'gender_id',          'gender'),
  ('core.person',             'religion_id',        'religion'),
  ('core.person',             'nationality_id',     'nationality'),
  ('core.person',             'blood_group_id',     'blood_group'),
  ('core.person_contact',     'kind_id',            'contact_kind'),
  ('core.person_address',     'kind_id',            'address_kind'),
  ('core.person_identifier',  'identifier_type_id', 'identifier_type'),
  ('iam.app_user',            'profile_type_id',    'profile_type'),
  ('iam.app_user',            'status_id',          'user_status'),
  ('iam.permission',          'action_id',          'permission_action'),
  ('iam.user_device',         'platform_id',        'device_platform'),
  ('shared.setting_definition','data_type_id',      'data_type'),
  ('shared.setting_value',    'scope_type_id',      'scope_type'),
  ('shared.rule_set',         'eval_mode_id',       'rule_eval_mode'),
  ('shared.rule_fact_definition','data_type_id',    'data_type'),
  ('shared.rule',             'scope_type_id',      'scope_type'),
  ('shared.rule',             'status_id',          'rule_status'),
  ('shared.workflow_step',    'approver_type_id',   'approver_type'),
  ('shared.approval_request', 'status_id',          'approval_status'),
  ('shared.approval_action',  'action_type_id',     'approval_action_type'),
  ('shared.custom_field_def', 'entity_type_id',     'custom_entity_type'),
  ('shared.custom_field_def', 'data_type_id',       'data_type'),
  ('shared.doc_template',     'template_type_id',   'template_type'),
  ('shared.notification',     'channel_id',         'notification_channel'),
  ('shared.notification',     'status_id',          'notification_status')
) AS x(t, c, ty);

-- ---------------------------------------------------------------------
-- 9. SEED DATA (system lookups, module registry, action catalog, base role)
--    Values marked "starter" are examples the admin can edit or extend.
-- ---------------------------------------------------------------------
INSERT INTO core.lookup_type (code, name, is_status, is_system) VALUES
  ('record_status','Record status',true,true),
  ('approval_status','Approval status',true,true),
  ('rule_status','Rule status',true,true),
  ('session_status','Academic session status',true,true),
  ('user_status','User account status',true,true),
  ('notification_status','Notification status',true,true),
  ('gender','Gender',false,true),
  ('religion','Religion',false,true),
  ('blood_group','Blood group',false,true),
  ('nationality','Nationality',false,true),
  ('relationship_type','Relationship type',false,true),
  ('employee_group','Employee group',false,true),
  ('profile_type','Profile type',false,true),
  ('contact_kind','Contact kind',false,true),
  ('address_kind','Address kind',false,true),
  ('identifier_type','Identifier type',false,true),
  ('geo_level','Geographic level',false,true),
  ('scope_type','Scope type',false,true),
  ('data_type','Data type',false,true),
  ('permission_action','Permission action',false,true),
  ('approver_type','Approver type',false,true),
  ('approval_action_type','Approval action',false,true),
  ('template_type','Template type',false,true),
  ('notification_channel','Notification channel',false,true),
  ('device_platform','Device platform',false,true),
  ('custom_entity_type','Custom-field entity',false,true),
  ('department_type','Department type',false,true),
  ('rule_eval_mode','Rule evaluation mode',false,true);

INSERT INTO core.lookup_value (lookup_type_id, code, label, sort_order, is_final, is_system)
SELECT t.id, v.code, v.label, v.ord, v.is_final, true
FROM (VALUES
  -- statuses
  ('record_status','active','Active',1,false),
  ('record_status','inactive','Inactive',2,false),
  ('record_status','archived','Archived',3,true),
  ('approval_status','pending','Pending',1,false),
  ('approval_status','on_hold','On hold',2,false),
  ('approval_status','approved','Approved',3,true),
  ('approval_status','rejected','Rejected',4,true),
  ('approval_status','cancelled','Cancelled',5,true),
  ('rule_status','draft','Draft',1,false),
  ('rule_status','published','Published',2,false),
  ('rule_status','archived','Archived',3,true),
  ('session_status','planned','Planned',1,false),
  ('session_status','open','Open',2,false),
  ('session_status','closed','Closed',3,true),
  ('user_status','pending','Pending activation',1,false),
  ('user_status','active','Active',2,false),
  ('user_status','suspended','Suspended',3,false),
  ('user_status','disabled','Disabled',4,true),
  ('notification_status','queued','Queued',1,false),
  ('notification_status','sent','Sent',2,false),
  ('notification_status','failed','Failed',3,true),
  ('notification_status','read','Read',4,true),
  -- people (starter)
  ('gender','male','Male',1,false),
  ('gender','female','Female',2,false),
  ('religion','islam','Islam',1,false),
  ('religion','christianity','Christianity',2,false),
  ('religion','hinduism','Hinduism',3,false),
  ('religion','buddhism','Buddhism',4,false),
  ('religion','other','Other',9,false),
  ('blood_group','a_pos','A+',1,false),
  ('blood_group','a_neg','A-',2,false),
  ('blood_group','b_pos','B+',3,false),
  ('blood_group','b_neg','B-',4,false),
  ('blood_group','ab_pos','AB+',5,false),
  ('blood_group','ab_neg','AB-',6,false),
  ('blood_group','o_pos','O+',7,false),
  ('blood_group','o_neg','O-',8,false),
  ('nationality','bangladeshi','Bangladeshi',1,false),
  ('relationship_type','father','Father',1,false),
  ('relationship_type','mother','Mother',2,false),
  ('relationship_type','guardian','Guardian',3,false),
  ('relationship_type','brother','Brother',4,false),
  ('relationship_type','sister','Sister',5,false),
  ('relationship_type','grandparent','Grandparent',6,false),
  ('relationship_type','uncle','Uncle',7,false),
  ('relationship_type','aunt','Aunt',8,false),
  ('relationship_type','other','Other',9,false),
  ('employee_group','teaching','Teaching staff',1,false),
  ('employee_group','administrative','Administrative staff',2,false),
  ('employee_group','support','Support staff',3,false),
  ('contact_kind','phone','Phone',1,false),
  ('contact_kind','whatsapp','WhatsApp',2,false),
  ('contact_kind','email','Email',3,false),
  ('address_kind','present','Present address',1,false),
  ('address_kind','permanent','Permanent address',2,false),
  ('identifier_type','national_id','National ID',1,false),
  ('identifier_type','birth_certificate','Birth certificate',2,false),
  ('identifier_type','passport','Passport',3,false),
  ('identifier_type','tin','TIN',4,false),
  ('geo_level','country','Country',1,false),
  ('geo_level','division','Division',2,false),
  ('geo_level','district','District',3,false),
  ('geo_level','upazila','Upazila / Thana',4,false),
  ('department_type','academic','Academic',1,false),
  ('department_type','administrative','Administrative',2,false),
  -- platform
  ('profile_type','staff','Staff',1,false),
  ('profile_type','student','Student',2,false),
  ('profile_type','parent','Parent',3,false),
  ('scope_type','global','Global',1,false),
  ('scope_type','campus','Campus',2,false),
  ('scope_type','employee_group','Employee group',3,false),
  ('scope_type','department','Department',4,false),
  ('scope_type','designation','Designation',5,false),
  ('scope_type','class_level','Class level',6,false),
  ('data_type','text','Text',1,false),
  ('data_type','number','Number',2,false),
  ('data_type','date','Date',3,false),
  ('data_type','boolean','Yes / No',4,false),
  ('data_type','select','Single choice',5,false),
  ('data_type','multi_select','Multiple choice',6,false),
  ('data_type','json','JSON',7,false),
  ('permission_action','view','View',1,false),
  ('permission_action','create','Create',2,false),
  ('permission_action','update','Update',3,false),
  ('permission_action','delete','Delete',4,false),
  ('permission_action','approve','Approve',5,false),
  ('permission_action','export','Export',6,false),
  ('permission_action','print','Print',7,false),
  ('approver_type','role','Role',1,false),
  ('approver_type','designation','Designation',2,false),
  ('approver_type','user','Specific user',3,false),
  ('approval_action_type','approve','Approve',1,false),
  ('approval_action_type','reject','Reject',2,false),
  ('approval_action_type','return','Return for changes',3,false),
  ('approval_action_type','comment','Comment',4,false),
  ('template_type','letter','Letter',1,false),
  ('template_type','certificate','Certificate',2,false),
  ('template_type','sms','SMS',3,false),
  ('template_type','email','Email',4,false),
  ('template_type','id_card','ID card',5,false),
  ('template_type','report_card','Report card',6,false),
  ('notification_channel','in_app','In-app',1,false),
  ('notification_channel','push','Push',2,false),
  ('notification_channel','sms','SMS',3,false),
  ('notification_channel','email','Email',4,false),
  ('device_platform','android','Android',1,false),
  ('device_platform','ios','iOS',2,false),
  ('device_platform','web','Web',3,false),
  ('custom_entity_type','student','Student',1,false),
  ('custom_entity_type','guardian','Guardian',2,false),
  ('custom_entity_type','employee','Employee',3,false),
  ('custom_entity_type','admission_application','Admission application',4,false),
  ('rule_eval_mode','all_matching','Apply all matching rules',1,false),
  ('rule_eval_mode','first_match','Apply first matching rule only',2,false)
) AS v(type_code, code, label, ord, is_final)
JOIN core.lookup_type t ON t.code = v.type_code;

INSERT INTO core.module (code, name, sort_order) VALUES
  ('platform_setup','Platform Setup',1),      ('identity_access','Identity & Access',2),
  ('shared_services','Shared Services',3),    ('front_office','Front Office',4),
  ('admission','Admission',5),                ('student','Student Management',6),
  ('academic','Academic',7),                  ('academic_calendar','Academic Calendar & Events',8),
  ('attendance','Attendance',9),              ('attendance_device','Attendance Devices',10),
  ('examination','Examination & Result',11),  ('hifz','Hifz',12),
  ('fees','Fees',13),                         ('payments','Payments',14),
  ('accounts','Accounts',15),                 ('inventory','Inventory & Procurement',16),
  ('library','Library',17),                   ('hr','HR Core',18),
  ('roster','Roster & Duty',19),              ('leave','Leave Management',20),
  ('payroll','Payroll & Salary Generator',21),('transport','Transport',22),
  ('communication','Communication',23),       ('student_portal','Student Portal',24),
  ('parent_portal','Parent Portal',25),       ('reports','Reports & Dashboards',26);

INSERT INTO shared.rule_action_type (code, name, description, params_schema) VALUES
  ('deduct_days','Deduct days of salary','Deduct N days of per-day salary',
     '{"type":"object","properties":{"days":{"type":"number"},"every":{"type":"number","description":"apply once per N occurrences"}},"required":["days"]}'),
  ('deduct_amount','Deduct fixed amount','Deduct a fixed amount',
     '{"type":"object","properties":{"amount":{"type":"number"}},"required":["amount"]}'),
  ('add_allowance','Add allowance / bonus','Add an amount or percentage of basic',
     '{"type":"object","properties":{"amount":{"type":"number"},"percent_of":{"type":"string"}}}'),
  ('apply_discount','Apply discount','Discount by amount or percent',
     '{"type":"object","properties":{"amount":{"type":"number"},"percent":{"type":"number"}}}'),
  ('set_value','Set a computed value','Write a value to a named output',
     '{"type":"object","properties":{"target":{"type":"string"},"value":{}},"required":["target","value"]}'),
  ('require_approval','Require approval','Route through a workflow',
     '{"type":"object","properties":{"workflow_code":{"type":"string"}},"required":["workflow_code"]}'),
  ('block','Block the action','Reject with a message',
     '{"type":"object","properties":{"message":{"type":"string"}},"required":["message"]}'),
  ('notify','Send notification','Queue a notification from a template',
     '{"type":"object","properties":{"template_code":{"type":"string"},"channel":{"type":"string"}},"required":["template_code"]}');

INSERT INTO iam.role (code, name, description, is_system)
VALUES ('super_admin','Super Admin','Full access; manages roles, permissions and rules', true);

INSERT INTO core.id_sequence (entity_code, session_id, prefix, padding) VALUES
  ('student', NULL, 'STD-', 5),
  ('employee', NULL, 'EMP-', 4);

-- ---------------------------------------------------------------------
-- 9b. AUDIT TRIGGERS (attached after seeding so seed rows do not flood the log)
-- Audit the tables where a change is a security / money / policy event
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['iam.user_role','iam.role_permission','iam.app_user',
                           'shared.setting_value','shared.rule','shared.workflow_step',
                           'core.lookup_value','core.academic_session'] LOOP
    EXECUTE format('CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON %s
                    FOR EACH ROW EXECUTE FUNCTION shared.audit_row()', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 10. LINK TO NEON AUTH  (run once Neon Auth is enabled on this branch)
--     Neon Auth (Better Auth) keeps users in neon_auth."user" with a uuid id and allows FKs.
--     Verify the table name against the current Neon Auth docs before running.
-- ---------------------------------------------------------------------
-- ALTER TABLE iam.app_user
--   ADD CONSTRAINT app_user_auth_user_fk
--   FOREIGN KEY (auth_user_id) REFERENCES neon_auth."user"(id);

-- =====================================================================
-- HOW TO ADD A NEW LOOKUP OR STATUS SET LATER (no migration needed for values):
--   INSERT INTO core.lookup_type (code,name,is_status) VALUES ('leave_status','Leave status',true);
--   INSERT INTO core.lookup_value (lookup_type_id,code,label,is_final)
--     SELECT id,'pending','Pending',false FROM core.lookup_type WHERE code='leave_status';
--   In the new table:  status_id integer NOT NULL DEFAULT core.lv('leave_status','pending')
--                        REFERENCES core.lookup_value(id);
--   Then:              SELECT core.bind_lookup('hr.leave_application','status_id','leave_status');
-- =====================================================================

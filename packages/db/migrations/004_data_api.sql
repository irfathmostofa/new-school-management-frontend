-- =====================================================================
-- SMS  |  Neon Data API grants + enrol RPC  v0.1
-- Depends on: 001_foundation.sql, 002_..., 003_rls.sql
-- Expose schemas in Data API settings: core, iam, shared, student, admission, front, cal
-- Never ship a Postgres connection string to the browser.
-- =====================================================================

CREATE OR REPLACE FUNCTION iam.current_user_id() RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = iam, core, public AS $$
DECLARE
  v bigint;
  v_sub text;
BEGIN
  v := NULLIF(current_setting('app.user_id', true), '')::bigint;
  IF v IS NOT NULL THEN RETURN v; END IF;

  BEGIN
    EXECUTE 'SELECT NULLIF(auth.user_id(), '''')' INTO v_sub;
  EXCEPTION WHEN undefined_function OR others THEN
    v_sub := NULL;
  END;

  IF v_sub IS NULL OR v_sub = '' THEN
    v_sub := NULLIF(current_setting('request.jwt.claim.sub', true), '');
  END IF;
  IF v_sub IS NULL OR v_sub = '' THEN
    BEGIN
      v_sub := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
    EXCEPTION WHEN others THEN
      v_sub := NULL;
    END;
  END IF;
  IF v_sub IS NULL OR v_sub = '' THEN RETURN NULL; END IF;

  SELECT au.id INTO v FROM iam.app_user au WHERE au.auth_user_id::text = v_sub;
  RETURN v;
END $$;

DO $$
DECLARE
  s text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anonymous') THEN
    CREATE ROLE anonymous NOLOGIN;
  END IF;

  FOREACH s IN ARRAY ARRAY['core','iam','shared','student','admission','front','cal']
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', s);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', s);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO authenticated', s);
    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO authenticated', s);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated',
      s
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO authenticated',
      s
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO authenticated',
      s
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION admission.enrol_application(
  p_application_id bigint,
  p_class_section_id bigint,
  p_house_id bigint DEFAULT NULL,
  p_roll_no integer DEFAULT NULL,
  p_admitted_on date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admission, student, core, iam, public
AS $$
DECLARE
  v_app admission.application%ROWTYPE;
  v_section core.class_section%ROWTYPE;
  v_student student.student%ROWTYPE;
  v_enrollment student.enrollment%ROWTYPE;
  v_uid bigint;
  v_status text;
  v_admitted date;
  v_g record;
  v_primary boolean := true;
BEGIN
  v_uid := iam.current_user_id();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (
    iam.has_permission('student', 'create')
    AND iam.has_permission('enrollment', 'create')
    AND iam.has_permission('application', 'update')
  ) THEN
    RAISE EXCEPTION 'Not permitted to enrol';
  END IF;

  SELECT * INTO v_app FROM admission.application WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  SELECT lv.code INTO v_status FROM core.lookup_value lv WHERE lv.id = v_app.status_id;

  IF v_status = 'enrolled' THEN
    RAISE EXCEPTION 'Application already enrolled';
  END IF;
  IF v_status NOT IN ('accepted', 'offered', 'submitted', 'under_review', 'test_scheduled') THEN
    RAISE EXCEPTION 'Application is not in an enrolable status';
  END IF;

  IF EXISTS (
    SELECT 1 FROM student.student s
    WHERE s.person_id = v_app.applicant_person_id OR s.application_id = v_app.id
  ) THEN
    RAISE EXCEPTION 'A student already exists for this applicant';
  END IF;

  SELECT * INTO v_section FROM core.class_section WHERE id = p_class_section_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class section is required';
  END IF;

  v_admitted := COALESCE(p_admitted_on, current_date);

  INSERT INTO student.student (
    person_id, student_code, campus_id, admitted_on, application_id, status_id, created_by, updated_by
  ) VALUES (
    v_app.applicant_person_id,
    core.next_code('student'),
    v_app.campus_id,
    v_admitted,
    v_app.id,
    core.lv('student_status', 'active'),
    v_uid,
    v_uid
  )
  RETURNING * INTO v_student;

  FOR v_g IN SELECT * FROM admission.application_guardian WHERE application_id = v_app.id
  LOOP
    INSERT INTO student.guardian_link (
      student_id, person_id, relationship_type_id, is_primary, is_emergency, lives_with, created_by, updated_by
    ) VALUES (
      v_student.id, v_g.person_id, v_g.relationship_type_id, v_primary, true, true, v_uid, v_uid
    );
    v_primary := false;
  END LOOP;

  INSERT INTO student.enrollment (
    student_id, session_id, class_section_id, house_id, roll_no, status_id, enrolled_on, created_by, updated_by
  ) VALUES (
    v_student.id,
    v_app.session_id,
    v_section.id,
    p_house_id,
    p_roll_no,
    core.lv('enrollment_status', 'enrolled'),
    v_admitted,
    v_uid,
    v_uid
  )
  RETURNING * INTO v_enrollment;

  UPDATE admission.application
     SET status_id = core.lv('application_status', 'enrolled'),
         updated_at = now(),
         updated_by = v_uid
   WHERE id = v_app.id;

  IF v_app.form_sale_id IS NOT NULL THEN
    UPDATE admission.form_sale
       SET status_id = core.lv('form_sale_status', 'used'),
           updated_at = now(),
           updated_by = v_uid
     WHERE id = v_app.form_sale_id;
  END IF;

  RETURN jsonb_build_object(
    'student', to_jsonb(v_student),
    'enrollment', to_jsonb(v_enrollment)
  );
END;
$$;

REVOKE ALL ON FUNCTION admission.enrol_application(bigint, bigint, bigint, integer, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admission.enrol_application(bigint, bigint, bigint, integer, date) TO authenticated;

-- First JWT with no iam.app_user becomes Super Admin. Later users must be provisioned.
CREATE OR REPLACE FUNCTION iam.bootstrap_staff(
  p_first_name text DEFAULT 'Staff',
  p_last_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = iam, core, public
AS $$
DECLARE
  v_sub text;
  v_uid bigint;
  v_person_id bigint;
  v_role_id bigint;
  v_au iam.app_user%ROWTYPE;
BEGIN
  BEGIN
    EXECUTE 'SELECT NULLIF(auth.user_id(), '''')' INTO v_sub;
  EXCEPTION WHEN undefined_function OR others THEN
    v_sub := NULLIF(current_setting('request.jwt.claim.sub', true), '');
  END;
  IF v_sub IS NULL OR v_sub = '' THEN
    BEGIN
      v_sub := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
    EXCEPTION WHEN others THEN
      v_sub := NULL;
    END;
  END IF;
  IF v_sub IS NULL OR v_sub = '' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_au FROM iam.app_user WHERE auth_user_id::text = v_sub;
  IF FOUND THEN
    RETURN jsonb_build_object('app_user', to_jsonb(v_au), 'created', false);
  END IF;

  IF EXISTS (SELECT 1 FROM iam.app_user) THEN
    RAISE EXCEPTION 'No school user is linked to this login. An admin must create iam.app_user.';
  END IF;

  INSERT INTO core.person (first_name, last_name, status_id)
  VALUES (COALESCE(NULLIF(p_first_name, ''), 'Staff'), p_last_name, core.lv('record_status', 'active'))
  RETURNING id INTO v_person_id;

  INSERT INTO iam.app_user (auth_user_id, person_id, profile_type_id, status_id)
  VALUES (
    v_sub::uuid,
    v_person_id,
    core.lv('profile_type', 'staff'),
    core.lv('user_status', 'active')
  )
  RETURNING * INTO v_au;

  SELECT id INTO v_role_id FROM iam.role WHERE code = 'super_admin';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO iam.user_role (user_id, role_id)
    VALUES (v_au.id, v_role_id);
  END IF;

  RETURN jsonb_build_object('app_user', to_jsonb(v_au), 'created', true);
END;
$$;

CREATE OR REPLACE FUNCTION iam.me() RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = iam, core, public
AS $$
DECLARE
  v_uid bigint;
  v_au iam.app_user%ROWTYPE;
  v_person core.person%ROWTYPE;
  v_roles jsonb;
BEGIN
  v_uid := iam.current_user_id();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_au FROM iam.app_user WHERE id = v_uid;
  SELECT * INTO v_person FROM core.person WHERE id = v_au.person_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('code', r.code, 'name', r.name)), '[]'::jsonb)
    INTO v_roles
  FROM iam.user_role ur
  JOIN iam.role r ON r.id = ur.role_id
  WHERE ur.user_id = v_uid
    AND ur.valid_from <= current_date
    AND (ur.valid_to IS NULL OR ur.valid_to >= current_date);
  RETURN jsonb_build_object(
    'app_user', to_jsonb(v_au),
    'person', to_jsonb(v_person),
    'roles', v_roles
  );
END;
$$;

REVOKE ALL ON FUNCTION iam.bootstrap_staff(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION iam.me() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam.bootstrap_staff(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION iam.me() TO authenticated;

-- Public views so Data API (default schema public) can CRUD by entity key.
-- security_invoker keeps RLS on the base tables.
CREATE OR REPLACE VIEW public.campus WITH (security_invoker = true) AS SELECT * FROM core.campus;
CREATE OR REPLACE VIEW public.school_wing WITH (security_invoker = true) AS SELECT * FROM core.school_wing;
CREATE OR REPLACE VIEW public.academic_session WITH (security_invoker = true) AS SELECT * FROM core.academic_session;
CREATE OR REPLACE VIEW public.class_level WITH (security_invoker = true) AS SELECT * FROM core.class_level;
CREATE OR REPLACE VIEW public.class_offering WITH (security_invoker = true) AS SELECT * FROM core.class_offering;
CREATE OR REPLACE VIEW public.class_section WITH (security_invoker = true) AS SELECT * FROM core.class_section;
CREATE OR REPLACE VIEW public.subject WITH (security_invoker = true) AS SELECT * FROM core.subject;
CREATE OR REPLACE VIEW public.class_offering_subject WITH (security_invoker = true) AS SELECT * FROM core.class_offering_subject;
CREATE OR REPLACE VIEW public.house WITH (security_invoker = true) AS SELECT * FROM core.house;
CREATE OR REPLACE VIEW public.department WITH (security_invoker = true) AS SELECT * FROM core.department;
CREATE OR REPLACE VIEW public.designation WITH (security_invoker = true) AS SELECT * FROM core.designation;
CREATE OR REPLACE VIEW public.geo_unit WITH (security_invoker = true) AS SELECT * FROM core.geo_unit;
CREATE OR REPLACE VIEW public.person WITH (security_invoker = true) AS SELECT * FROM core.person;
CREATE OR REPLACE VIEW public.module WITH (security_invoker = true) AS SELECT * FROM core.module;
CREATE OR REPLACE VIEW public.id_sequence WITH (security_invoker = true) AS SELECT * FROM core.id_sequence;
CREATE OR REPLACE VIEW public.lookup_type WITH (security_invoker = true) AS SELECT * FROM core.lookup_type;
CREATE OR REPLACE VIEW public.lookup_value WITH (security_invoker = true) AS SELECT * FROM core.lookup_value;
CREATE OR REPLACE VIEW public.role WITH (security_invoker = true) AS SELECT * FROM iam.role;
CREATE OR REPLACE VIEW public.app_user WITH (security_invoker = true) AS SELECT * FROM iam.app_user;
CREATE OR REPLACE VIEW public.permission WITH (security_invoker = true) AS SELECT * FROM iam.permission;
CREATE OR REPLACE VIEW public.role_permission WITH (security_invoker = true) AS SELECT * FROM iam.role_permission;
CREATE OR REPLACE VIEW public.user_role WITH (security_invoker = true) AS SELECT * FROM iam.user_role;
CREATE OR REPLACE VIEW public.setting_definition WITH (security_invoker = true) AS SELECT * FROM shared.setting_definition;
CREATE OR REPLACE VIEW public.setting_value WITH (security_invoker = true) AS SELECT * FROM shared.setting_value;
CREATE OR REPLACE VIEW public.rule_set WITH (security_invoker = true) AS SELECT * FROM shared.rule_set;
CREATE OR REPLACE VIEW public.rule WITH (security_invoker = true) AS SELECT * FROM shared.rule;
CREATE OR REPLACE VIEW public.workflow WITH (security_invoker = true) AS SELECT * FROM shared.workflow;
CREATE OR REPLACE VIEW public.workflow_step WITH (security_invoker = true) AS SELECT * FROM shared.workflow_step;
CREATE OR REPLACE VIEW public.custom_field_def WITH (security_invoker = true) AS SELECT * FROM shared.custom_field_def;
CREATE OR REPLACE VIEW public.doc_template WITH (security_invoker = true) AS SELECT * FROM shared.doc_template;
CREATE OR REPLACE VIEW public.student WITH (security_invoker = true) AS SELECT * FROM student.student;
CREATE OR REPLACE VIEW public.guardian_link WITH (security_invoker = true) AS SELECT * FROM student.guardian_link;
CREATE OR REPLACE VIEW public.health WITH (security_invoker = true) AS SELECT * FROM student.health;
CREATE OR REPLACE VIEW public.previous_school WITH (security_invoker = true) AS SELECT * FROM student.previous_school;
CREATE OR REPLACE VIEW public.enrollment WITH (security_invoker = true) AS SELECT * FROM student.enrollment;
CREATE OR REPLACE VIEW public.club WITH (security_invoker = true) AS SELECT * FROM student.club;
CREATE OR REPLACE VIEW public.club_membership WITH (security_invoker = true) AS SELECT * FROM student.club_membership;
CREATE OR REPLACE VIEW public.incident WITH (security_invoker = true) AS SELECT * FROM student.incident;
CREATE OR REPLACE VIEW public.exit_request WITH (security_invoker = true) AS SELECT * FROM student.exit_request;
CREATE OR REPLACE VIEW public.form_batch WITH (security_invoker = true) AS SELECT * FROM admission.form_batch;
CREATE OR REPLACE VIEW public.form_sale WITH (security_invoker = true) AS SELECT * FROM admission.form_sale;
CREATE OR REPLACE VIEW public.application WITH (security_invoker = true) AS SELECT * FROM admission.application;
CREATE OR REPLACE VIEW public.application_guardian WITH (security_invoker = true) AS SELECT * FROM admission.application_guardian;
CREATE OR REPLACE VIEW public.admission_test WITH (security_invoker = true) AS SELECT * FROM admission.test;
CREATE OR REPLACE VIEW public.test_score WITH (security_invoker = true) AS SELECT * FROM admission.test_score;
CREATE OR REPLACE VIEW public.waitlist WITH (security_invoker = true) AS SELECT * FROM admission.waitlist;
CREATE OR REPLACE VIEW public.enquiry WITH (security_invoker = true) AS SELECT * FROM front.enquiry;
CREATE OR REPLACE VIEW public.visitor WITH (security_invoker = true) AS SELECT * FROM front.visitor;
CREATE OR REPLACE VIEW public.call_log WITH (security_invoker = true) AS SELECT * FROM front.call_log;
CREATE OR REPLACE VIEW public.postal WITH (security_invoker = true) AS SELECT * FROM front.postal;
CREATE OR REPLACE VIEW public.complaint WITH (security_invoker = true) AS SELECT * FROM front.complaint;
CREATE OR REPLACE VIEW public.gate_pass WITH (security_invoker = true) AS SELECT * FROM front.gate_pass;
CREATE OR REPLACE VIEW public.term WITH (security_invoker = true) AS SELECT * FROM cal.term;
CREATE OR REPLACE VIEW public.week WITH (security_invoker = true) AS SELECT * FROM cal.week;
CREATE OR REPLACE VIEW public.holiday WITH (security_invoker = true) AS SELECT * FROM cal.holiday;
CREATE OR REPLACE VIEW public.working_day WITH (security_invoker = true) AS SELECT * FROM cal.working_day;
CREATE OR REPLACE VIEW public.event WITH (security_invoker = true) AS SELECT * FROM cal.event;
CREATE OR REPLACE VIEW public.notice WITH (security_invoker = true) AS SELECT * FROM cal.notice;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

CREATE OR REPLACE FUNCTION public.enrol_application(
  p_application_id bigint,
  p_class_section_id bigint,
  p_house_id bigint DEFAULT NULL,
  p_roll_no integer DEFAULT NULL,
  p_admitted_on date DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = admission, student, core, iam, public
AS $$
  SELECT admission.enrol_application($1, $2, $3, $4, $5);
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_staff(
  p_first_name text DEFAULT 'Staff',
  p_last_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = iam, core, public
AS $$
  SELECT iam.bootstrap_staff($1, $2);
$$;

CREATE OR REPLACE FUNCTION public.me() RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = iam, core, public
AS $$
  SELECT iam.me();
$$;

REVOKE ALL ON FUNCTION public.enrol_application(bigint, bigint, bigint, integer, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_staff(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.me() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enrol_application(bigint, bigint, bigint, integer, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_staff(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.me() TO authenticated;

REVOKE EXECUTE ON FUNCTION iam.me() FROM authenticated;
REVOKE EXECUTE ON FUNCTION iam.bootstrap_staff(text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION admission.enrol_application(bigint, bigint, bigint, integer, date) FROM authenticated;

-- SECURITY DEFINER + FORCE RLS: policies must apply to the function owner, not only authenticated.
DROP POLICY IF EXISTS core_person_bootstrap ON core.person;
CREATE POLICY core_person_bootstrap ON core.person
  FOR INSERT
  WITH CHECK (NOT EXISTS (SELECT 1 FROM iam.app_user));

DROP POLICY IF EXISTS iam_app_user_bootstrap ON iam.app_user;
CREATE POLICY iam_app_user_bootstrap ON iam.app_user
  FOR INSERT
  WITH CHECK (NOT EXISTS (SELECT 1 FROM iam.app_user));

DROP POLICY IF EXISTS iam_user_role_bootstrap ON iam.user_role;
CREATE POLICY iam_user_role_bootstrap ON iam.user_role
  FOR INSERT
  WITH CHECK (
    (SELECT count(*) FROM iam.app_user) <= 1
    AND user_id = (SELECT id FROM iam.app_user ORDER BY id LIMIT 1)
  );

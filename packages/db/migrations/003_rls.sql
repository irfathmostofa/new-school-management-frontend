-- =====================================================================
-- SMS  |  RLS layer  v0.1
-- Identity: SET LOCAL app.user_id  OR  Neon Auth JWT sub → iam.app_user
-- Never enable Data API on a table until this file has been applied.
-- =====================================================================

CREATE OR REPLACE FUNCTION iam.current_user_id() RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = iam, core, public AS $$
DECLARE
  v bigint;
  v_sub text;
BEGIN
  v := NULLIF(current_setting('app.user_id', true), '')::bigint;
  IF v IS NOT NULL THEN RETURN v; END IF;

  v_sub := NULLIF(current_setting('request.jwt.claim.sub', true), '');
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

CREATE OR REPLACE FUNCTION iam.current_user_is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = iam, core, public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM iam.user_role ur
    JOIN iam.role r ON r.id = ur.role_id
    WHERE ur.user_id = iam.current_user_id()
      AND r.code = 'super_admin'
      AND ur.valid_from <= current_date
      AND (ur.valid_to IS NULL OR ur.valid_to >= current_date)
  );
$$;

CREATE OR REPLACE FUNCTION iam.has_permission(p_resource text, p_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = iam, core, public AS $$
  SELECT iam.current_user_is_super_admin()
      OR EXISTS (
        SELECT 1
        FROM iam.user_role ur
        JOIN iam.role_permission rp ON rp.role_id = ur.role_id
        JOIN iam.permission p ON p.id = rp.permission_id
        JOIN core.lookup_value lv ON lv.id = p.action_id
        WHERE ur.user_id = iam.current_user_id()
          AND p.resource = p_resource
          AND lv.code = p_action
          AND ur.valid_from <= current_date
          AND (ur.valid_to IS NULL OR ur.valid_to >= current_date)
      );
$$;

CREATE OR REPLACE FUNCTION iam.current_campus_ids() RETURNS bigint[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = iam, core, public AS $$
  SELECT COALESCE(
    array_agg(DISTINCT ur.campus_id) FILTER (WHERE ur.campus_id IS NOT NULL),
    ARRAY[]::bigint[]
  )
  FROM iam.user_role ur
  WHERE ur.user_id = iam.current_user_id()
    AND ur.valid_from <= current_date
    AND (ur.valid_to IS NULL OR ur.valid_to >= current_date);
$$;

REVOKE ALL ON FUNCTION iam.current_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION iam.has_permission(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam.current_user_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION iam.has_permission(text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION iam.current_user_is_super_admin() TO PUBLIC;
GRANT EXECUTE ON FUNCTION iam.current_campus_ids() TO PUBLIC;

-- Generic policy: authenticated school users may read master data they can view;
-- writes require the matching permission. Super admin bypasses.
DO $$
DECLARE
  r record;
  pol text;
BEGIN
  FOR r IN
    SELECT table_schema AS s, table_name AS t
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema IN ('core','iam','shared','student','admission','front','cal')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.s, r.t);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', r.s, r.t);

    pol := r.s || '_' || r.t || '_select';
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol, r.s, r.t);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR SELECT USING (iam.has_permission(%L, %L))',
      pol, r.s, r.t, r.t, 'view');

    pol := r.s || '_' || r.t || '_insert';
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol, r.s, r.t);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR INSERT WITH CHECK (iam.has_permission(%L, %L))',
      pol, r.s, r.t, r.t, 'create');

    pol := r.s || '_' || r.t || '_update';
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol, r.s, r.t);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR UPDATE USING (iam.has_permission(%L, %L)) WITH CHECK (iam.has_permission(%L, %L))',
      pol, r.s, r.t, r.t, 'update', r.t, 'update');

    pol := r.s || '_' || r.t || '_delete';
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol, r.s, r.t);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR DELETE USING (iam.has_permission(%L, %L))',
      pol, r.s, r.t, r.t, 'delete');
  END LOOP;
END $$;

-- Lookups are readable to any authenticated app user (needed for every form).
DROP POLICY IF EXISTS core_lookup_type_select ON core.lookup_type;
DROP POLICY IF EXISTS core_lookup_value_select ON core.lookup_value;
CREATE POLICY core_lookup_type_select ON core.lookup_type
  FOR SELECT USING (iam.current_user_id() IS NOT NULL);
CREATE POLICY core_lookup_value_select ON core.lookup_value
  FOR SELECT USING (iam.current_user_id() IS NOT NULL);

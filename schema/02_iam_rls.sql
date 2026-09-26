-- =====================================================================
-- School Management System  |  IAM RLS layer  v0.1
-- Requires: 01_foundation_schema.sql
-- Helpers: iam.current_user_id(), iam.has_role(), iam.has_permission()
-- Policy pattern: authenticated + (super_admin OR matching grant)
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS iam;

-- Actor for this transaction. Server functions must run:
--   SET LOCAL app.user_id = '<iam.app_user.id>';
CREATE OR REPLACE FUNCTION iam.current_user_id() RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::bigint
$$;

CREATE OR REPLACE FUNCTION iam.current_auth_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION iam.is_super_admin(p_user_id bigint DEFAULT iam.current_user_id())
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM iam.user_role ur
    JOIN iam.role r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND r.code = 'super_admin'
      AND r.status_id = core.lv('record_status','active')
      AND current_date >= ur.valid_from
      AND (ur.valid_to IS NULL OR current_date <= ur.valid_to)
  )
$$;

CREATE OR REPLACE FUNCTION iam.has_role(
  p_role_code text,
  p_campus_id bigint DEFAULT NULL,
  p_user_id bigint DEFAULT iam.current_user_id()
) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT iam.is_super_admin(p_user_id) OR EXISTS (
    SELECT 1
    FROM iam.user_role ur
    JOIN iam.role r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND r.code = p_role_code
      AND r.status_id = core.lv('record_status','active')
      AND (ur.campus_id IS NULL OR p_campus_id IS NULL OR ur.campus_id = p_campus_id)
      AND current_date >= ur.valid_from
      AND (ur.valid_to IS NULL OR current_date <= ur.valid_to)
  )
$$;

-- module code, resource code, action code (lookup permission_action)
CREATE OR REPLACE FUNCTION iam.has_permission(
  p_module text,
  p_resource text,
  p_action text,
  p_campus_id bigint DEFAULT NULL,
  p_user_id bigint DEFAULT iam.current_user_id()
) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT iam.is_super_admin(p_user_id) OR EXISTS (
    SELECT 1
    FROM iam.user_role ur
    JOIN iam.role_permission rp ON rp.role_id = ur.role_id
    JOIN iam.permission p ON p.id = rp.permission_id
    JOIN core.module m ON m.id = p.module_id
    JOIN core.lookup_value a ON a.id = p.action_id
    JOIN iam.role r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND m.code = p_module
      AND p.resource = p_resource
      AND a.code = p_action
      AND r.status_id = core.lv('record_status','active')
      AND (ur.campus_id IS NULL OR p_campus_id IS NULL OR ur.campus_id = p_campus_id)
      AND current_date >= ur.valid_from
      AND (ur.valid_to IS NULL OR current_date <= ur.valid_to)
  )
$$;

CREATE OR REPLACE FUNCTION iam.resolve_app_user_id() RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT u.id
  FROM iam.app_user u
  WHERE u.auth_user_id = iam.current_auth_user_id()
    AND u.status_id = core.lv('user_status','active')
$$;

-- ---------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------
ALTER TABLE iam.role            ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.app_user        ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.permission      ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.role_permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.user_role       ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.user_device     ENABLE ROW LEVEL SECURITY;

ALTER TABLE iam.role            FORCE ROW LEVEL SECURITY;
ALTER TABLE iam.app_user        FORCE ROW LEVEL SECURITY;
ALTER TABLE iam.permission      FORCE ROW LEVEL SECURITY;
ALTER TABLE iam.role_permission FORCE ROW LEVEL SECURITY;
ALTER TABLE iam.user_role       FORCE ROW LEVEL SECURITY;
ALTER TABLE iam.user_device     FORCE ROW LEVEL SECURITY;

-- role
CREATE POLICY role_select ON iam.role FOR SELECT
  USING (iam.current_user_id() IS NOT NULL);

CREATE POLICY role_insert ON iam.role FOR INSERT
  WITH CHECK (iam.has_permission('identity_access','role','create'));

CREATE POLICY role_update ON iam.role FOR UPDATE
  USING (iam.has_permission('identity_access','role','update'))
  WITH CHECK (iam.has_permission('identity_access','role','update'));

CREATE POLICY role_delete ON iam.role FOR DELETE
  USING (iam.has_permission('identity_access','role','delete') AND is_system = false);

-- app_user: a user may always read themselves
CREATE POLICY app_user_select ON iam.app_user FOR SELECT
  USING (
    id = iam.current_user_id()
    OR iam.has_permission('identity_access','user','view')
  );

CREATE POLICY app_user_insert ON iam.app_user FOR INSERT
  WITH CHECK (iam.has_permission('identity_access','user','create'));

CREATE POLICY app_user_update ON iam.app_user FOR UPDATE
  USING (
    id = iam.current_user_id()
    OR iam.has_permission('identity_access','user','update')
  )
  WITH CHECK (
    id = iam.current_user_id()
    OR iam.has_permission('identity_access','user','update')
  );

CREATE POLICY app_user_delete ON iam.app_user FOR DELETE
  USING (iam.has_permission('identity_access','user','delete'));

-- permission catalog
CREATE POLICY permission_select ON iam.permission FOR SELECT
  USING (iam.current_user_id() IS NOT NULL);

CREATE POLICY permission_write ON iam.permission FOR ALL
  USING (iam.has_permission('identity_access','permission','update'))
  WITH CHECK (iam.has_permission('identity_access','permission','update'));

-- role_permission
CREATE POLICY role_permission_select ON iam.role_permission FOR SELECT
  USING (
    iam.has_permission('identity_access','role','view')
    OR role_id IN (SELECT ur.role_id FROM iam.user_role ur WHERE ur.user_id = iam.current_user_id())
  );

CREATE POLICY role_permission_write ON iam.role_permission FOR ALL
  USING (iam.has_permission('identity_access','permission','approve'))
  WITH CHECK (iam.has_permission('identity_access','permission','approve'));

-- user_role
CREATE POLICY user_role_select ON iam.user_role FOR SELECT
  USING (
    user_id = iam.current_user_id()
    OR iam.has_permission('identity_access','user_role','view')
  );

CREATE POLICY user_role_write ON iam.user_role FOR ALL
  USING (iam.has_permission('identity_access','user_role','update'))
  WITH CHECK (iam.has_permission('identity_access','user_role','update'));

-- user_device
CREATE POLICY user_device_select ON iam.user_device FOR SELECT
  USING (
    user_id = iam.current_user_id()
    OR iam.has_permission('identity_access','user_device','view')
  );

CREATE POLICY user_device_write ON iam.user_device FOR ALL
  USING (
    user_id = iam.current_user_id()
    OR iam.has_permission('identity_access','user_device','update')
  )
  WITH CHECK (
    user_id = iam.current_user_id()
    OR iam.has_permission('identity_access','user_device','update')
  );

GRANT USAGE ON SCHEMA iam TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA iam TO authenticated;
GRANT SELECT ON iam.role, iam.permission TO anon;

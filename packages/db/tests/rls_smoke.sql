-- Run against a database after 001 + 002 + 003.
-- Expect: no rows for an anonymous session; Super Admin sees rows after SET LOCAL.

SET LOCAL app.user_id = '';
SELECT iam.current_user_id() IS NULL AS anonymous_has_no_user;

-- Super admin is seeded as app_user id 1 in the JSON API; on Postgres, look it up:
-- SELECT id FROM iam.app_user ORDER BY id LIMIT 1;

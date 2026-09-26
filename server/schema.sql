CREATE TABLE IF NOT EXISTS core_lookup_type (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_status INTEGER NOT NULL DEFAULT 0,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS core_lookup_value (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lookup_type_id INTEGER NOT NULL REFERENCES core_lookup_type(id),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  label_alt TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_final INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (lookup_type_id, code)
);

CREATE TABLE IF NOT EXISTS core_module (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS core_campus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  status_id INTEGER NOT NULL REFERENCES core_lookup_value(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS core_person (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  name_alt TEXT,
  date_of_birth TEXT,
  gender_id INTEGER REFERENCES core_lookup_value(id),
  status_id INTEGER NOT NULL REFERENCES core_lookup_value(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS iam_role (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  status_id INTEGER NOT NULL REFERENCES core_lookup_value(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER,
  updated_by INTEGER
);

CREATE TABLE IF NOT EXISTS iam_app_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auth_user_id TEXT NOT NULL UNIQUE,
  person_id INTEGER NOT NULL REFERENCES core_person(id),
  profile_type_id INTEGER NOT NULL REFERENCES core_lookup_value(id),
  status_id INTEGER NOT NULL REFERENCES core_lookup_value(id),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER,
  updated_by INTEGER,
  UNIQUE (person_id, profile_type_id)
);

CREATE TABLE IF NOT EXISTS iam_credential (
  user_id INTEGER PRIMARY KEY REFERENCES iam_app_user(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS iam_permission (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id INTEGER NOT NULL REFERENCES core_module(id),
  resource TEXT NOT NULL,
  action_id INTEGER NOT NULL REFERENCES core_lookup_value(id),
  UNIQUE (module_id, resource, action_id)
);

CREATE TABLE IF NOT EXISTS iam_role_permission (
  role_id INTEGER NOT NULL REFERENCES iam_role(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES iam_permission(id) ON DELETE CASCADE,
  condition TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS iam_user_role (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES iam_app_user(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES iam_role(id),
  campus_id INTEGER REFERENCES core_campus(id),
  valid_from TEXT NOT NULL DEFAULT (date('now')),
  valid_to TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS user_role_unique
  ON iam_user_role (user_id, role_id, COALESCE(campus_id, 0));

CREATE TABLE IF NOT EXISTS iam_user_device (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES iam_app_user(id) ON DELETE CASCADE,
  platform_id INTEGER NOT NULL REFERENCES core_lookup_value(id),
  push_token TEXT NOT NULL UNIQUE,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS iam_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id INTEGER,
  action TEXT NOT NULL,
  actor_user_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

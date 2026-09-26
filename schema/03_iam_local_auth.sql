-- Local email/password store until Neon Auth is enabled on the branch.
-- Production: drop this table and use neon_auth."user" + invitations.

CREATE TABLE IF NOT EXISTS iam.credential (
  user_id       bigint PRIMARY KEY REFERENCES iam.app_user(id) ON DELETE CASCADE,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL
);

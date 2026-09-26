import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { lv, many, one, query } from "./db.js";

const SECRET = process.env.SMS_SESSION_SECRET || "sms-local-dev-secret";
const COOKIE = "sms_session";
const TTL_MS = 12 * 60 * 60 * 1000;

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const check = scryptSync(password, salt, 32).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function unsign(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function setSession(res, userId) {
  const token = sign({ uid: userId, exp: Date.now() + TTL_MS });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_MS,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

export async function isSuperAdmin(userId) {
  const active = await lv("record_status", "active");
  const row = await one(
    `SELECT 1 AS ok
     FROM iam.user_role ur
     JOIN iam.role r ON r.id = ur.role_id
     WHERE ur.user_id = $1
       AND r.code = 'super_admin'
       AND r.status_id = $2
       AND current_date >= ur.valid_from
       AND (ur.valid_to IS NULL OR current_date <= ur.valid_to)`,
    [userId, active]
  );
  return Boolean(row);
}

export async function hasPermission(userId, module, resource, action, campusId = null) {
  if (await isSuperAdmin(userId)) return true;
  const active = await lv("record_status", "active");
  const row = await one(
    `SELECT 1 AS ok
     FROM iam.user_role ur
     JOIN iam.role_permission rp ON rp.role_id = ur.role_id
     JOIN iam.permission p ON p.id = rp.permission_id
     JOIN core.module m ON m.id = p.module_id
     JOIN core.lookup_value a ON a.id = p.action_id
     JOIN iam.role r ON r.id = ur.role_id
     WHERE ur.user_id = $1
       AND m.code = $2
       AND p.resource = $3
       AND a.code = $4
       AND r.status_id = $5
       AND ($6::bigint IS NULL OR ur.campus_id IS NULL OR ur.campus_id = $6)
       AND current_date >= ur.valid_from
       AND (ur.valid_to IS NULL OR current_date <= ur.valid_to)`,
    [userId, module, resource, action, active, campusId]
  );
  return Boolean(row);
}

export async function loadSession(userId) {
  const user = await one(
    `SELECT
       u.id, u.auth_user_id, u.person_id, u.last_login_at,
       c.email,
       pt.code AS profile_type, pt.label AS profile_label,
       us.code AS status, us.label AS status_label,
       p.first_name, p.last_name
     FROM iam.app_user u
     JOIN iam.credential c ON c.user_id = u.id
     JOIN core.person p ON p.id = u.person_id
     JOIN core.lookup_value pt ON pt.id = u.profile_type_id
     JOIN core.lookup_value us ON us.id = u.status_id
     WHERE u.id = $1`,
    [userId]
  );
  if (!user) return null;

  const roles = await many(
    `SELECT ur.id, r.code, r.name, ur.campus_id, campus.name AS campus_name, ur.valid_from, ur.valid_to
     FROM iam.user_role ur
     JOIN iam.role r ON r.id = ur.role_id
     LEFT JOIN core.campus campus ON campus.id = ur.campus_id
     WHERE ur.user_id = $1
       AND current_date >= ur.valid_from
       AND (ur.valid_to IS NULL OR current_date <= ur.valid_to)`,
    [userId]
  );

  const superAdmin = await isSuperAdmin(userId);
  const permissions = superAdmin
    ? await many(
        `SELECT m.code AS module, p.resource, a.code AS action
         FROM iam.permission p
         JOIN core.module m ON m.id = p.module_id
         JOIN core.lookup_value a ON a.id = p.action_id`
      )
    : await many(
        `SELECT DISTINCT m.code AS module, p.resource, a.code AS action
         FROM iam.user_role ur
         JOIN iam.role_permission rp ON rp.role_id = ur.role_id
         JOIN iam.permission p ON p.id = rp.permission_id
         JOIN core.module m ON m.id = p.module_id
         JOIN core.lookup_value a ON a.id = p.action_id
         WHERE ur.user_id = $1
           AND current_date >= ur.valid_from
           AND (ur.valid_to IS NULL OR current_date <= ur.valid_to)`,
        [userId]
      );

  return {
    ...user,
    display_name: [user.first_name, user.last_name].filter(Boolean).join(" "),
    is_super_admin: superAdmin,
    roles,
    permissions,
  };
}

export async function authenticate(req, res, next) {
  try {
    const payload = unsign(req.cookies?.[COOKIE]);
    if (!payload || payload.exp < Date.now()) {
      return res.status(401).json({ error: "Unauthenticated" });
    }
    const session = await loadSession(payload.uid);
    if (!session || session.status !== "active") {
      return res.status(401).json({ error: "Unauthenticated" });
    }
    req.user = session;
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(resource, action) {
  return async (req, res, next) => {
    try {
      if (!(await hasPermission(req.user.id, "identity_access", resource, action))) {
        return res.status(403).json({ error: "Forbidden" });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export async function login(email, password) {
  const row = await one(
    `SELECT u.id, u.status_id, c.password_hash
     FROM iam.credential c
     JOIN iam.app_user u ON u.id = c.user_id
     WHERE lower(c.email) = lower($1)`,
    [email]
  );
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  const active = await lv("user_status", "active");
  if (row.status_id !== active) return { disabled: true };
  await query("UPDATE iam.app_user SET last_login_at = now() WHERE id = $1", [row.id]);
  return { id: row.id };
}

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import db, { lv } from "./db.js";

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

export function isSuperAdmin(userId) {
  const row = db.prepare(`
    SELECT 1 AS ok
    FROM iam_user_role ur
    JOIN iam_role r ON r.id = ur.role_id
    WHERE ur.user_id = ?
      AND r.code = 'super_admin'
      AND r.status_id = ?
      AND date('now') >= ur.valid_from
      AND (ur.valid_to IS NULL OR date('now') <= ur.valid_to)
  `).get(userId, lv("record_status", "active"));
  return Boolean(row);
}

export function hasPermission(userId, module, resource, action, campusId = null) {
  if (isSuperAdmin(userId)) return true;
  const row = db.prepare(`
    SELECT 1 AS ok
    FROM iam_user_role ur
    JOIN iam_role_permission rp ON rp.role_id = ur.role_id
    JOIN iam_permission p ON p.id = rp.permission_id
    JOIN core_module m ON m.id = p.module_id
    JOIN core_lookup_value a ON a.id = p.action_id
    JOIN iam_role r ON r.id = ur.role_id
    WHERE ur.user_id = ?
      AND m.code = ?
      AND p.resource = ?
      AND a.code = ?
      AND r.status_id = ?
      AND (? IS NULL OR ur.campus_id IS NULL OR ur.campus_id = ?)
      AND date('now') >= ur.valid_from
      AND (ur.valid_to IS NULL OR date('now') <= ur.valid_to)
  `).get(
    userId,
    module,
    resource,
    action,
    lv("record_status", "active"),
    campusId,
    campusId
  );
  return Boolean(row);
}

export function loadSession(userId) {
  const user = db.prepare(`
    SELECT
      u.id, u.auth_user_id, u.person_id, u.last_login_at,
      c.email,
      pt.code AS profile_type, pt.label AS profile_label,
      us.code AS status, us.label AS status_label,
      p.first_name, p.last_name
    FROM iam_app_user u
    JOIN iam_credential c ON c.user_id = u.id
    JOIN core_person p ON p.id = u.person_id
    JOIN core_lookup_value pt ON pt.id = u.profile_type_id
    JOIN core_lookup_value us ON us.id = u.status_id
    WHERE u.id = ?
  `).get(userId);
  if (!user) return null;

  const roles = db.prepare(`
    SELECT ur.id, r.code, r.name, ur.campus_id, campus.name AS campus_name, ur.valid_from, ur.valid_to
    FROM iam_user_role ur
    JOIN iam_role r ON r.id = ur.role_id
    LEFT JOIN core_campus campus ON campus.id = ur.campus_id
    WHERE ur.user_id = ?
      AND date('now') >= ur.valid_from
      AND (ur.valid_to IS NULL OR date('now') <= ur.valid_to)
  `).all(userId);

  const permissions = isSuperAdmin(userId)
    ? db.prepare(`
        SELECT m.code AS module, p.resource, a.code AS action
        FROM iam_permission p
        JOIN core_module m ON m.id = p.module_id
        JOIN core_lookup_value a ON a.id = p.action_id
      `).all()
    : db.prepare(`
        SELECT DISTINCT m.code AS module, p.resource, a.code AS action
        FROM iam_user_role ur
        JOIN iam_role_permission rp ON rp.role_id = ur.role_id
        JOIN iam_permission p ON p.id = rp.permission_id
        JOIN core_module m ON m.id = p.module_id
        JOIN core_lookup_value a ON a.id = p.action_id
        WHERE ur.user_id = ?
          AND date('now') >= ur.valid_from
          AND (ur.valid_to IS NULL OR date('now') <= ur.valid_to)
      `).all(userId);

  return {
    ...user,
    display_name: [user.first_name, user.last_name].filter(Boolean).join(" "),
    is_super_admin: isSuperAdmin(userId),
    roles,
    permissions,
  };
}

export function authenticate(req, res, next) {
  const payload = unsign(req.cookies?.[COOKIE]);
  if (!payload || payload.exp < Date.now()) {
    return res.status(401).json({ error: "Unauthenticated" });
  }
  const session = loadSession(payload.uid);
  if (!session || session.status !== "active") {
    return res.status(401).json({ error: "Unauthenticated" });
  }
  req.user = session;
  next();
}

export function requirePermission(resource, action) {
  return (req, res, next) => {
    if (!hasPermission(req.user.id, "identity_access", resource, action)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

export function login(email, password) {
  const row = db.prepare(`
    SELECT u.id, u.status_id, c.password_hash
    FROM iam_credential c
    JOIN iam_app_user u ON u.id = c.user_id
    WHERE lower(c.email) = lower(?)
  `).get(email);
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  if (row.status_id !== lv("user_status", "active")) return { disabled: true };
  db.prepare("UPDATE iam_app_user SET last_login_at = datetime('now') WHERE id = ?").run(row.id);
  return { id: row.id };
}

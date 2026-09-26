import { randomUUID } from "node:crypto";
import { Router } from "express";
import db, { insert, lv, transaction } from "../db.js";
import { hashPassword, requirePermission } from "../auth.js";

const router = Router();

function audit(table, rowId, action, actor, detail) {
  db.prepare(
    "INSERT INTO iam_audit_log (table_name, row_id, action, actor_user_id, detail) VALUES (?, ?, ?, ?, ?)"
  ).run(table, rowId ?? null, action, actor, detail ? JSON.stringify(detail) : null);
}

function paginate(req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

router.get("/lookups", (req, res) => {
  const rows = db.prepare(`
    SELECT t.code AS type, v.id, v.code, v.label, v.sort_order, v.is_final
    FROM core_lookup_value v
    JOIN core_lookup_type t ON t.id = v.lookup_type_id
    WHERE t.code IN ('profile_type','user_status','permission_action','device_platform','record_status','gender')
      AND v.is_active = 1
    ORDER BY t.code, v.sort_order
  `).all();
  const grouped = {};
  for (const row of rows) {
    (grouped[row.type] ??= []).push(row);
  }
  res.json(grouped);
});

router.get("/campuses", (req, res) => {
  res.json(db.prepare("SELECT id, code, name FROM core_campus ORDER BY name").all());
});

router.get("/modules", (req, res) => {
  res.json(db.prepare("SELECT id, code, name, sort_order FROM core_module WHERE is_active = 1 ORDER BY sort_order").all());
});

router.get("/me", (req, res) => {
  res.json(req.user);
});

router.get("/users", requirePermission("user", "view"), (req, res) => {
  const { page, pageSize, offset } = paginate(req);
  const q = `%${(req.query.q || "").toString().trim()}%`;
  const status = req.query.status || null;
  const profile = req.query.profile || null;
  const where = `
    WHERE (? = '%%' OR lower(c.email) LIKE lower(?) OR lower(p.first_name || ' ' || COALESCE(p.last_name,'')) LIKE lower(?))
      AND (? IS NULL OR us.code = ?)
      AND (? IS NULL OR pt.code = ?)
  `;
  const params = [q, q, q, status, status, profile, profile];
  const total = db.prepare(`
    SELECT COUNT(*) AS n
    FROM iam_app_user u
    JOIN iam_credential c ON c.user_id = u.id
    JOIN core_person p ON p.id = u.person_id
    JOIN core_lookup_value us ON us.id = u.status_id
    JOIN core_lookup_value pt ON pt.id = u.profile_type_id
    ${where}
  `).get(...params).n;
  const items = db.prepare(`
    SELECT
      u.id, u.auth_user_id, c.email, u.last_login_at, u.created_at,
      p.first_name, p.last_name,
      pt.code AS profile_type, pt.label AS profile_label,
      us.code AS status, us.label AS status_label,
      (
        SELECT GROUP_CONCAT(r.name, ', ')
        FROM iam_user_role ur JOIN iam_role r ON r.id = ur.role_id
        WHERE ur.user_id = u.id
      ) AS roles
    FROM iam_app_user u
    JOIN iam_credential c ON c.user_id = u.id
    JOIN core_person p ON p.id = u.person_id
    JOIN core_lookup_value us ON us.id = u.status_id
    JOIN core_lookup_value pt ON pt.id = u.profile_type_id
    ${where}
    ORDER BY u.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);
  res.json({ items, total, page, pageSize });
});

router.get("/users/:id", requirePermission("user", "view"), (req, res) => {
  const user = db.prepare(`
    SELECT
      u.id, u.auth_user_id, u.person_id, c.email, u.last_login_at, u.created_at, u.updated_at,
      p.first_name, p.last_name, p.gender_id,
      pt.id AS profile_type_id, pt.code AS profile_type, pt.label AS profile_label,
      us.id AS status_id, us.code AS status, us.label AS status_label
    FROM iam_app_user u
    JOIN iam_credential c ON c.user_id = u.id
    JOIN core_person p ON p.id = u.person_id
    JOIN core_lookup_value us ON us.id = u.status_id
    JOIN core_lookup_value pt ON pt.id = u.profile_type_id
    WHERE u.id = ?
  `).get(Number(req.params.id));
  if (!user) return res.status(404).json({ error: "Not found" });
  const roles = db.prepare(`
    SELECT ur.id, ur.role_id, r.code, r.name, ur.campus_id, campus.name AS campus_name, ur.valid_from, ur.valid_to
    FROM iam_user_role ur
    JOIN iam_role r ON r.id = ur.role_id
    LEFT JOIN core_campus campus ON campus.id = ur.campus_id
    WHERE ur.user_id = ?
    ORDER BY r.name
  `).all(user.id);
  const devices = db.prepare(`
    SELECT d.id, d.push_token, d.last_seen_at, d.created_at, pl.code AS platform, pl.label AS platform_label
    FROM iam_user_device d
    JOIN core_lookup_value pl ON pl.id = d.platform_id
    WHERE d.user_id = ?
    ORDER BY d.created_at DESC
  `).all(user.id);
  res.json({ ...user, roles, devices });
});

router.post("/users", requirePermission("user", "create"), (req, res) => {
  const { email, password, first_name, last_name, profile_type, gender, campus_id, role_id } = req.body || {};
  if (!email || !password || !first_name) {
    return res.status(400).json({ error: "email, password and first_name are required" });
  }
  const existing = db.prepare("SELECT user_id FROM iam_credential WHERE lower(email) = lower(?)").get(email);
  if (existing) return res.status(409).json({ error: "Email already in use" });
  const profileId = lv("profile_type", profile_type || "staff");
  const genderId = gender ? lv("gender", gender) : null;
  const statusId = lv("user_status", "active");
  const personStatus = lv("record_status", "active");
  const id = transaction(() => {
    const personId = insert(
      db.prepare("INSERT INTO core_person (first_name, last_name, gender_id, status_id) VALUES (?, ?, ?, ?)"),
      first_name,
      last_name || null,
      genderId,
      personStatus
    );
    const userId = insert(
      db.prepare(`
        INSERT INTO iam_app_user (auth_user_id, person_id, profile_type_id, status_id, created_by)
        VALUES (?, ?, ?, ?, ?)
      `),
      randomUUID(),
      personId,
      profileId,
      statusId,
      req.user.id
    );
    db.prepare("INSERT INTO iam_credential (user_id, email, password_hash) VALUES (?, ?, ?)").run(
      userId,
      email.toLowerCase(),
      hashPassword(password)
    );
    if (role_id) {
      db.prepare(
        "INSERT INTO iam_user_role (user_id, role_id, campus_id, created_by) VALUES (?, ?, ?, ?)"
      ).run(userId, Number(role_id), campus_id ? Number(campus_id) : null, req.user.id);
    }
    audit("iam.app_user", userId, "insert", req.user.id, { email });
    return userId;
  });
  res.status(201).json({ id });
});

router.patch("/users/:id", requirePermission("user", "update"), (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare("SELECT id, person_id FROM iam_app_user WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ error: "Not found" });
  const { first_name, last_name, status, password } = req.body || {};
  try {
    transaction(() => {
    if (first_name || last_name !== undefined) {
      db.prepare(`
        UPDATE core_person SET
          first_name = COALESCE(?, first_name),
          last_name = COALESCE(?, last_name),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(first_name ?? null, last_name ?? null, user.person_id);
    }
    if (status) {
      const statusId = lv("user_status", status);
      if (!statusId) throw new Error("Invalid status");
      db.prepare("UPDATE iam_app_user SET status_id = ?, updated_at = datetime('now'), updated_by = ? WHERE id = ?")
        .run(statusId, req.user.id, id);
    }
    if (password) {
      db.prepare("UPDATE iam_credential SET password_hash = ? WHERE user_id = ?").run(hashPassword(password), id);
    }
    audit("iam.app_user", id, "update", req.user.id, { status, password: Boolean(password) });
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  res.json({ ok: true });
});

router.get("/roles", requirePermission("role", "view"), (req, res) => {
  const items = db.prepare(`
    SELECT
      r.id, r.code, r.name, r.description, r.is_system, r.created_at,
      s.code AS status, s.label AS status_label,
      (SELECT COUNT(*) FROM iam_user_role ur WHERE ur.role_id = r.id) AS user_count,
      (SELECT COUNT(*) FROM iam_role_permission rp WHERE rp.role_id = r.id) AS permission_count
    FROM iam_role r
    JOIN core_lookup_value s ON s.id = r.status_id
    ORDER BY r.is_system DESC, r.name
  `).all();
  res.json({ items });
});

router.post("/roles", requirePermission("role", "create"), (req, res) => {
  const { code, name, description } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: "code and name are required" });
  if (!/^[a-z][a-z0-9_]*$/.test(code)) {
    return res.status(400).json({ error: "code must be snake_case" });
  }
  try {
    const id = insert(
      db.prepare(
        "INSERT INTO iam_role (code, name, description, is_system, status_id, created_by) VALUES (?, ?, ?, 0, ?, ?)"
      ),
      code,
      name,
      description || null,
      lv("record_status", "active"),
      req.user.id
    );
    audit("iam.role", id, "insert", req.user.id, { code });
    res.status(201).json({ id });
  } catch {
    res.status(409).json({ error: "Role code already exists" });
  }
});

router.patch("/roles/:id", requirePermission("role", "update"), (req, res) => {
  const id = Number(req.params.id);
  const role = db.prepare("SELECT * FROM iam_role WHERE id = ?").get(id);
  if (!role) return res.status(404).json({ error: "Not found" });
  const { name, description, status } = req.body || {};
  const statusId = status ? lv("record_status", status) : role.status_id;
  db.prepare(`
    UPDATE iam_role SET name = COALESCE(?, name), description = COALESCE(?, description),
      status_id = ?, updated_at = datetime('now'), updated_by = ?
    WHERE id = ?
  `).run(name ?? null, description ?? null, statusId, req.user.id, id);
  audit("iam.role", id, "update", req.user.id, { name, status });
  res.json({ ok: true });
});

router.delete("/roles/:id", requirePermission("role", "delete"), (req, res) => {
  const id = Number(req.params.id);
  const role = db.prepare("SELECT is_system FROM iam_role WHERE id = ?").get(id);
  if (!role) return res.status(404).json({ error: "Not found" });
  if (role.is_system) return res.status(400).json({ error: "System roles cannot be deleted" });
  db.prepare("DELETE FROM iam_role WHERE id = ?").run(id);
  audit("iam.role", id, "delete", req.user.id);
  res.json({ ok: true });
});

router.get("/roles/:id/permissions", requirePermission("role", "view"), (req, res) => {
  const id = Number(req.params.id);
  const role = db.prepare("SELECT id, code, name, is_system FROM iam_role WHERE id = ?").get(id);
  if (!role) return res.status(404).json({ error: "Not found" });
  const catalog = db.prepare(`
    SELECT p.id, m.code AS module, m.name AS module_name, p.resource, a.code AS action, a.label AS action_label
    FROM iam_permission p
    JOIN core_module m ON m.id = p.module_id
    JOIN core_lookup_value a ON a.id = p.action_id
    ORDER BY m.sort_order, p.resource, a.sort_order
  `).all();
  const granted = db.prepare(
    "SELECT permission_id, condition FROM iam_role_permission WHERE role_id = ?"
  ).all(id);
  res.json({ role, catalog, granted });
});

router.put("/roles/:id/permissions", requirePermission("permission", "approve"), (req, res) => {
  const id = Number(req.params.id);
  const role = db.prepare("SELECT id FROM iam_role WHERE id = ?").get(id);
  if (!role) return res.status(404).json({ error: "Not found" });
  const ids = Array.isArray(req.body?.permission_ids) ? req.body.permission_ids.map(Number) : [];
  transaction(() => {
    db.prepare("DELETE FROM iam_role_permission WHERE role_id = ?").run(id);
    const ins = db.prepare(
      "INSERT INTO iam_role_permission (role_id, permission_id, created_by) VALUES (?, ?, ?)"
    );
    for (const pid of ids) ins.run(id, pid, req.user.id);
    audit("iam.role_permission", id, "update", req.user.id, { count: ids.length });
  });
  res.json({ ok: true, count: ids.length });
});

router.get("/permissions", requirePermission("permission", "view"), (req, res) => {
  const items = db.prepare(`
    SELECT p.id, m.code AS module, m.name AS module_name, p.resource, a.code AS action, a.label AS action_label
    FROM iam_permission p
    JOIN core_module m ON m.id = p.module_id
    JOIN core_lookup_value a ON a.id = p.action_id
    ORDER BY m.sort_order, p.resource, a.sort_order
  `).all();
  res.json({ items });
});

router.post("/users/:id/roles", requirePermission("user_role", "update"), (req, res) => {
  const userId = Number(req.params.id);
  const { role_id, campus_id, valid_from, valid_to } = req.body || {};
  if (!role_id) return res.status(400).json({ error: "role_id is required" });
  try {
    const id = insert(
      db.prepare(`
        INSERT INTO iam_user_role (user_id, role_id, campus_id, valid_from, valid_to, created_by)
        VALUES (?, ?, ?, COALESCE(?, date('now')), ?, ?)
      `),
      userId,
      Number(role_id),
      campus_id ? Number(campus_id) : null,
      valid_from || null,
      valid_to || null,
      req.user.id
    );
    audit("iam.user_role", id, "insert", req.user.id, { userId, role_id, campus_id });
    res.status(201).json({ id });
  } catch {
    res.status(409).json({ error: "Role already assigned for this campus" });
  }
});

router.delete("/users/:userId/roles/:id", requirePermission("user_role", "update"), (req, res) => {
  const id = Number(req.params.id);
  db.prepare("DELETE FROM iam_user_role WHERE id = ? AND user_id = ?").run(id, Number(req.params.userId));
  audit("iam.user_role", id, "delete", req.user.id);
  res.json({ ok: true });
});

router.get("/devices", requirePermission("user_device", "view"), (req, res) => {
  const { page, pageSize, offset } = paginate(req);
  const total = db.prepare("SELECT COUNT(*) AS n FROM iam_user_device").get().n;
  const items = db.prepare(`
    SELECT
      d.id, d.push_token, d.last_seen_at, d.created_at,
      pl.code AS platform, pl.label AS platform_label,
      u.id AS user_id, c.email, p.first_name, p.last_name
    FROM iam_user_device d
    JOIN core_lookup_value pl ON pl.id = d.platform_id
    JOIN iam_app_user u ON u.id = d.user_id
    JOIN iam_credential c ON c.user_id = u.id
    JOIN core_person p ON p.id = u.person_id
    ORDER BY d.created_at DESC
    LIMIT ? OFFSET ?
  `).all(pageSize, offset);
  res.json({ items, total, page, pageSize });
});

router.post("/users/:id/devices", requirePermission("user_device", "update"), (req, res) => {
  const { platform, push_token } = req.body || {};
  if (!platform || !push_token) return res.status(400).json({ error: "platform and push_token are required" });
  const platformId = lv("device_platform", platform);
  if (!platformId) return res.status(400).json({ error: "Invalid platform" });
  try {
    const id = insert(
      db.prepare(
        "INSERT INTO iam_user_device (user_id, platform_id, push_token, last_seen_at) VALUES (?, ?, ?, datetime('now'))"
      ),
      Number(req.params.id),
      platformId,
      push_token
    );
    res.status(201).json({ id });
  } catch {
    res.status(409).json({ error: "Token already registered" });
  }
});

router.delete("/devices/:id", requirePermission("user_device", "update"), (req, res) => {
  db.prepare("DELETE FROM iam_user_device WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

export default router;

import { randomUUID } from "node:crypto";
import { Router } from "express";
import { lv, many, one, query, transaction } from "../db.js";
import { hashPassword, requirePermission } from "../auth.js";

const router = Router();

async function audit(table, rowId, action, actor, detail) {
  await query(
    `INSERT INTO shared.audit_log (table_name, record_id, action, actor_user_id, new_data)
     VALUES ($1, $2, $3, $4, $5)`,
    [table, rowId == null ? null : String(rowId), action, actor, detail ? JSON.stringify(detail) : null]
  );
}

function paginate(req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

router.get("/lookups", async (_req, res, next) => {
  try {
    const rows = await many(
      `SELECT t.code AS type, v.id, v.code, v.label, v.sort_order, v.is_final
       FROM core.lookup_value v
       JOIN core.lookup_type t ON t.id = v.lookup_type_id
       WHERE t.code IN ('profile_type','user_status','permission_action','device_platform','record_status','gender')
         AND v.is_active = true
       ORDER BY t.code, v.sort_order`
    );
    const grouped = {};
    for (const row of rows) (grouped[row.type] ??= []).push(row);
    res.json(grouped);
  } catch (err) {
    next(err);
  }
});

router.get("/campuses", async (_req, res, next) => {
  try {
    res.json(await many("SELECT id, code, name FROM core.campus ORDER BY name"));
  } catch (err) {
    next(err);
  }
});

router.get("/modules", async (_req, res, next) => {
  try {
    res.json(await many("SELECT id, code, name, sort_order FROM core.module WHERE is_active = true ORDER BY sort_order"));
  } catch (err) {
    next(err);
  }
});

router.get("/me", (req, res) => {
  res.json(req.user);
});

router.get("/users", requirePermission("user", "view"), async (req, res, next) => {
  try {
    const { page, pageSize, offset } = paginate(req);
    const q = `%${(req.query.q || "").toString().trim()}%`;
    const status = req.query.status || null;
    const profile = req.query.profile || null;
    const where = `
      WHERE ($1 = '%%' OR lower(c.email) LIKE lower($1) OR lower(p.first_name || ' ' || COALESCE(p.last_name,'')) LIKE lower($1))
        AND ($2::text IS NULL OR us.code = $2)
        AND ($3::text IS NULL OR pt.code = $3)
    `;
    const total = (await one(
      `SELECT COUNT(*)::int AS n
       FROM iam.app_user u
       JOIN iam.credential c ON c.user_id = u.id
       JOIN core.person p ON p.id = u.person_id
       JOIN core.lookup_value us ON us.id = u.status_id
       JOIN core.lookup_value pt ON pt.id = u.profile_type_id
       ${where}`,
      [q, status, profile]
    )).n;
    const items = await many(
      `SELECT
         u.id, u.auth_user_id, c.email, u.last_login_at, u.created_at,
         p.first_name, p.last_name,
         pt.code AS profile_type, pt.label AS profile_label,
         us.code AS status, us.label AS status_label,
         (
           SELECT string_agg(r.name, ', ')
           FROM iam.user_role ur JOIN iam.role r ON r.id = ur.role_id
           WHERE ur.user_id = u.id
         ) AS roles
       FROM iam.app_user u
       JOIN iam.credential c ON c.user_id = u.id
       JOIN core.person p ON p.id = u.person_id
       JOIN core.lookup_value us ON us.id = u.status_id
       JOIN core.lookup_value pt ON pt.id = u.profile_type_id
       ${where}
       ORDER BY u.id DESC
       LIMIT $4 OFFSET $5`,
      [q, status, profile, pageSize, offset]
    );
    res.json({ items, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

router.get("/users/:id", requirePermission("user", "view"), async (req, res, next) => {
  try {
    const user = await one(
      `SELECT
         u.id, u.auth_user_id, u.person_id, c.email, u.last_login_at, u.created_at, u.updated_at,
         p.first_name, p.last_name, p.gender_id,
         pt.id AS profile_type_id, pt.code AS profile_type, pt.label AS profile_label,
         us.id AS status_id, us.code AS status, us.label AS status_label
       FROM iam.app_user u
       JOIN iam.credential c ON c.user_id = u.id
       JOIN core.person p ON p.id = u.person_id
       JOIN core.lookup_value us ON us.id = u.status_id
       JOIN core.lookup_value pt ON pt.id = u.profile_type_id
       WHERE u.id = $1`,
      [Number(req.params.id)]
    );
    if (!user) return res.status(404).json({ error: "Not found" });
    const roles = await many(
      `SELECT ur.id, ur.role_id, r.code, r.name, ur.campus_id, campus.name AS campus_name, ur.valid_from, ur.valid_to
       FROM iam.user_role ur
       JOIN iam.role r ON r.id = ur.role_id
       LEFT JOIN core.campus campus ON campus.id = ur.campus_id
       WHERE ur.user_id = $1
       ORDER BY r.name`,
      [user.id]
    );
    const devices = await many(
      `SELECT d.id, d.push_token, d.last_seen_at, d.created_at, pl.code AS platform, pl.label AS platform_label
       FROM iam.user_device d
       JOIN core.lookup_value pl ON pl.id = d.platform_id
       WHERE d.user_id = $1
       ORDER BY d.created_at DESC`,
      [user.id]
    );
    res.json({ ...user, roles, devices });
  } catch (err) {
    next(err);
  }
});

router.post("/users", requirePermission("user", "create"), async (req, res, next) => {
  try {
    const { email, password, first_name, last_name, profile_type, gender, campus_id, role_id } = req.body || {};
    if (!email || !password || !first_name) {
      return res.status(400).json({ error: "email, password and first_name are required" });
    }
    const existing = await one("SELECT user_id FROM iam.credential WHERE lower(email) = lower($1)", [email]);
    if (existing) return res.status(409).json({ error: "Email already in use" });
    const profileId = await lv("profile_type", profile_type || "staff");
    const genderId = gender ? await lv("gender", gender) : null;
    const statusId = await lv("user_status", "active");
    const personStatus = await lv("record_status", "active");
    const id = await transaction(async (client) => {
      const person = await client.query(
        "INSERT INTO core.person (first_name, last_name, gender_id, status_id) VALUES ($1, $2, $3, $4) RETURNING id",
        [first_name, last_name || null, genderId, personStatus]
      );
      const user = await client.query(
        `INSERT INTO iam.app_user (auth_user_id, person_id, profile_type_id, status_id, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [randomUUID(), person.rows[0].id, profileId, statusId, req.user.id]
      );
      await client.query("INSERT INTO iam.credential (user_id, email, password_hash) VALUES ($1, $2, $3)", [
        user.rows[0].id,
        email.toLowerCase(),
        hashPassword(password),
      ]);
      if (role_id) {
        await client.query(
          "INSERT INTO iam.user_role (user_id, role_id, campus_id, created_by) VALUES ($1, $2, $3, $4)",
          [user.rows[0].id, Number(role_id), campus_id ? Number(campus_id) : null, req.user.id]
        );
      }
      return user.rows[0].id;
    });
    await audit("iam.app_user", id, "INSERT", req.user.id, { email });
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

router.patch("/users/:id", requirePermission("user", "update"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const user = await one("SELECT id, person_id FROM iam.app_user WHERE id = $1", [id]);
    if (!user) return res.status(404).json({ error: "Not found" });
    const { first_name, last_name, status, password } = req.body || {};
    await transaction(async (client) => {
      if (first_name || last_name !== undefined) {
        await client.query(
          `UPDATE core.person SET
             first_name = COALESCE($1, first_name),
             last_name = COALESCE($2, last_name)
           WHERE id = $3`,
          [first_name ?? null, last_name ?? null, user.person_id]
        );
      }
      if (status) {
        const statusId = await lv("user_status", status);
        if (!statusId) throw new Error("Invalid status");
        await client.query(
          "UPDATE iam.app_user SET status_id = $1, updated_by = $2 WHERE id = $3",
          [statusId, req.user.id, id]
        );
      }
      if (password) {
        await client.query("UPDATE iam.credential SET password_hash = $1 WHERE user_id = $2", [
          hashPassword(password),
          id,
        ]);
      }
    });
    await audit("iam.app_user", id, "UPDATE", req.user.id, { status, password: Boolean(password) });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/roles", requirePermission("role", "view"), async (_req, res, next) => {
  try {
    const items = await many(
      `SELECT
         r.id, r.code, r.name, r.description, r.is_system, r.created_at,
         s.code AS status, s.label AS status_label,
         (SELECT COUNT(*)::int FROM iam.user_role ur WHERE ur.role_id = r.id) AS user_count,
         (SELECT COUNT(*)::int FROM iam.role_permission rp WHERE rp.role_id = r.id) AS permission_count
       FROM iam.role r
       JOIN core.lookup_value s ON s.id = r.status_id
       ORDER BY r.is_system DESC, r.name`
    );
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

router.post("/roles", requirePermission("role", "create"), async (req, res, next) => {
  try {
    const { code, name, description } = req.body || {};
    if (!code || !name) return res.status(400).json({ error: "code and name are required" });
    if (!/^[a-z][a-z0-9_]*$/.test(code)) {
      return res.status(400).json({ error: "code must be snake_case" });
    }
    const statusId = await lv("record_status", "active");
    try {
      const row = await one(
        `INSERT INTO iam.role (code, name, description, is_system, status_id, created_by)
         VALUES ($1, $2, $3, false, $4, $5) RETURNING id`,
        [code, name, description || null, statusId, req.user.id]
      );
      await audit("iam.role", row.id, "INSERT", req.user.id, { code });
      res.status(201).json({ id: row.id });
    } catch {
      res.status(409).json({ error: "Role code already exists" });
    }
  } catch (err) {
    next(err);
  }
});

router.patch("/roles/:id", requirePermission("role", "update"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const role = await one("SELECT * FROM iam.role WHERE id = $1", [id]);
    if (!role) return res.status(404).json({ error: "Not found" });
    const { name, description, status } = req.body || {};
    const statusId = status ? await lv("record_status", status) : role.status_id;
    await query(
      `UPDATE iam.role SET name = COALESCE($1, name), description = COALESCE($2, description),
         status_id = $3, updated_by = $4
       WHERE id = $5`,
      [name ?? null, description ?? null, statusId, req.user.id, id]
    );
    await audit("iam.role", id, "UPDATE", req.user.id, { name, status });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/roles/:id", requirePermission("role", "delete"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const role = await one("SELECT is_system FROM iam.role WHERE id = $1", [id]);
    if (!role) return res.status(404).json({ error: "Not found" });
    if (role.is_system) return res.status(400).json({ error: "System roles cannot be deleted" });
    await query("DELETE FROM iam.role WHERE id = $1", [id]);
    await audit("iam.role", id, "DELETE", req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get("/roles/:id/permissions", requirePermission("role", "view"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const role = await one("SELECT id, code, name, is_system FROM iam.role WHERE id = $1", [id]);
    if (!role) return res.status(404).json({ error: "Not found" });
    const catalog = await many(
      `SELECT p.id, m.code AS module, m.name AS module_name, p.resource, a.code AS action, a.label AS action_label
       FROM iam.permission p
       JOIN core.module m ON m.id = p.module_id
       JOIN core.lookup_value a ON a.id = p.action_id
       ORDER BY m.sort_order, p.resource, a.sort_order`
    );
    const granted = await many("SELECT permission_id, condition FROM iam.role_permission WHERE role_id = $1", [id]);
    res.json({ role, catalog, granted });
  } catch (err) {
    next(err);
  }
});

router.put("/roles/:id/permissions", requirePermission("permission", "approve"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const role = await one("SELECT id FROM iam.role WHERE id = $1", [id]);
    if (!role) return res.status(404).json({ error: "Not found" });
    const ids = Array.isArray(req.body?.permission_ids) ? req.body.permission_ids.map(Number) : [];
    await transaction(async (client) => {
      await client.query("DELETE FROM iam.role_permission WHERE role_id = $1", [id]);
      for (const pid of ids) {
        await client.query(
          "INSERT INTO iam.role_permission (role_id, permission_id, created_by) VALUES ($1, $2, $3)",
          [id, pid, req.user.id]
        );
      }
    });
    await audit("iam.role_permission", id, "UPDATE", req.user.id, { count: ids.length });
    res.json({ ok: true, count: ids.length });
  } catch (err) {
    next(err);
  }
});

router.get("/permissions", requirePermission("permission", "view"), async (_req, res, next) => {
  try {
    const items = await many(
      `SELECT p.id, m.code AS module, m.name AS module_name, p.resource, a.code AS action, a.label AS action_label
       FROM iam.permission p
       JOIN core.module m ON m.id = p.module_id
       JOIN core.lookup_value a ON a.id = p.action_id
       ORDER BY m.sort_order, p.resource, a.sort_order`
    );
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

router.post("/users/:id/roles", requirePermission("user_role", "update"), async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const { role_id, campus_id, valid_from, valid_to } = req.body || {};
    if (!role_id) return res.status(400).json({ error: "role_id is required" });
    try {
      const row = await one(
        `INSERT INTO iam.user_role (user_id, role_id, campus_id, valid_from, valid_to, created_by)
         VALUES ($1, $2, $3, COALESCE($4::date, current_date), $5, $6) RETURNING id`,
        [userId, Number(role_id), campus_id ? Number(campus_id) : null, valid_from || null, valid_to || null, req.user.id]
      );
      await audit("iam.user_role", row.id, "INSERT", req.user.id, { userId, role_id, campus_id });
      res.status(201).json({ id: row.id });
    } catch {
      res.status(409).json({ error: "Role already assigned for this campus" });
    }
  } catch (err) {
    next(err);
  }
});

router.delete("/users/:userId/roles/:id", requirePermission("user_role", "update"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await query("DELETE FROM iam.user_role WHERE id = $1 AND user_id = $2", [id, Number(req.params.userId)]);
    await audit("iam.user_role", id, "DELETE", req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get("/devices", requirePermission("user_device", "view"), async (req, res, next) => {
  try {
    const { page, pageSize, offset } = paginate(req);
    const total = (await one("SELECT COUNT(*)::int AS n FROM iam.user_device")).n;
    const items = await many(
      `SELECT
         d.id, d.push_token, d.last_seen_at, d.created_at,
         pl.code AS platform, pl.label AS platform_label,
         u.id AS user_id, c.email, p.first_name, p.last_name
       FROM iam.user_device d
       JOIN core.lookup_value pl ON pl.id = d.platform_id
       JOIN iam.app_user u ON u.id = d.user_id
       JOIN iam.credential c ON c.user_id = u.id
       JOIN core.person p ON p.id = u.person_id
       ORDER BY d.created_at DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );
    res.json({ items, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

router.post("/users/:id/devices", requirePermission("user_device", "update"), async (req, res, next) => {
  try {
    const { platform, push_token } = req.body || {};
    if (!platform || !push_token) return res.status(400).json({ error: "platform and push_token are required" });
    const platformId = await lv("device_platform", platform);
    if (!platformId) return res.status(400).json({ error: "Invalid platform" });
    try {
      const row = await one(
        "INSERT INTO iam.user_device (user_id, platform_id, push_token, last_seen_at) VALUES ($1, $2, $3, now()) RETURNING id",
        [Number(req.params.id), platformId, push_token]
      );
      res.status(201).json({ id: row.id });
    } catch {
      res.status(409).json({ error: "Token already registered" });
    }
  } catch (err) {
    next(err);
  }
});

router.delete("/devices/:id", requirePermission("user_device", "update"), async (req, res, next) => {
  try {
    await query("DELETE FROM iam.user_device WHERE id = $1", [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

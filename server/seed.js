import { createHash, randomUUID, scryptSync } from "node:crypto";
import { lv, one, query } from "./db.js";

function hashPassword(password, salt = randomUUID()) {
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export async function seed() {
  const existing = await one("SELECT id FROM iam.credential WHERE email = $1", ["admin@school.local"]);
  if (existing) return;

  const active = await lv("record_status", "active");
  const userActive = await lv("user_status", "active");
  const staffType = await lv("profile_type", "staff");
  const male = await lv("gender", "male");
  const female = await lv("gender", "female");
  if (!active || !userActive || !staffType) {
    throw new Error("Foundation lookups missing. Run 01_foundation_schema.sql first.");
  }

  await query(
    `INSERT INTO core.campus (code, name, short_name, address, status_id)
     VALUES ('MAIN', 'Main Campus', 'Main', 'Dhaka', $1)
     ON CONFLICT (code) DO NOTHING`,
    [active]
  );
  await query(
    `INSERT INTO core.campus (code, name, short_name, address, status_id)
     VALUES ('NORTH', 'North Campus', 'North', 'Uttara', $1)
     ON CONFLICT (code) DO NOTHING`,
    [active]
  );

  const iamModule = await one("SELECT id FROM core.module WHERE code = 'identity_access'");
  const resources = ["user", "role", "permission", "user_role", "user_device"];
  const actions = ["view", "create", "update", "delete", "approve", "export", "print"];
  for (const resource of resources) {
    for (const action of actions) {
      const actionId = await lv("permission_action", action);
      await query(
        `INSERT INTO iam.permission (module_id, resource, action_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (module_id, resource, action_id) DO NOTHING`,
        [iamModule.id, resource, actionId]
      );
    }
  }

  const extraRoles = [
    ["principal", "Principal", "Campus principal", false],
    ["teacher", "Teacher", "Teaching staff", false],
    ["accountant", "Accountant", "Fees and accounts", false],
    ["front_office", "Front Office", "Enquiries and visitors", false],
  ];
  for (const [code, name, description, isSystem] of extraRoles) {
    await query(
      `INSERT INTO iam.role (code, name, description, is_system, status_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO NOTHING`,
      [code, name, description, isSystem, active]
    );
  }

  const teacherRole = await one("SELECT id FROM iam.role WHERE code = 'teacher'");
  const teacherPerms = await query(
    `SELECT p.id FROM iam.permission p
     JOIN core.lookup_value a ON a.id = p.action_id
     WHERE p.resource IN ('user', 'user_device') AND a.code = 'view'`
  );
  for (const p of teacherPerms.rows) {
    await query(
      `INSERT INTO iam.role_permission (role_id, permission_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [teacherRole.id, p.id]
    );
  }

  const adminPerson = await one(
    `INSERT INTO core.person (first_name, last_name, gender_id, status_id)
     VALUES ('Amina', 'Rahman', $1, $2) RETURNING id`,
    [female, active]
  );
  const staffPerson = await one(
    `INSERT INTO core.person (first_name, last_name, gender_id, status_id)
     VALUES ('Karim', 'Hossain', $1, $2) RETURNING id`,
    [male, active]
  );

  const adminUser = await one(
    `INSERT INTO iam.app_user (auth_user_id, person_id, profile_type_id, status_id, last_login_at)
     VALUES ($1, $2, $3, $4, now()) RETURNING id`,
    [randomUUID(), adminPerson.id, staffType, userActive]
  );
  const staffUser = await one(
    `INSERT INTO iam.app_user (auth_user_id, person_id, profile_type_id, status_id, last_login_at)
     VALUES ($1, $2, $3, $4, now()) RETURNING id`,
    [randomUUID(), staffPerson.id, staffType, userActive]
  );

  await query("INSERT INTO iam.credential (user_id, email, password_hash) VALUES ($1, $2, $3)", [
    adminUser.id,
    "admin@school.local",
    hashPassword("Admin@123"),
  ]);
  await query("INSERT INTO iam.credential (user_id, email, password_hash) VALUES ($1, $2, $3)", [
    staffUser.id,
    "staff@school.local",
    hashPassword("Staff@123"),
  ]);

  const superAdmin = await one("SELECT id FROM iam.role WHERE code = 'super_admin'");
  const mainCampus = await one("SELECT id FROM core.campus WHERE code = 'MAIN'");
  await query(
    "INSERT INTO iam.user_role (user_id, role_id, campus_id, valid_from) VALUES ($1, $2, NULL, current_date)",
    [adminUser.id, superAdmin.id]
  );
  await query(
    "INSERT INTO iam.user_role (user_id, role_id, campus_id, valid_from) VALUES ($1, $2, $3, current_date)",
    [staffUser.id, teacherRole.id, mainCampus.id]
  );

  const web = await lv("device_platform", "web");
  await query(
    "INSERT INTO iam.user_device (user_id, platform_id, push_token, last_seen_at) VALUES ($1, $2, $3, now())",
    [adminUser.id, web, createHash("sha256").update("admin-web").digest("hex")]
  );
}

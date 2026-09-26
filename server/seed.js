import { createHash, randomUUID, scryptSync } from "node:crypto";

function hashPassword(password, salt = randomUUID()) {
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function lv(db, type, code) {
  const row = db.prepare(`
    SELECT v.id FROM core_lookup_value v
    JOIN core_lookup_type t ON t.id = v.lookup_type_id
    WHERE t.code = ? AND v.code = ?
  `).get(type, code);
  if (!row) throw new Error(`Missing lookup ${type}.${code}`);
  return row.id;
}

export function seed(db) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM core_lookup_type").get().n;
  if (count > 0) return;

  const types = [
    ["record_status", "Record status", 1, 1],
    ["user_status", "User account status", 1, 1],
    ["profile_type", "Profile type", 0, 1],
    ["permission_action", "Permission action", 0, 1],
    ["device_platform", "Device platform", 0, 1],
    ["gender", "Gender", 0, 1],
  ];
  const insertType = db.prepare(
    "INSERT INTO core_lookup_type (code, name, is_status, is_system) VALUES (?, ?, ?, ?)"
  );
  for (const t of types) insertType.run(...t);

  const values = [
    ["record_status", "active", "Active", 1, 0],
    ["record_status", "inactive", "Inactive", 2, 0],
    ["record_status", "archived", "Archived", 3, 1],
    ["user_status", "pending", "Pending activation", 1, 0],
    ["user_status", "active", "Active", 2, 0],
    ["user_status", "suspended", "Suspended", 3, 0],
    ["user_status", "disabled", "Disabled", 4, 1],
    ["profile_type", "staff", "Staff", 1, 0],
    ["profile_type", "student", "Student", 2, 0],
    ["profile_type", "parent", "Parent", 3, 0],
    ["permission_action", "view", "View", 1, 0],
    ["permission_action", "create", "Create", 2, 0],
    ["permission_action", "update", "Update", 3, 0],
    ["permission_action", "delete", "Delete", 4, 0],
    ["permission_action", "approve", "Approve", 5, 0],
    ["permission_action", "export", "Export", 6, 0],
    ["permission_action", "print", "Print", 7, 0],
    ["device_platform", "android", "Android", 1, 0],
    ["device_platform", "ios", "iOS", 2, 0],
    ["device_platform", "web", "Web", 3, 0],
    ["gender", "male", "Male", 1, 0],
    ["gender", "female", "Female", 2, 0],
  ];
  const insertValue = db.prepare(`
    INSERT INTO core_lookup_value (lookup_type_id, code, label, sort_order, is_final, is_system)
    SELECT id, ?, ?, ?, ?, 1 FROM core_lookup_type WHERE code = ?
  `);
  for (const [type, code, label, ord, isFinal] of values) {
    insertValue.run(code, label, ord, isFinal, type);
  }

  const modules = [
    ["platform_setup", "Platform Setup", 1],
    ["identity_access", "Identity & Access", 2],
    ["shared_services", "Shared Services", 3],
    ["front_office", "Front Office", 4],
    ["admission", "Admission", 5],
    ["student", "Student Management", 6],
    ["academic", "Academic", 7],
    ["academic_calendar", "Academic Calendar & Events", 8],
    ["attendance", "Attendance", 9],
    ["attendance_device", "Attendance Devices", 10],
    ["examination", "Examination & Result", 11],
    ["hifz", "Hifz", 12],
    ["fees", "Fees", 13],
    ["payments", "Payments", 14],
    ["accounts", "Accounts", 15],
    ["inventory", "Inventory & Procurement", 16],
    ["library", "Library", 17],
    ["hr", "HR Core", 18],
    ["roster", "Roster & Duty", 19],
    ["leave", "Leave Management", 20],
    ["payroll", "Payroll & Salary Generator", 21],
    ["transport", "Transport", 22],
    ["communication", "Communication", 23],
    ["student_portal", "Student Portal", 24],
    ["parent_portal", "Parent Portal", 25],
    ["reports", "Reports & Dashboards", 26],
  ];
  const insertModule = db.prepare(
    "INSERT INTO core_module (code, name, sort_order) VALUES (?, ?, ?)"
  );
  for (const m of modules) insertModule.run(...m);

  const active = lv(db, "record_status", "active");
  const userActive = lv(db, "user_status", "active");
  const staffType = lv(db, "profile_type", "staff");
  const male = lv(db, "gender", "male");
  const female = lv(db, "gender", "female");

  db.prepare(
    "INSERT INTO core_campus (code, name, short_name, address, status_id) VALUES (?, ?, ?, ?, ?)"
  ).run("MAIN", "Main Campus", "Main", "Dhaka", active);
  db.prepare(
    "INSERT INTO core_campus (code, name, short_name, address, status_id) VALUES (?, ?, ?, ?, ?)"
  ).run("NORTH", "North Campus", "North", "Uttara", active);

  const resources = ["user", "role", "permission", "user_role", "user_device"];
  const actions = ["view", "create", "update", "delete", "approve", "export", "print"];
  const iamModule = db.prepare("SELECT id FROM core_module WHERE code = 'identity_access'").get().id;
  const insertPerm = db.prepare(
    "INSERT INTO iam_permission (module_id, resource, action_id) VALUES (?, ?, ?)"
  );
  for (const resource of resources) {
    for (const action of actions) {
      insertPerm.run(iamModule, resource, lv(db, "permission_action", action));
    }
  }

  const insertRole = db.prepare(
    "INSERT INTO iam_role (code, name, description, is_system, status_id) VALUES (?, ?, ?, ?, ?)"
  );
  insertRole.run("super_admin", "Super Admin", "Full access; manages roles, permissions and rules", 1, active);
  insertRole.run("principal", "Principal", "Campus principal", 0, active);
  insertRole.run("teacher", "Teacher", "Teaching staff", 0, active);
  insertRole.run("accountant", "Accountant", "Fees and accounts", 0, active);
  insertRole.run("front_office", "Front Office", "Enquiries and visitors", 0, active);

  const teacherRole = db.prepare("SELECT id FROM iam_role WHERE code = 'teacher'").get().id;
  const teacherPerms = db.prepare(`
    SELECT p.id FROM iam_permission p
    JOIN core_lookup_value a ON a.id = p.action_id
    WHERE p.resource IN ('user', 'user_device') AND a.code = 'view'
  `).all();
  const grant = db.prepare(
    "INSERT INTO iam_role_permission (role_id, permission_id) VALUES (?, ?)"
  );
  for (const p of teacherPerms) grant.run(teacherRole, p.id);

  const insertPerson = db.prepare(
    "INSERT INTO core_person (first_name, last_name, gender_id, status_id) VALUES (?, ?, ?, ?)"
  );
  const adminPerson = Number(insertPerson.run("Amina", "Rahman", female, active).lastInsertRowid);
  const staffPerson = Number(insertPerson.run("Karim", "Hossain", male, active).lastInsertRowid);

  const insertUser = db.prepare(`
    INSERT INTO iam_app_user (auth_user_id, person_id, profile_type_id, status_id, last_login_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  const adminUser = Number(insertUser.run(randomUUID(), adminPerson, staffType, userActive).lastInsertRowid);
  const staffUser = Number(insertUser.run(randomUUID(), staffPerson, staffType, userActive).lastInsertRowid);

  const insertCred = db.prepare(
    "INSERT INTO iam_credential (user_id, email, password_hash) VALUES (?, ?, ?)"
  );
  insertCred.run(adminUser, "admin@school.local", hashPassword("Admin@123"));
  insertCred.run(staffUser, "staff@school.local", hashPassword("Staff@123"));

  const superAdmin = db.prepare("SELECT id FROM iam_role WHERE code = 'super_admin'").get().id;
  db.prepare(
    "INSERT INTO iam_user_role (user_id, role_id, campus_id, valid_from) VALUES (?, ?, NULL, date('now'))"
  ).run(adminUser, superAdmin);
  db.prepare(
    "INSERT INTO iam_user_role (user_id, role_id, campus_id, valid_from) VALUES (?, ?, 1, date('now'))"
  ).run(staffUser, teacherRole);

  const web = lv(db, "device_platform", "web");
  db.prepare(
    "INSERT INTO iam_user_device (user_id, platform_id, push_token, last_seen_at) VALUES (?, ?, ?, datetime('now'))"
  ).run(adminUser, web, createHash("sha256").update("admin-web").digest("hex"));
}

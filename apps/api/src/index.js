import express from "express";
import cors from "cors";
import { loadDb, list, getById, insert, update, remove, options, lv, convertApplication } from "./store.js";

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

let db = loadDb();

const CRUD = {
  campus: { search: ["code", "name", "short_name"] },
  school_wing: { search: ["code", "name"] },
  academic_session: { search: ["code", "name"] },
  class_level: { search: ["code", "name"] },
  class_offering: { search: [] },
  class_section: { search: ["name"] },
  subject: { search: ["code", "name"] },
  class_offering_subject: { search: [] },
  house: { search: ["code", "name"] },
  department: { search: ["code", "name"] },
  designation: { search: ["code", "name"] },
  geo_unit: { search: ["name"] },
  person: { search: ["first_name", "last_name", "name_alt"] },
  role: { search: ["code", "name"] },
  app_user: { search: [] },
  setting_definition: { search: ["key", "name"] },
  setting_value: { search: [] },
  rule_set: { search: ["code", "name"] },
  rule: { search: ["name"] },
  workflow: { search: ["code", "name"] },
  workflow_step: { search: ["name"] },
  custom_field_def: { search: ["key", "label"] },
  doc_template: { search: ["code", "name"] },
  module: { search: ["code", "name"] },
  id_sequence: { search: ["entity_code", "prefix"] },
  permission: { search: ["resource"] },
  rule_action_type: { search: ["code", "name"] },
  lookup_type: { search: ["code", "name"] },
  lookup_value: { search: ["code", "label"] },
  student: { search: ["student_code"] },
  guardian_link: { search: [] },
  health: { search: [] },
  previous_school: { search: ["name"] },
  enrollment: { search: [] },
  club: { search: ["code", "name"] },
  club_membership: { search: [] },
  incident: { search: ["description"] },
  exit_request: { search: ["tc_number", "reason"] },
  form_batch: { search: [] },
  form_sale: { search: ["serial_no", "buyer_name", "buyer_phone"] },
  application: { search: ["notes"] },
  application_guardian: { search: [] },
  admission_test: { search: ["name", "venue"] },
  test_score: { search: [] },
  waitlist: { search: [] },
  enquiry: { search: ["inquirer_name", "phone", "notes"] },
  visitor: { search: ["name", "badge_no", "visiting"] },
  call_log: { search: ["phone", "caller_name", "subject"] },
  postal: { search: ["ref_no", "from_to", "subject"] },
  complaint: { search: ["subject", "body"] },
  gate_pass: { search: ["reason"] },
  term: { search: ["name"] },
  week: { search: [] },
  holiday: { search: ["name"] },
  working_day: { search: [] },
  event: { search: ["title", "location"] },
  notice: { search: ["title", "body"] },
};

function parsePage(req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const q = String(req.query.q || "").trim();
  const sort = req.query.sort ? String(req.query.sort) : undefined;
  const dir = req.query.dir === "desc" ? "desc" : "asc";
  return { page, pageSize, q, sort, dir };
}

function applyLookupDefault(table, payload) {
  const statusDefaults = {
    campus: ["record_status", "active"],
    school_wing: ["record_status", "active"],
    class_level: ["record_status", "active"],
    class_offering: ["record_status", "active"],
    class_section: ["record_status", "active"],
    subject: ["record_status", "active"],
    class_offering_subject: ["record_status", "active"],
    house: ["record_status", "active"],
    department: ["record_status", "active"],
    designation: ["record_status", "active"],
    person: ["record_status", "active"],
    role: ["record_status", "active"],
    workflow: ["record_status", "active"],
    custom_field_def: ["record_status", "active"],
    doc_template: ["record_status", "active"],
    academic_session: ["session_status", "planned"],
    app_user: ["user_status", "pending"],
    rule: ["rule_status", "draft"],
    student: ["student_status", "active"],
    enrollment: ["enrollment_status", "enrolled"],
    club: ["record_status", "active"],
    incident: ["record_status", "active"],
    exit_request: ["exit_status", "draft"],
    form_batch: ["record_status", "active"],
    form_sale: ["form_sale_status", "sold"],
    application: ["application_status", "draft"],
    admission_test: ["record_status", "active"],
    enquiry: ["enquiry_status", "open"],
    complaint: ["complaint_status", "open"],
    gate_pass: ["pass_status", "active"],
    postal: ["record_status", "active"],
    event: ["record_status", "active"],
    notice: ["record_status", "active"],
  };
  const next = { ...payload };
  if (statusDefaults[table] && (next.status_id == null || next.status_id === "")) {
    next.status_id = lv(db, statusDefaults[table][0], statusDefaults[table][1]);
  }
  if (table === "rule" && next.scope_type_id == null) {
    next.scope_type_id = lv(db, "scope_type", "global");
  }
  if (table === "rule_set" && next.eval_mode_id == null) {
    next.eval_mode_id = lv(db, "rule_eval_mode", "all_matching");
  }
  return next;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "sms-api", phase: "2" });
});

app.get("/api/lookups", (_req, res) => {
  const types = db.tables.lookup_type.map((t) => ({
    ...t,
    values: db.tables.lookup_value
      .filter((v) => v.lookup_type_id === t.id)
      .sort((a, b) => a.sort_order - b.sort_order),
  }));
  res.json({ data: types });
});

app.get("/api/lookups/:typeCode", (req, res) => {
  const type = db.tables.lookup_type.find((t) => t.code === req.params.typeCode);
  if (!type) return res.status(404).json({ error: "Lookup type not found" });
  const values = db.tables.lookup_value
    .filter((v) => v.lookup_type_id === type.id)
    .sort((a, b) => a.sort_order - b.sort_order);
  res.json({ data: { ...type, values } });
});

app.post("/api/lookups/:typeCode/values", (req, res) => {
  const type = db.tables.lookup_type.find((t) => t.code === req.params.typeCode);
  if (!type) return res.status(404).json({ error: "Lookup type not found" });
  const { code, label, label_alt, sort_order, is_final, color, is_default } = req.body ?? {};
  if (!code || !label) return res.status(400).json({ error: "code and label are required" });
  if (!/^[a-z0-9][a-z0-9_]*$/.test(code)) {
    return res.status(400).json({ error: "code must be lowercase alphanumeric with underscores" });
  }
  const exists = db.tables.lookup_value.some(
    (v) => v.lookup_type_id === type.id && v.code === code,
  );
  if (exists) return res.status(409).json({ error: "Value code already exists in this type" });
  const row = insert(db, "lookup_value", {
    lookup_type_id: type.id,
    code,
    label,
    label_alt: label_alt ?? null,
    sort_order: Number(sort_order) || 0,
    is_default: Boolean(is_default),
    is_final: Boolean(is_final),
    color: color ?? null,
    meta: {},
    is_active: true,
    is_system: false,
  });
  res.status(201).json({ data: row });
});

app.patch("/api/lookup-values/:id", (req, res) => {
  const existing = getById(db, "lookup_value", req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const allowed = ["label", "label_alt", "sort_order", "is_final", "color", "is_active", "is_default"];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
  const row = update(db, "lookup_value", req.params.id, patch);
  res.json({ data: row });
});

app.get("/api/dashboard", (_req, res) => {
  res.json({
    data: {
      counts: {
        campuses: db.tables.campus.length,
        sessions: db.tables.academic_session.length,
        class_levels: db.tables.class_level.length,
        offerings: db.tables.class_offering.length,
        subjects: db.tables.subject.length,
        people: db.tables.person.length,
        roles: db.tables.role.length,
        users: db.tables.app_user.length,
        rules: db.tables.rule.length,
        workflows: db.tables.workflow.length,
        lookups: db.tables.lookup_type.length,
        modules: db.tables.module.length,
        students: (db.tables.student ?? []).length,
        enrollments: (db.tables.enrollment ?? []).length,
        applications: (db.tables.application ?? []).length,
        enquiries: (db.tables.enquiry ?? []).length,
        visitors: (db.tables.visitor ?? []).length,
        terms: (db.tables.term ?? []).length,
      },
      current_session: db.tables.academic_session.find((s) => s.is_current) ?? null,
      recent_people: [...db.tables.person].slice(-5).reverse(),
    },
  });
});

app.post("/api/applications/:id/enrol", (req, res) => {
  try {
    const result = convertApplication(db, req.params.id, req.body ?? {});
    res.status(201).json({ data: result });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

app.get("/api/meta/options/:entity", (req, res) => {
  const entity = req.params.entity;
  if (!db.tables[entity]) return res.status(404).json({ error: "Unknown entity" });
  const label = req.query.label ? String(req.query.label) : "name";
  res.json({ data: options(db, entity, label) });
});

app.get("/api/:entity", (req, res) => {
  const entity = req.params.entity;
  if (!CRUD[entity] && !db.tables[entity]) {
    return res.status(404).json({ error: "Unknown entity" });
  }
  if (!db.tables[entity]) return res.status(404).json({ error: "Unknown entity" });
  const p = parsePage(req);
  const search = CRUD[entity]?.search ?? [];
  const result = list(db, entity, { ...p, searchFields: search });
  res.json({ data: result.rows, meta: { total: result.total, page: result.page, pageSize: result.pageSize } });
});

app.get("/api/:entity/:id", (req, res) => {
  const entity = req.params.entity;
  if (!db.tables[entity]) return res.status(404).json({ error: "Unknown entity" });
  const row = getById(db, entity, req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ data: row });
});

app.post("/api/:entity", (req, res) => {
  const entity = req.params.entity;
  if (!db.tables[entity]) return res.status(404).json({ error: "Unknown entity" });
  const payload = applyLookupDefault(entity, req.body ?? {});
  const row = insert(db, entity, payload);
  res.status(201).json({ data: row });
});

app.patch("/api/:entity/:id", (req, res) => {
  const entity = req.params.entity;
  if (!db.tables[entity]) return res.status(404).json({ error: "Unknown entity" });
  const row = update(db, entity, req.params.id, req.body ?? {});
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ data: row });
});

app.delete("/api/:entity/:id", (req, res) => {
  const entity = req.params.entity;
  if (!db.tables[entity]) return res.status(404).json({ error: "Unknown entity" });
  const existing = getById(db, entity, req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.is_system) {
    return res.status(400).json({ error: "System records cannot be deleted" });
  }
  remove(db, entity, req.params.id);
  res.status(204).end();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SMS API listening on ${PORT}`);
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  lookupTypes,
  lookupValues,
  modules,
  ruleActionTypes,
  entityKeys,
} from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

function emptyDb() {
  const tables = {};
  for (const k of entityKeys) tables[k] = [];
  return { seq: {}, tables };
}

function nextId(db, table) {
  db.seq[table] = (db.seq[table] ?? 0) + 1;
  return db.seq[table];
}

function nowIso() {
  return new Date().toISOString();
}

function lv(db, typeCode, valueCode) {
  const type = db.tables.lookup_type.find((t) => t.code === typeCode);
  if (!type) return null;
  const val = db.tables.lookup_value.find(
    (v) => v.lookup_type_id === type.id && v.code === valueCode,
  );
  return val ? val.id : null;
}

function seed(db) {
  const ts = nowIso();

  for (const t of lookupTypes) {
    db.tables.lookup_type.push({
      id: nextId(db, "lookup_type"),
      ...t,
      description: null,
      created_at: ts,
      updated_at: ts,
    });
  }

  for (const [typeCode, code, label, sort_order, is_final] of lookupValues) {
    const type = db.tables.lookup_type.find((t) => t.code === typeCode);
    db.tables.lookup_value.push({
      id: nextId(db, "lookup_value"),
      lookup_type_id: type.id,
      code,
      label,
      label_alt: null,
      sort_order,
      is_default: false,
      is_final,
      color: null,
      meta: {},
      is_active: true,
      is_system: true,
      created_at: ts,
      updated_at: ts,
    });
  }

  const active = lv(db, "record_status", "active");
  const sessionOpen = lv(db, "session_status", "open");
  const userActive = lv(db, "user_status", "active");
  const profileStaff = lv(db, "profile_type", "staff");
  const genderMale = lv(db, "gender", "male");
  const genderFemale = lv(db, "gender", "female");
  const religionIslam = lv(db, "religion", "islam");
  const nationalityBd = lv(db, "nationality", "bangladeshi");
  const deptAcademic = lv(db, "department_type", "academic");
  const deptAdmin = lv(db, "department_type", "administrative");
  const geoCountry = lv(db, "geo_level", "country");
  const geoDivision = lv(db, "geo_level", "division");
  const geoDistrict = lv(db, "geo_level", "district");
  const dataNumber = lv(db, "data_type", "number");
  const dataBoolean = lv(db, "data_type", "boolean");
  const dataText = lv(db, "data_type", "text");
  const scopeGlobal = lv(db, "scope_type", "global");
  const evalAll = lv(db, "rule_eval_mode", "all_matching");
  const ruleDraft = lv(db, "rule_status", "draft");
  const approverRole = lv(db, "approver_type", "role");
  const customStudent = lv(db, "custom_entity_type", "student");
  const tplLetter = lv(db, "template_type", "letter");
  const actionView = lv(db, "permission_action", "view");
  const actionCreate = lv(db, "permission_action", "create");
  const actionUpdate = lv(db, "permission_action", "update");
  const actionDelete = lv(db, "permission_action", "delete");
  const actionApprove = lv(db, "permission_action", "approve");

  for (const [code, name, sort_order] of modules) {
    db.tables.module.push({
      id: nextId(db, "module"),
      code,
      name,
      sort_order,
      is_active: true,
    });
  }

  for (const a of ruleActionTypes) {
    db.tables.rule_action_type.push({
      id: nextId(db, "rule_action_type"),
      ...a,
      module_id: null,
      is_active: true,
    });
  }

  const campusMain = nextId(db, "campus");
  db.tables.campus.push({
    id: campusMain,
    code: "MAIN",
    name: "Main Campus",
    short_name: "Main",
    address: "House 12, Road 5, Dhanmondi, Dhaka",
    phone: "+8801711000001",
    email: "main@school.edu",
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  const campusNorth = nextId(db, "campus");
  db.tables.campus.push({
    id: campusNorth,
    code: "NORTH",
    name: "North Campus",
    short_name: "North",
    address: "Uttara Sector 7, Dhaka",
    phone: "+8801711000002",
    email: "north@school.edu",
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });

  const wings = [
    ["ey", "Early Years", 1],
    ["pri", "Primary", 2],
    ["sec", "Secondary", 3],
    ["hs", "Higher Secondary", 4],
  ];
  const wingIds = {};
  for (const [code, name, sort_order] of wings) {
    const id = nextId(db, "school_wing");
    wingIds[code] = id;
    db.tables.school_wing.push({
      id,
      code,
      name,
      sort_order,
      status_id: active,
      created_at: ts,
      updated_at: ts,
      created_by: null,
      updated_by: null,
    });
  }

  const sessionId = nextId(db, "academic_session");
  db.tables.academic_session.push({
    id: sessionId,
    code: "2026-2027",
    name: "Academic Year 2026–2027",
    starts_on: "2026-07-01",
    ends_on: "2027-06-30",
    status_id: sessionOpen,
    is_current: true,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });

  const levels = [
    ["NUR", "Nursery", "ey", 1],
    ["KG", "Kindergarten", "ey", 2],
    ["G1", "Grade 1", "pri", 3],
    ["G2", "Grade 2", "pri", 4],
    ["G3", "Grade 3", "pri", 5],
    ["G4", "Grade 4", "pri", 6],
    ["G5", "Grade 5", "pri", 7],
    ["G6", "Grade 6", "sec", 8],
    ["G7", "Grade 7", "sec", 9],
    ["G8", "Grade 8", "sec", 10],
    ["G9", "Grade 9", "sec", 11],
    ["G10", "Grade 10", "sec", 12],
  ];
  const levelIds = {};
  for (const [code, name, wing, sort_order] of levels) {
    const id = nextId(db, "class_level");
    levelIds[code] = id;
    db.tables.class_level.push({
      id,
      code,
      name,
      name_alt: null,
      wing_id: wingIds[wing],
      sort_order,
      status_id: active,
      created_at: ts,
      updated_at: ts,
      created_by: null,
      updated_by: null,
    });
  }

  const offeringIds = {};
  for (const code of ["G1", "G2", "G6"]) {
    const id = nextId(db, "class_offering");
    offeringIds[code] = id;
    db.tables.class_offering.push({
      id,
      session_id: sessionId,
      campus_id: campusMain,
      class_level_id: levelIds[code],
      status_id: active,
      created_at: ts,
      updated_at: ts,
      created_by: null,
      updated_by: null,
    });
  }

  for (const [offCode, name, cap] of [
    ["G1", "A", 30],
    ["G1", "B", 30],
    ["G2", "A", 32],
    ["G6", "Morning", 35],
  ]) {
    db.tables.class_section.push({
      id: nextId(db, "class_section"),
      class_offering_id: offeringIds[offCode],
      name,
      capacity: cap,
      sort_order: 0,
      status_id: active,
      created_at: ts,
      updated_at: ts,
      created_by: null,
      updated_by: null,
    });
  }

  const subjects = [
    ["ENG", "English"],
    ["BNG", "Bangla"],
    ["MATH", "Mathematics"],
    ["SCI", "Science"],
    ["ISL", "Islamic Studies"],
    ["QUR", "Quran"],
    ["SST", "Social Studies"],
    ["PE", "Physical Education"],
  ];
  const subjectIds = {};
  for (const [code, name] of subjects) {
    const id = nextId(db, "subject");
    subjectIds[code] = id;
    db.tables.subject.push({
      id,
      code,
      name,
      name_alt: null,
      status_id: active,
      created_at: ts,
      updated_at: ts,
      created_by: null,
      updated_by: null,
    });
  }

  for (const sub of ["ENG", "BNG", "MATH", "SCI", "ISL"]) {
    db.tables.class_offering_subject.push({
      id: nextId(db, "class_offering_subject"),
      class_offering_id: offeringIds.G1,
      subject_id: subjectIds[sub],
      is_reportable: true,
      sort_order: 0,
      status_id: active,
      created_at: ts,
      updated_at: ts,
      created_by: null,
      updated_by: null,
    });
  }

  for (const [code, name, color] of [
    ["RED", "Red House", "#c0392b"],
    ["GRN", "Green House", "#27ae60"],
    ["BLU", "Blue House", "#2980b9"],
    ["YLW", "Yellow House", "#f1c40f"],
  ]) {
    db.tables.house.push({
      id: nextId(db, "house"),
      code,
      name,
      color,
      campus_id: campusMain,
      status_id: active,
      created_at: ts,
      updated_at: ts,
      created_by: null,
      updated_by: null,
    });
  }

  const deptIds = {};
  for (const [code, name, type] of [
    ["ACA", "Academics", deptAcademic],
    ["ADM", "Administration", deptAdmin],
    ["ACC", "Accounts", deptAdmin],
    ["HR", "Human Resources", deptAdmin],
  ]) {
    const id = nextId(db, "department");
    deptIds[code] = id;
    db.tables.department.push({
      id,
      code,
      name,
      department_type_id: type,
      parent_id: null,
      status_id: active,
      created_at: ts,
      updated_at: ts,
      created_by: null,
      updated_by: null,
    });
  }

  for (const [code, name, rank] of [
    ["PRIN", "Principal", 1],
    ["VP", "Vice Principal", 2],
    ["HOD", "Head of Department", 3],
    ["TCH", "Teacher", 10],
    ["ACC", "Accountant", 11],
    ["CLK", "Clerk", 20],
  ]) {
    db.tables.designation.push({
      id: nextId(db, "designation"),
      code,
      name,
      rank_order: rank,
      status_id: active,
      created_at: ts,
      updated_at: ts,
      created_by: null,
      updated_by: null,
    });
  }

  const bd = nextId(db, "geo_unit");
  db.tables.geo_unit.push({ id: bd, parent_id: null, level_id: geoCountry, name: "Bangladesh" });
  const dhaka = nextId(db, "geo_unit");
  db.tables.geo_unit.push({ id: dhaka, parent_id: bd, level_id: geoDivision, name: "Dhaka" });
  db.tables.geo_unit.push({
    id: nextId(db, "geo_unit"),
    parent_id: dhaka,
    level_id: geoDistrict,
    name: "Dhaka District",
  });

  db.tables.id_sequence.push({
    id: nextId(db, "id_sequence"),
    entity_code: "student",
    session_id: null,
    prefix: "STD-",
    padding: 5,
    next_number: 1,
  });
  db.tables.id_sequence.push({
    id: nextId(db, "id_sequence"),
    entity_code: "employee",
    session_id: null,
    prefix: "EMP-",
    padding: 4,
    next_number: 1,
  });

  const principal = nextId(db, "person");
  db.tables.person.push({
    id: principal,
    first_name: "Ayesha",
    last_name: "Rahman",
    name_alt: "আয়েশা রহমান",
    date_of_birth: "1982-03-14",
    gender_id: genderFemale,
    religion_id: religionIslam,
    nationality_id: nationalityBd,
    blood_group_id: lv(db, "blood_group", "o_pos"),
    photo_file_id: null,
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  const clerk = nextId(db, "person");
  db.tables.person.push({
    id: clerk,
    first_name: "Karim",
    last_name: "Hossain",
    name_alt: null,
    date_of_birth: "1990-11-02",
    gender_id: genderMale,
    religion_id: religionIslam,
    nationality_id: nationalityBd,
    blood_group_id: lv(db, "blood_group", "b_pos"),
    photo_file_id: null,
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });

  const superAdminRole = nextId(db, "role");
  db.tables.role.push({
    id: superAdminRole,
    code: "super_admin",
    name: "Super Admin",
    description: "Full access; manages roles, permissions and rules",
    is_system: true,
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  const teacherRole = nextId(db, "role");
  db.tables.role.push({
    id: teacherRole,
    code: "teacher",
    name: "Teacher",
    description: "Classroom teacher — academics and attendance",
    is_system: false,
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  const accountantRole = nextId(db, "role");
  db.tables.role.push({
    id: accountantRole,
    code: "accountant",
    name: "Accountant",
    description: "Fees, payments and ledger",
    is_system: false,
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });

  const modByCode = Object.fromEntries(db.tables.module.map((m) => [m.code, m.id]));
  const permResources = [
    ["platform_setup", "campus"],
    ["platform_setup", "academic_session"],
    ["identity_access", "role"],
    ["identity_access", "app_user"],
    ["shared_services", "rule"],
    ["student", "student"],
    ["fees", "fee_invoice"],
    ["payroll", "salary_run"],
  ];
  for (const [mod, resource] of permResources) {
    for (const action of [actionView, actionCreate, actionUpdate, actionDelete, actionApprove]) {
      db.tables.permission.push({
        id: nextId(db, "permission"),
        module_id: modByCode[mod],
        resource,
        action_id: action,
      });
    }
  }
  for (const p of db.tables.permission) {
    db.tables.role_permission.push({
      role_id: superAdminRole,
      permission_id: p.id,
      condition: null,
      created_at: ts,
      created_by: null,
    });
  }

  const adminUser = nextId(db, "app_user");
  db.tables.app_user.push({
    id: adminUser,
    auth_user_id: "00000000-0000-0000-0000-000000000001",
    person_id: principal,
    profile_type_id: profileStaff,
    status_id: userActive,
    last_login_at: ts,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.user_role.push({
    id: nextId(db, "user_role"),
    user_id: adminUser,
    role_id: superAdminRole,
    campus_id: null,
    valid_from: "2026-07-01",
    valid_to: null,
    created_at: ts,
    created_by: null,
  });

  const platformMod = modByCode.platform_setup;
  const payrollMod = modByCode.payroll;
  const leaveMod = modByCode.leave;

  const graceDef = nextId(db, "setting_definition");
  db.tables.setting_definition.push({
    id: graceDef,
    module_id: modByCode.attendance,
    key: "grace_minutes",
    name: "Grace minutes",
    description: "Minutes after shift start before a punch is late",
    data_type_id: dataNumber,
    default_value: 10,
    validation: { min: 0, max: 60 },
    is_active: true,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.setting_value.push({
    id: nextId(db, "setting_value"),
    definition_id: graceDef,
    scope_type_id: scopeGlobal,
    scope_id: null,
    value: 10,
    effective_from: "2026-07-01",
    effective_to: null,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.setting_definition.push({
    id: nextId(db, "setting_definition"),
    module_id: platformMod,
    key: "school_name",
    name: "School name",
    description: "Displayed on letters, receipts and the portal",
    data_type_id: dataText,
    default_value: "Rooh International School",
    validation: null,
    is_active: true,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.setting_definition.push({
    id: nextId(db, "setting_definition"),
    module_id: payrollMod,
    key: "ait_enabled",
    name: "AIT tax enabled",
    description: "Apply advance income tax on salary runs",
    data_type_id: dataBoolean,
    default_value: true,
    validation: null,
    is_active: true,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });

  const payrollSet = nextId(db, "rule_set");
  db.tables.rule_set.push({
    id: payrollSet,
    module_id: payrollMod,
    code: "payroll.attendance_deduction",
    name: "Attendance deduction",
    description: "Cut salary based on late / absent counts",
    subject_type: "employee_month",
    eval_mode_id: evalAll,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.rule_fact_definition.push({
    id: nextId(db, "rule_fact_definition"),
    rule_set_id: payrollSet,
    code: "late_count",
    name: "Late count",
    data_type_id: dataNumber,
    description: "Number of late punches in the month",
  });
  db.tables.rule_fact_definition.push({
    id: nextId(db, "rule_fact_definition"),
    rule_set_id: payrollSet,
    code: "absent_days",
    name: "Absent days",
    data_type_id: dataNumber,
    description: "Unauthorised absence days",
  });
  db.tables.rule.push({
    id: nextId(db, "rule"),
    rule_set_id: payrollSet,
    rule_key: "11111111-1111-1111-1111-111111111111",
    version: 1,
    name: "Three lates = half day",
    priority: 10,
    scope_type_id: scopeGlobal,
    scope_id: null,
    condition: { ">=": [{ var: "late_count" }, 3] },
    actions: [{ type: "deduct_days", params: { days: 0.5, every: 3 } }],
    status_id: ruleDraft,
    effective_from: "2026-07-01",
    effective_to: null,
    published_by: null,
    published_at: null,
    notes: "Starter rule — publish after simulation",
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });

  const leaveWf = nextId(db, "workflow");
  db.tables.workflow.push({
    id: leaveWf,
    module_id: leaveMod,
    code: "leave.application",
    name: "Leave application",
    entity_type: "leave_application",
    description: "Teacher leave → HOD → Principal",
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.workflow_step.push({
    id: nextId(db, "workflow_step"),
    workflow_id: leaveWf,
    step_no: 1,
    name: "Head of department",
    approver_type_id: approverRole,
    approver_ref_id: teacherRole,
    min_approvals: 1,
    condition: null,
  });
  db.tables.workflow_step.push({
    id: nextId(db, "workflow_step"),
    workflow_id: leaveWf,
    step_no: 2,
    name: "Principal",
    approver_type_id: approverRole,
    approver_ref_id: superAdminRole,
    min_approvals: 1,
    condition: null,
  });

  db.tables.custom_field_def.push({
    id: nextId(db, "custom_field_def"),
    entity_type_id: customStudent,
    key: "previous_school",
    label: "Previous school",
    label_alt: null,
    data_type_id: dataText,
    is_required: false,
    options: null,
    validation: null,
    group_label: "Admission",
    sort_order: 1,
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });

  db.tables.doc_template.push({
    id: nextId(db, "doc_template"),
    code: "welcome_letter",
    version: 1,
    module_id: platformMod,
    template_type_id: tplLetter,
    name: "Staff welcome letter",
    language: "en",
    subject: "Welcome to the school",
    body: "Dear {{person.first_name}},\n\nWelcome to Rooh International School.\n\nRegards,\nPrincipal",
    placeholders: ["person.first_name"],
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });

  seedPhase2(db, {
    ts,
    active,
    campusMain,
    sessionId,
    levelIds,
    offeringIds,
    genderMale,
    genderFemale,
    religionIslam,
    nationalityBd,
  });

  return db;
}

function seedPhase2(db, ctx) {
  const { ts, active, campusMain, sessionId, levelIds, offeringIds, genderMale, genderFemale, religionIslam, nationalityBd } = ctx;
  const studentActive = lv(db, "student_status", "active");
  const enrolled = lv(db, "enrollment_status", "enrolled");
  const relFather = lv(db, "relationship_type", "father");
  const relMother = lv(db, "relationship_type", "mother");
  const appSubmitted = lv(db, "application_status", "submitted");
  const appAccepted = lv(db, "application_status", "accepted");
  const appEnrolled = lv(db, "application_status", "enrolled");
  const formSold = lv(db, "form_sale_status", "sold");
  const formUsed = lv(db, "form_sale_status", "used");
  const enquiryOpen = lv(db, "enquiry_status", "open");
  const enquiryConverted = lv(db, "enquiry_status", "converted");
  const srcWalkIn = lv(db, "enquiry_source", "walk_in");
  const srcPhone = lv(db, "enquiry_source", "phone");
  const purposeAdmission = lv(db, "visitor_purpose", "admission");
  const purposeMeeting = lv(db, "visitor_purpose", "meeting");
  const callIn = lv(db, "call_direction", "inbound");
  const postalIn = lv(db, "postal_direction", "in");
  const complaintOpen = lv(db, "complaint_status", "open");
  const complaintParent = lv(db, "complaint_source", "parent");
  const passGate = lv(db, "pass_type", "gate");
  const passActive = lv(db, "pass_status", "active");
  const holidayPublic = lv(db, "holiday_type", "public");
  const holidaySchool = lv(db, "holiday_type", "school");
  const audienceAll = lv(db, "event_audience", "all");
  const noticeAll = lv(db, "notice_audience", "all");
  const empTeaching = lv(db, "employee_group", "teaching");
  const empAdmin = lv(db, "employee_group", "administrative");
  const incDiscipline = lv(db, "incident_category", "discipline");
  const sevLow = lv(db, "incident_severity", "low");
  const exitTc = lv(db, "exit_type", "tc");
  const exitDraft = lv(db, "exit_status", "draft");
  const bloodO = lv(db, "blood_group", "o_pos");

  const g1A = db.tables.class_section.find((s) => s.class_offering_id === offeringIds.G1 && s.name === "A");
  const g1B = db.tables.class_section.find((s) => s.class_offering_id === offeringIds.G1 && s.name === "B");
  const houseRed = db.tables.house.find((h) => h.code === "RED");
  const houseBlue = db.tables.house.find((h) => h.code === "BLU");

  const term1 = nextId(db, "term");
  db.tables.term.push({
    id: term1,
    session_id: sessionId,
    name: "Term 1",
    starts_on: "2026-07-01",
    ends_on: "2026-12-15",
    sort_order: 1,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  const term2 = nextId(db, "term");
  db.tables.term.push({
    id: term2,
    session_id: sessionId,
    name: "Term 2",
    starts_on: "2027-01-05",
    ends_on: "2027-06-30",
    sort_order: 2,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  for (let w = 1; w <= 4; w++) {
    const start = new Date(Date.UTC(2026, 6, 1 + (w - 1) * 7));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    db.tables.week.push({
      id: nextId(db, "week"),
      term_id: term1,
      week_no: w,
      starts_on: start.toISOString().slice(0, 10),
      ends_on: end.toISOString().slice(0, 10),
    });
  }
  db.tables.holiday.push({
    id: nextId(db, "holiday"),
    session_id: sessionId,
    campus_id: null,
    name: "Independence Day",
    starts_on: "2026-03-26",
    ends_on: "2026-03-26",
    holiday_type_id: holidayPublic,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.holiday.push({
    id: nextId(db, "holiday"),
    session_id: sessionId,
    campus_id: campusMain,
    name: "Winter break",
    starts_on: "2026-12-16",
    ends_on: "2027-01-04",
    holiday_type_id: holidaySchool,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  for (const group of [empTeaching, empAdmin]) {
    for (let d = 0; d <= 6; d++) {
      db.tables.working_day.push({
        id: nextId(db, "working_day"),
        session_id: sessionId,
        employee_group_id: group,
        weekday: d,
        is_working: d >= 1 && d <= 5,
      });
    }
  }
  db.tables.event.push({
    id: nextId(db, "event"),
    session_id: sessionId,
    campus_id: campusMain,
    title: "Orientation day",
    starts_at: "2026-07-02T04:00:00.000Z",
    ends_at: "2026-07-02T08:00:00.000Z",
    location: "Main hall",
    audience_id: audienceAll,
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.notice.push({
    id: nextId(db, "notice"),
    session_id: sessionId,
    campus_id: campusMain,
    title: "Session 2026–2027 opens 1 July",
    body: "Classes resume on Wednesday 1 July. Uniforms from the school store.",
    published_at: ts,
    audience_id: noticeAll,
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });

  const batchG1 = nextId(db, "form_batch");
  db.tables.form_batch.push({
    id: batchG1,
    session_id: sessionId,
    campus_id: campusMain,
    class_level_id: levelIds.G1,
    price: 500,
    sold_from: "2026-04-01",
    sold_to: "2026-06-15",
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  const sale1 = nextId(db, "form_sale");
  db.tables.form_sale.push({
    id: sale1,
    batch_id: batchG1,
    serial_no: "G1-0001",
    sold_on: "2026-04-12",
    buyer_name: "Farhan Ahmed",
    buyer_phone: "+8801711222001",
    amount: 500,
    status_id: formUsed,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  const sale2 = nextId(db, "form_sale");
  db.tables.form_sale.push({
    id: sale2,
    batch_id: batchG1,
    serial_no: "G1-0002",
    sold_on: "2026-04-18",
    buyer_name: "Nadia Islam",
    buyer_phone: "+8801711222002",
    amount: 500,
    status_id: formSold,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });

  const child1 = nextId(db, "person");
  db.tables.person.push({
    id: child1,
    first_name: "Zara",
    last_name: "Ahmed",
    name_alt: "জারা আহমেদ",
    date_of_birth: "2019-08-21",
    gender_id: genderFemale,
    religion_id: religionIslam,
    nationality_id: nationalityBd,
    blood_group_id: bloodO,
    photo_file_id: null,
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  const father1 = nextId(db, "person");
  db.tables.person.push({
    id: father1,
    first_name: "Farhan",
    last_name: "Ahmed",
    name_alt: null,
    date_of_birth: "1986-02-11",
    gender_id: genderMale,
    religion_id: religionIslam,
    nationality_id: nationalityBd,
    blood_group_id: lv(db, "blood_group", "a_pos"),
    photo_file_id: null,
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  const mother1 = nextId(db, "person");
  db.tables.person.push({
    id: mother1,
    first_name: "Laila",
    last_name: "Ahmed",
    name_alt: null,
    date_of_birth: "1988-05-03",
    gender_id: genderFemale,
    religion_id: religionIslam,
    nationality_id: nationalityBd,
    blood_group_id: lv(db, "blood_group", "b_pos"),
    photo_file_id: null,
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  const child2 = nextId(db, "person");
  db.tables.person.push({
    id: child2,
    first_name: "Imran",
    last_name: "Chowdhury",
    name_alt: null,
    date_of_birth: "2019-11-04",
    gender_id: genderMale,
    religion_id: religionIslam,
    nationality_id: nationalityBd,
    blood_group_id: lv(db, "blood_group", "b_neg"),
    photo_file_id: null,
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  const parent2 = nextId(db, "person");
  db.tables.person.push({
    id: parent2,
    first_name: "Nadia",
    last_name: "Islam",
    name_alt: null,
    date_of_birth: "1991-01-19",
    gender_id: genderFemale,
    religion_id: religionIslam,
    nationality_id: nationalityBd,
    blood_group_id: bloodO,
    photo_file_id: null,
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });

  const app1 = nextId(db, "application");
  db.tables.application.push({
    id: app1,
    form_sale_id: sale1,
    session_id: sessionId,
    campus_id: campusMain,
    class_level_id: levelIds.G1,
    applicant_person_id: child1,
    status_id: appEnrolled,
    submitted_at: "2026-05-01T06:00:00.000Z",
    custom_data: { previous_school: "Little Stars KG" },
    notes: "Converted to enrolment",
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.application_guardian.push({
    id: nextId(db, "application_guardian"),
    application_id: app1,
    person_id: father1,
    relationship_type_id: relFather,
  });
  db.tables.application_guardian.push({
    id: nextId(db, "application_guardian"),
    application_id: app1,
    person_id: mother1,
    relationship_type_id: relMother,
  });

  const app2 = nextId(db, "application");
  db.tables.application.push({
    id: app2,
    form_sale_id: sale2,
    session_id: sessionId,
    campus_id: campusMain,
    class_level_id: levelIds.G1,
    applicant_person_id: child2,
    status_id: appAccepted,
    submitted_at: "2026-05-10T06:00:00.000Z",
    custom_data: {},
    notes: "Ready to enrol",
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.application_guardian.push({
    id: nextId(db, "application_guardian"),
    application_id: app2,
    person_id: parent2,
    relationship_type_id: relMother,
  });

  const testId = nextId(db, "admission_test");
  db.tables.admission_test.push({
    id: testId,
    session_id: sessionId,
    class_level_id: levelIds.G1,
    name: "Grade 1 entrance",
    held_on: "2026-05-20",
    venue: "Primary block",
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.test_score.push({
    id: nextId(db, "test_score"),
    application_id: app1,
    test_id: testId,
    marks: 86,
    remarks: "Strong reading",
  });
  db.tables.test_score.push({
    id: nextId(db, "test_score"),
    application_id: app2,
    test_id: testId,
    marks: 74,
    remarks: null,
  });

  const student1 = nextId(db, "student");
  db.tables.student.push({
    id: student1,
    person_id: child1,
    student_code: "STD-00001",
    campus_id: campusMain,
    admitted_on: "2026-06-15",
    application_id: app1,
    status_id: studentActive,
    legacy_id: null,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  const seq = db.tables.id_sequence.find((s) => s.entity_code === "student" && s.session_id == null);
  if (seq) seq.next_number = 2;

  db.tables.guardian_link.push({
    id: nextId(db, "guardian_link"),
    student_id: student1,
    person_id: father1,
    relationship_type_id: relFather,
    is_primary: true,
    is_emergency: true,
    lives_with: true,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.guardian_link.push({
    id: nextId(db, "guardian_link"),
    student_id: student1,
    person_id: mother1,
    relationship_type_id: relMother,
    is_primary: false,
    is_emergency: true,
    lives_with: true,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.health.push({
    id: nextId(db, "health"),
    student_id: student1,
    allergies: "Peanuts",
    conditions: null,
    physician_name: "Dr. Sultana",
    physician_phone: "+8801711999000",
    notes: null,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.previous_school.push({
    id: nextId(db, "previous_school"),
    student_id: student1,
    name: "Little Stars KG",
    last_class: "KG",
    years_attended: "2024-2026",
    leaving_reason: "Moving to Grade 1",
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.enrollment.push({
    id: nextId(db, "enrollment"),
    student_id: student1,
    session_id: sessionId,
    class_section_id: g1A.id,
    house_id: houseRed?.id ?? null,
    roll_no: 1,
    status_id: enrolled,
    enrolled_on: "2026-06-15",
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });

  const clubArt = nextId(db, "club");
  db.tables.club.push({
    id: clubArt,
    code: "ART",
    name: "Art club",
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.club.push({
    id: nextId(db, "club"),
    code: "QUR",
    name: "Quran circle",
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.club_membership.push({
    id: nextId(db, "club_membership"),
    club_id: clubArt,
    student_id: student1,
    session_id: sessionId,
    role: "member",
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.incident.push({
    id: nextId(db, "incident"),
    student_id: student1,
    occurred_on: "2026-08-12",
    category_id: incDiscipline,
    severity_id: sevLow,
    description: "Late to assembly",
    action_taken: "Verbal reminder",
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.exit_request.push({
    id: nextId(db, "exit_request"),
    student_id: student1,
    exit_type_id: exitTc,
    requested_on: "2026-09-01",
    effective_on: null,
    reason: "Example draft — do not issue",
    tc_number: null,
    status_id: exitDraft,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });

  db.tables.enquiry.push({
    id: nextId(db, "enquiry"),
    session_id: sessionId,
    campus_id: campusMain,
    class_level_id: levelIds.G1,
    inquirer_name: "Farhan Ahmed",
    phone: "+8801711222001",
    source_id: srcWalkIn,
    notes: "Converted to form sale G1-0001",
    follow_up_on: null,
    status_id: enquiryConverted,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.enquiry.push({
    id: nextId(db, "enquiry"),
    session_id: sessionId,
    campus_id: campusMain,
    class_level_id: levelIds.G2,
    inquirer_name: "Tariq Hasan",
    phone: "+8801711222099",
    source_id: srcPhone,
    notes: "Asked about transport",
    follow_up_on: "2026-05-05",
    status_id: enquiryOpen,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.visitor.push({
    id: nextId(db, "visitor"),
    campus_id: campusMain,
    name: "Farhan Ahmed",
    purpose_id: purposeAdmission,
    visiting: "Admissions desk",
    badge_no: "V-014",
    in_at: "2026-04-12T03:30:00.000Z",
    out_at: "2026-04-12T04:10:00.000Z",
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.visitor.push({
    id: nextId(db, "visitor"),
    campus_id: campusMain,
    name: "Courier Pathao",
    purpose_id: purposeMeeting,
    visiting: "Accounts",
    badge_no: "V-015",
    in_at: ts,
    out_at: null,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.call_log.push({
    id: nextId(db, "call_log"),
    direction_id: callIn,
    phone: "+8801711222099",
    caller_name: "Tariq Hasan",
    subject: "Grade 2 seat",
    notes: "Callback booked",
    logged_at: ts,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.postal.push({
    id: nextId(db, "postal"),
    direction_id: postalIn,
    ref_no: "IN-2026-018",
    from_to: "Dhaka Education Board",
    subject: "Registration circular",
    received_on: "2026-07-08",
    status_id: active,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.complaint.push({
    id: nextId(db, "complaint"),
    source_id: complaintParent,
    person_id: father1,
    subject: "Bus late at checkpoint 3",
    body: "Three days running.",
    lodged_on: "2026-08-03",
    status_id: complaintOpen,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });
  db.tables.gate_pass.push({
    id: nextId(db, "gate_pass"),
    student_id: student1,
    person_id: child1,
    pass_type_id: passGate,
    valid_from: "2026-08-20T04:00:00.000Z",
    valid_to: "2026-08-20T08:00:00.000Z",
    reason: "Dentist appointment",
    status_id: passActive,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  });

  void g1B;
  void houseBlue;
  void appSubmitted;
}

function migrateDb(db) {
  if (!db.tables) db.tables = {};
  if (!db.seq) db.seq = {};
  for (const k of entityKeys) {
    if (!Array.isArray(db.tables[k])) db.tables[k] = [];
  }
  const ts = nowIso();
  for (const t of lookupTypes) {
    if (!db.tables.lookup_type.some((x) => x.code === t.code)) {
      db.tables.lookup_type.push({
        id: nextId(db, "lookup_type"),
        ...t,
        description: null,
        created_at: ts,
        updated_at: ts,
      });
    }
  }
  for (const [typeCode, code, label, sort_order, is_final] of lookupValues) {
    const type = db.tables.lookup_type.find((x) => x.code === typeCode);
    if (!type) continue;
    if (db.tables.lookup_value.some((v) => v.lookup_type_id === type.id && v.code === code)) continue;
    db.tables.lookup_value.push({
      id: nextId(db, "lookup_value"),
      lookup_type_id: type.id,
      code,
      label,
      label_alt: null,
      sort_order,
      is_default: false,
      is_final,
      color: null,
      meta: {},
      is_active: true,
      is_system: true,
      created_at: ts,
      updated_at: ts,
    });
  }
  if (db.tables.student.length === 0 && db.tables.campus.length > 0) {
    const campusMain = db.tables.campus.find((c) => c.code === "MAIN") ?? db.tables.campus[0];
    const session = db.tables.academic_session.find((s) => s.is_current) ?? db.tables.academic_session[0];
    const levelIds = Object.fromEntries(db.tables.class_level.map((l) => [l.code, l.id]));
    const offeringIds = {};
    for (const o of db.tables.class_offering) {
      const lvl = db.tables.class_level.find((l) => l.id === o.class_level_id);
      if (lvl) offeringIds[lvl.code] = o.id;
    }
    seedPhase2(db, {
      ts,
      active: lv(db, "record_status", "active"),
      campusMain: campusMain.id,
      sessionId: session.id,
      levelIds,
      offeringIds,
      genderMale: lv(db, "gender", "male"),
      genderFemale: lv(db, "gender", "female"),
      religionIslam: lv(db, "religion", "islam"),
      nationalityBd: lv(db, "nationality", "bangladeshi"),
    });
  }
  saveDb(db);
  return db;
}

export function loadDb() {
  if (fs.existsSync(DATA_FILE)) {
    return migrateDb(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = seed(emptyDb());
  saveDb(db);
  return db;
}

export function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

export function list(db, table, { q, searchFields, page, pageSize, sort, dir }) {
  let rows = [...(db.tables[table] ?? [])];
  if (q && searchFields?.length) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) =>
      searchFields.some((f) => String(r[f] ?? "").toLowerCase().includes(needle)),
    );
  }
  if (sort) {
    const mul = dir === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    });
  } else {
    rows.sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total, page, pageSize };
}

export function getById(db, table, id) {
  return (db.tables[table] ?? []).find((r) => String(r.id) === String(id)) ?? null;
}

export function insert(db, table, payload) {
  const id = typeof payload.id === "string" && payload.id.includes("-")
    ? payload.id
    : nextId(db, table);
  const ts = nowIso();
  const row = {
    ...payload,
    id,
    created_at: payload.created_at ?? ts,
    updated_at: ts,
  };
  db.tables[table].push(row);
  saveDb(db);
  return row;
}

export function update(db, table, id, payload) {
  const rows = db.tables[table] ?? [];
  const i = rows.findIndex((r) => String(r.id) === String(id));
  if (i < 0) return null;
  const next = { ...rows[i], ...payload, id: rows[i].id, updated_at: nowIso() };
  rows[i] = next;
  saveDb(db);
  return next;
}

export function remove(db, table, id) {
  const rows = db.tables[table] ?? [];
  const i = rows.findIndex((r) => String(r.id) === String(id));
  if (i < 0) return false;
  rows.splice(i, 1);
  saveDb(db);
  return true;
}

export function options(db, table, labelField = "name") {
  return (db.tables[table] ?? []).map((r) => {
    let label = r[labelField];
    if (table === "person") {
      label = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.name_alt;
    }
    if (table === "student") {
      const p = db.tables.person.find((x) => x.id === r.person_id);
      label = r.student_code + (p ? ` · ${[p.first_name, p.last_name].filter(Boolean).join(" ")}` : "");
    }
    if (table === "class_section") {
      const off = db.tables.class_offering.find((o) => o.id === r.class_offering_id);
      const lvl = off ? db.tables.class_level.find((l) => l.id === off.class_level_id) : null;
      label = `${lvl?.name ?? "Class"} / ${r.name}`;
    }
    if (table === "application") {
      const p = db.tables.person.find((x) => x.id === r.applicant_person_id);
      label = `#${r.id} ${p ? [p.first_name, p.last_name].filter(Boolean).join(" ") : ""}`.trim();
    }
    return {
      id: r.id,
      label: label || r.name || r.code || r.label || String(r.id),
    };
  });
}

export function nextCode(db, entity, sessionId = null) {
  const seq = db.tables.id_sequence.find(
    (s) => s.entity_code === entity && s.session_id == sessionId,
  );
  if (!seq) {
    throw new Error(`No id_sequence configured for entity "${entity}"`);
  }
  const n = seq.next_number;
  seq.next_number = n + 1;
  return seq.prefix + String(n).padStart(seq.padding, "0");
}

export function convertApplication(db, applicationId, payload = {}) {
  const app = getById(db, "application", applicationId);
  if (!app) throw Object.assign(new Error("Application not found"), { status: 404 });
  const enrolledStatus = lv(db, "application_status", "enrolled");
  if (app.status_id === enrolledStatus) {
    throw Object.assign(new Error("Application already enrolled"), { status: 400 });
  }
  const allowed = new Set(
    ["accepted", "offered", "submitted", "under_review", "test_scheduled"].map((c) =>
      lv(db, "application_status", c),
    ),
  );
  if (!allowed.has(app.status_id)) {
    throw Object.assign(new Error("Application is not in an enrolable status"), { status: 400 });
  }
  if (db.tables.student.some((s) => s.person_id === app.applicant_person_id || s.application_id === app.id)) {
    throw Object.assign(new Error("A student already exists for this applicant"), { status: 409 });
  }
  const sectionId = Number(payload.class_section_id);
  const section = getById(db, "class_section", sectionId);
  if (!section) throw Object.assign(new Error("Class section is required"), { status: 400 });

  const ts = nowIso();
  const studentId = nextId(db, "student");
  const student = {
    id: studentId,
    person_id: app.applicant_person_id,
    student_code: nextCode(db, "student"),
    campus_id: app.campus_id,
    admitted_on: payload.admitted_on || ts.slice(0, 10),
    application_id: app.id,
    status_id: lv(db, "student_status", "active"),
    legacy_id: null,
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  };
  db.tables.student.push(student);

  let primarySet = false;
  for (const g of db.tables.application_guardian.filter((x) => x.application_id === app.id)) {
    db.tables.guardian_link.push({
      id: nextId(db, "guardian_link"),
      student_id: studentId,
      person_id: g.person_id,
      relationship_type_id: g.relationship_type_id,
      is_primary: !primarySet,
      is_emergency: true,
      lives_with: true,
      created_at: ts,
      updated_at: ts,
      created_by: null,
      updated_by: null,
    });
    primarySet = true;
  }

  const enrollment = {
    id: nextId(db, "enrollment"),
    student_id: studentId,
    session_id: app.session_id,
    class_section_id: section.id,
    house_id: payload.house_id ? Number(payload.house_id) : null,
    roll_no: payload.roll_no != null && payload.roll_no !== "" ? Number(payload.roll_no) : null,
    status_id: lv(db, "enrollment_status", "enrolled"),
    enrolled_on: payload.admitted_on || ts.slice(0, 10),
    created_at: ts,
    updated_at: ts,
    created_by: null,
    updated_by: null,
  };
  db.tables.enrollment.push(enrollment);

  app.status_id = enrolledStatus;
  app.updated_at = ts;
  if (app.form_sale_id) {
    const sale = getById(db, "form_sale", app.form_sale_id);
    if (sale) {
      sale.status_id = lv(db, "form_sale_status", "used");
      sale.updated_at = ts;
    }
  }
  saveDb(db);
  return { student, enrollment };
}

export { lv, nextId };

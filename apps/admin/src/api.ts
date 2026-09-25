import { entities } from "@sms/crud-engine";
import { getNeon, neonErrorMessage } from "./lib/neon";

export type PageMeta = { total: number; page: number; pageSize: number };

export type ListResult<T> = { data: T[]; meta: PageMeta };

export type LookupValue = {
  id: number;
  lookup_type_id: number;
  code: string;
  label: string;
  label_alt: string | null;
  sort_order: number;
  is_default: boolean;
  is_final: boolean;
  color: string | null;
  is_active: boolean;
  is_system: boolean;
};

export type LookupType = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_status: boolean;
  is_system: boolean;
  values: LookupValue[];
};

export type SchoolMe = {
  app_user: Record<string, unknown>;
  person: { first_name?: string; last_name?: string } | null;
  roles: { code: string; name: string }[];
};

function unwrap<T>(result: { data: T | null; error: unknown; count?: number | null }): T {
  if (result.error) throw new Error(neonErrorMessage(result.error));
  return result.data as T;
}

function table(entity: string): string {
  return entity;
}

export async function listEntities<T>(
  entity: string,
  params: { page?: number; pageSize?: number; q?: string; sort?: string; dir?: string } = {},
): Promise<ListResult<T>> {
  const client = getNeon();
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(500, Math.max(1, params.pageSize || 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const cfg = entities[entity];
  const sort = params.sort || cfg?.defaultSort?.field || "id";
  const ascending = (params.dir || cfg?.defaultSort?.dir || "asc") !== "desc";

  let q = client.from(table(entity)).select("*", { count: "exact" });
  const term = (params.q || "").trim();
  if (term && cfg?.searchFields?.length) {
    const or = cfg.searchFields.map((f) => `${f}.ilike.%${term.replace(/[%_,]/g, "")}%`).join(",");
    q = q.or(or);
  }
  q = q.order(sort, { ascending }).range(from, to);
  const result = await q;
  if (result.error) throw new Error(neonErrorMessage(result.error));
  return {
    data: (result.data ?? []) as T[],
    meta: { total: result.count ?? 0, page, pageSize },
  };
}

export async function getEntity<T>(entity: string, id: string | number) {
  const result = await getNeon().from(table(entity)).select("*").eq("id", id).maybeSingle();
  const row = unwrap<T | null>(result);
  if (!row) throw new Error("Not found");
  return { data: row };
}

export async function createEntity<T>(entity: string, payload: unknown) {
  const result = await getNeon().from(table(entity)).insert(payload as object).select().single();
  return { data: unwrap<T>(result) };
}

export async function updateEntity<T>(entity: string, id: string | number, payload: unknown) {
  const result = await getNeon()
    .from(table(entity))
    .update(payload as object)
    .eq("id", id)
    .select()
    .single();
  return { data: unwrap<T>(result) };
}

export async function deleteEntity(entity: string, id: string | number) {
  const result = await getNeon().from(table(entity)).delete().eq("id", id);
  if (result.error) throw new Error(neonErrorMessage(result.error));
}

export async function fetchLookups() {
  const client = getNeon();
  const types = await client.from("lookup_type").select("*").order("code");
  const values = await client.from("lookup_value").select("*").order("sort_order");
  if (types.error) throw new Error(neonErrorMessage(types.error));
  if (values.error) throw new Error(neonErrorMessage(values.error));
  const byType = new Map<number, LookupValue[]>();
  for (const v of (values.data ?? []) as LookupValue[]) {
    const arr = byType.get(v.lookup_type_id) ?? [];
    arr.push(v);
    byType.set(v.lookup_type_id, arr);
  }
  const data = ((types.data ?? []) as Omit<LookupType, "values">[]).map((t) => ({
    ...t,
    values: byType.get(t.id) ?? [],
  }));
  return { data };
}

export async function createLookupValue(typeCode: string, payload: Record<string, unknown>) {
  const typeRes = await getNeon().from("lookup_type").select("id").eq("code", typeCode).maybeSingle();
  const type = unwrap<{ id: number } | null>(typeRes);
  if (!type) throw new Error("Lookup type not found");
  const row = {
    lookup_type_id: type.id,
    code: payload.code,
    label: payload.label,
    label_alt: payload.label_alt ?? null,
    sort_order: Number(payload.sort_order) || 0,
    is_default: Boolean(payload.is_default),
    is_final: Boolean(payload.is_final),
    color: payload.color ?? null,
    is_active: true,
    is_system: false,
  };
  const result = await getNeon().from("lookup_value").insert(row).select().single();
  return { data: unwrap<LookupValue>(result) };
}

export async function updateLookupValue(id: number, payload: unknown) {
  const result = await getNeon().from("lookup_value").update(payload as object).eq("id", id).select().single();
  return { data: unwrap<LookupValue>(result) };
}

function optionLabel(entity: string, row: Record<string, unknown>, labelField: string): string {
  if (entity === "person") {
    return [row.first_name, row.last_name].filter(Boolean).join(" ") || String(row.name_alt || row.id);
  }
  if (entity === "student") {
    return String(row.student_code || row.id);
  }
  if (entity === "application") {
    return `#${row.id}`;
  }
  return String(row[labelField] ?? row.name ?? row.code ?? row.label ?? row.id);
}

export async function fetchOptions(entity: string, label = "name") {
  const result = await getNeon().from(table(entity)).select("*").limit(500);
  if (result.error) throw new Error(neonErrorMessage(result.error));
  const rows = (result.data ?? []) as Record<string, unknown>[];
  return {
    data: rows.map((r) => ({ id: Number(r.id), label: optionLabel(entity, r, label) })),
  };
}

async function countRows(entity: string): Promise<number> {
  const result = await getNeon().from(table(entity)).select("id", { count: "exact", head: true });
  if (result.error) throw new Error(neonErrorMessage(result.error));
  return result.count ?? 0;
}

export async function fetchDashboard() {
  const client = getNeon();
  const keys = [
    "campus",
    "academic_session",
    "class_level",
    "class_offering",
    "subject",
    "person",
    "role",
    "app_user",
    "rule",
    "workflow",
    "lookup_type",
    "module",
    "student",
    "enrollment",
    "application",
    "enquiry",
    "visitor",
    "term",
  ] as const;
  const countsArr = await Promise.all(keys.map((k) => countRows(k)));
  const map: Record<string, number> = {
    campuses: countsArr[0],
    sessions: countsArr[1],
    class_levels: countsArr[2],
    offerings: countsArr[3],
    subjects: countsArr[4],
    people: countsArr[5],
    roles: countsArr[6],
    users: countsArr[7],
    rules: countsArr[8],
    workflows: countsArr[9],
    lookups: countsArr[10],
    modules: countsArr[11],
    students: countsArr[12],
    enrollments: countsArr[13],
    applications: countsArr[14],
    enquiries: countsArr[15],
    visitors: countsArr[16],
    terms: countsArr[17],
  };
  const sessionRes = await client.from("academic_session").select("*").eq("is_current", true).maybeSingle();
  if (sessionRes.error) throw new Error(neonErrorMessage(sessionRes.error));
  const peopleRes = await client.from("person").select("*").order("id", { ascending: false }).limit(5);
  if (peopleRes.error) throw new Error(neonErrorMessage(peopleRes.error));
  return {
    data: {
      counts: map,
      current_session: sessionRes.data,
      recent_people: peopleRes.data ?? [],
    },
  };
}

export async function enrolApplication(
  id: number | string,
  payload: { class_section_id: number; house_id?: number | null; roll_no?: number | null; admitted_on?: string },
) {
  const result = await getNeon().rpc("enrol_application", {
    p_application_id: Number(id),
    p_class_section_id: payload.class_section_id,
    p_house_id: payload.house_id ?? null,
    p_roll_no: payload.roll_no ?? null,
    p_admitted_on: payload.admitted_on ?? null,
  });
  const data = unwrap<{ student: Record<string, unknown>; enrollment: Record<string, unknown> }>(result);
  return { data };
}

export async function bootstrapStaff(firstName?: string, lastName?: string) {
  const result = await getNeon().rpc("bootstrap_staff", {
    p_first_name: firstName ?? "Staff",
    p_last_name: lastName ?? null,
  });
  return unwrap<Record<string, unknown>>(result);
}

export async function fetchMe(): Promise<SchoolMe | null> {
  const result = await getNeon().rpc("me");
  if (result.error) throw new Error(neonErrorMessage(result.error));
  return (result.data as SchoolMe | null) ?? null;
}

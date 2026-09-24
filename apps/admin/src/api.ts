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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body as T;
}

export function listEntities<T>(
  entity: string,
  params: { page?: number; pageSize?: number; q?: string; sort?: string; dir?: string } = {},
) {
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.q) sp.set("q", params.q);
  if (params.sort) sp.set("sort", params.sort);
  if (params.dir) sp.set("dir", params.dir);
  const qs = sp.toString();
  return request<ListResult<T>>(`/api/${entity}${qs ? `?${qs}` : ""}`);
}

export function getEntity<T>(entity: string, id: string | number) {
  return request<{ data: T }>(`/api/${entity}/${id}`);
}

export function createEntity<T>(entity: string, payload: unknown) {
  return request<{ data: T }>(`/api/${entity}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEntity<T>(entity: string, id: string | number, payload: unknown) {
  return request<{ data: T }>(`/api/${entity}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteEntity(entity: string, id: string | number) {
  return request<void>(`/api/${entity}/${id}`, { method: "DELETE" });
}

export function fetchLookups() {
  return request<{ data: LookupType[] }>("/api/lookups");
}

export function createLookupValue(typeCode: string, payload: unknown) {
  return request<{ data: LookupValue }>(`/api/lookups/${typeCode}/values`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateLookupValue(id: number, payload: unknown) {
  return request<{ data: LookupValue }>(`/api/lookup-values/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function fetchOptions(entity: string, label = "name") {
  return request<{ data: { id: number; label: string }[] }>(
    `/api/meta/options/${entity}?label=${encodeURIComponent(label)}`,
  );
}

export function fetchDashboard() {
  return request<{
    data: {
      counts: Record<string, number>;
      current_session: Record<string, unknown> | null;
      recent_people: Record<string, unknown>[];
    };
  }>("/api/dashboard");
}

export function enrolApplication(
  id: number | string,
  payload: { class_section_id: number; house_id?: number | null; roll_no?: number | null; admitted_on?: string },
) {
  return request<{ data: { student: Record<string, unknown>; enrollment: Record<string, unknown> } }>(
    `/api/applications/${id}/enrol`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

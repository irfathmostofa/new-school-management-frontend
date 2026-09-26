import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RoleRow } from "../lib/types";

type UserDetail = {
  id: number;
  email: string;
  first_name: string;
  last_name: string | null;
  profile_label: string;
  status: string;
  status_label: string;
  last_login_at: string | null;
  roles: { id: number; role_id: number; name: string; campus_id: number | null; campus_name: string | null; valid_from: string; valid_to: string | null }[];
  devices: { id: number; platform_label: string; push_token: string; last_seen_at: string | null }[];
};

export default function UserDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const user = useQuery({
    queryKey: ["user", id],
    queryFn: () => api<UserDetail>(`/api/iam/users/${id}`),
  });
  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => api<{ items: RoleRow[] }>("/api/iam/roles"),
    enabled: can("user_role", "update"),
  });
  const campuses = useQuery({
    queryKey: ["campuses"],
    queryFn: () => api<{ id: number; name: string }[]>("/api/iam/campuses"),
  });
  const [status, setStatus] = useState("");

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/iam/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user", id] }),
  });
  const addRole = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/iam/users/${id}/roles`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user", id] }),
  });
  const removeRole = useMutation({
    mutationFn: (roleRowId: number) =>
      api(`/api/iam/users/${id}/roles/${roleRowId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user", id] }),
  });

  if (user.isLoading) return <p>Loading…</p>;
  if (!user.data) return <p>User not found.</p>;
  const u = user.data;

  function onRole(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addRole.mutate({
      role_id: Number(fd.get("role_id")),
      campus_id: fd.get("campus_id") ? Number(fd.get("campus_id")) : null,
    });
    e.currentTarget.reset();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to="/iam/users" className="text-sm text-ink-700 hover:underline">Back to users</Link>
      <div>
        <h2 className="font-serif text-2xl">{[u.first_name, u.last_name].filter(Boolean).join(" ")}</h2>
        <p className="text-sm text-ink-700">{u.email} · {u.profile_label} · {u.status_label}</p>
      </div>
      {can("user", "update") ? (
        <form
          className="bg-white border border-ink-200 rounded-xl p-5 flex gap-3 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (status) update.mutate({ status });
          }}
        >
          <label className="text-sm">
            Status
            <select className="mt-1 block border rounded-md px-2 py-1.5" value={status || u.status} onChange={(e) => setStatus(e.target.value)}>
              <option value="pending">Pending activation</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
          <button className="rounded-md bg-ink-900 text-white px-3 py-2 text-sm">Save</button>
        </form>
      ) : null}
      <section className="bg-white border border-ink-200 rounded-xl p-5">
        <h3 className="font-serif text-xl">Campus-scoped roles</h3>
        <ul className="mt-3 text-sm divide-y">
          {u.roles.map((r) => (
            <li key={r.id} className="py-2 flex justify-between gap-3">
              <span>
                {r.name} · {r.campus_name || "all campuses"} · from {r.valid_from}
              </span>
              {can("user_role", "update") ? (
                <button className="text-red-700" onClick={() => removeRole.mutate(r.id)}>Remove</button>
              ) : null}
            </li>
          ))}
        </ul>
        {can("user_role", "update") ? (
          <form className="mt-4 flex gap-2" onSubmit={onRole}>
            <select required name="role_id" className="border rounded-md px-2 py-1.5 text-sm">
              <option value="">Role</option>
              {(roles.data?.items || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select name="campus_id" className="border rounded-md px-2 py-1.5 text-sm">
              <option value="">All campuses</option>
              {(campuses.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="rounded-md bg-ink-900 text-white px-3 py-1.5 text-sm">Assign</button>
          </form>
        ) : null}
      </section>
      <section className="bg-white border border-ink-200 rounded-xl p-5">
        <h3 className="font-serif text-xl">Devices</h3>
        <ul className="mt-3 text-sm">
          {u.devices.length === 0 ? <li className="text-ink-700">No devices</li> : null}
          {u.devices.map((d) => (
            <li key={d.id} className="py-1">{d.platform_label} · {d.push_token.slice(0, 12)}…</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

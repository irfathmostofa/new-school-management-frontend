import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Lookup, Paginated, RoleRow, UserRow } from "../lib/types";

type Lookups = Record<string, Lookup[]>;

export default function UsersPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [profile, setProfile] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);

  const lookups = useQuery({ queryKey: ["lookups"], queryFn: () => api<Lookups>("/api/iam/lookups") });
  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => api<{ items: RoleRow[] }>("/api/iam/roles"),
    enabled: can("user", "create"),
  });
  const users = useQuery({
    queryKey: ["users", q, status, profile, page],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), pageSize: "12" });
      if (q) p.set("q", q);
      if (status) p.set("status", status);
      if (profile) p.set("profile", profile);
      return api<Paginated<UserRow>>(`/api/iam/users?${p}`);
    },
  });

  const pages = Math.max(1, Math.ceil((users.data?.total || 0) / 12));

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl">Users</h2>
          <p className="text-sm text-ink-700">School identity linked to Neon Auth.</p>
        </div>
        {can("user", "create") ? (
          <button className="rounded-md bg-ink-900 text-white px-4 py-2 text-sm" onClick={() => setOpen(true)}>
            Invite user
          </button>
        ) : null}
      </div>
      <div className="flex gap-3">
        <input
          className="rounded-md border border-ink-200 px-3 py-2 text-sm w-64"
          placeholder="Search name or email"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          className="rounded-md border border-ink-200 px-3 py-2 text-sm"
          value={profile}
          onChange={(e) => {
            setPage(1);
            setProfile(e.target.value);
          }}
        >
          <option value="">All profiles</option>
          {(lookups.data?.profile_type || []).map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
        <select
          className="rounded-md border border-ink-200 px-3 py-2 text-sm"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">All statuses</option>
          {(lookups.data?.user_status || []).map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>
      <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-wider text-ink-700">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Profile</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Roles</th>
            </tr>
          </thead>
          <tbody>
            {(users.data?.items || []).map((u) => (
              <tr key={u.id} className="border-t border-ink-100 hover:bg-ink-50">
                <td className="px-4 py-3">
                  <Link className="font-medium hover:underline" to={`/iam/users/${u.id}`}>
                    {[u.first_name, u.last_name].filter(Boolean).join(" ")}
                  </Link>
                </td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{u.profile_label}</td>
                <td className="px-4 py-3">{u.status_label}</td>
                <td className="px-4 py-3 text-ink-700">{u.roles || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <button disabled={page <= 1} className="disabled:opacity-40" onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button disabled={page >= pages} className="disabled:opacity-40" onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
      {open ? (
        <InviteModal
          lookups={lookups.data}
          roles={roles.data?.items || []}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ["users"] });
          }}
        />
      ) : null}
    </div>
  );
}

function InviteModal({
  lookups,
  roles,
  onClose,
  onCreated,
}: {
  lookups?: Lookups;
  roles: RoleRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/api/iam/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: onCreated,
    onError: (e: Error) => setError(e.message),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    mutation.mutate({
      first_name: fd.get("first_name"),
      last_name: fd.get("last_name"),
      email: fd.get("email"),
      password: fd.get("password"),
      profile_type: fd.get("profile_type"),
      gender: fd.get("gender") || undefined,
      role_id: fd.get("role_id") ? Number(fd.get("role_id")) : undefined,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-10">
      <form className="bg-white rounded-xl w-full max-w-lg p-6 space-y-3" onSubmit={onSubmit}>
        <h3 className="font-serif text-xl">Invite user</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">First name<input required name="first_name" className="mt-1 w-full border rounded-md px-2 py-1.5" /></label>
          <label className="text-sm">Last name<input name="last_name" className="mt-1 w-full border rounded-md px-2 py-1.5" /></label>
          <label className="text-sm col-span-2">Email<input required type="email" name="email" className="mt-1 w-full border rounded-md px-2 py-1.5" /></label>
          <label className="text-sm col-span-2">Temporary password<input required name="password" className="mt-1 w-full border rounded-md px-2 py-1.5" /></label>
          <label className="text-sm">Profile
            <select name="profile_type" className="mt-1 w-full border rounded-md px-2 py-1.5">
              {(lookups?.profile_type || []).map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
          <label className="text-sm">Gender
            <select name="gender" className="mt-1 w-full border rounded-md px-2 py-1.5">
              <option value="">—</option>
              {(lookups?.gender || []).map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
          <label className="text-sm col-span-2">Initial role
            <select name="role_id" className="mt-1 w-full border rounded-md px-2 py-1.5">
              <option value="">None</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="px-3 py-1.5 text-sm" onClick={onClose}>Cancel</button>
          <button className="px-3 py-1.5 text-sm bg-ink-900 text-white rounded-md" disabled={mutation.isPending}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RoleRow } from "../lib/types";

export default function RolesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api<{ items: RoleRow[] }>("/api/iam/roles") });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/api/iam/roles", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["roles"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/iam/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    create.mutate({ code: fd.get("code"), name: fd.get("name"), description: fd.get("description") });
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="font-serif text-2xl">Roles</h2>
          <p className="text-sm text-ink-700">System roles cannot be deleted. Super Admin bypasses the matrix.</p>
        </div>
        {can("role", "create") ? (
          <button className="rounded-md bg-ink-900 text-white px-4 py-2 text-sm" onClick={() => setOpen(true)}>
            New role
          </button>
        ) : null}
      </div>
      <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-wider text-ink-700">
            <tr>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3">Grants</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(roles.data?.items || []).map((r) => (
              <tr key={r.id} className="border-t border-ink-100">
                <td className="px-4 py-3">
                  <Link to={`/iam/roles/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                  {r.is_system ? <span className="ml-2 text-xs text-gold-500">system</span> : null}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
                <td className="px-4 py-3">{r.user_count}</td>
                <td className="px-4 py-3">{r.permission_count}</td>
                <td className="px-4 py-3 text-right">
                  {can("role", "delete") && !r.is_system ? (
                    <button className="text-red-700" onClick={() => remove.mutate(r.id)}>Delete</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-10">
          <form className="bg-white rounded-xl w-full max-w-md p-6 space-y-3" onSubmit={onSubmit}>
            <h3 className="font-serif text-xl">New role</h3>
            <label className="text-sm block">Code<input required name="code" placeholder="vice_principal" className="mt-1 w-full border rounded-md px-2 py-1.5" /></label>
            <label className="text-sm block">Name<input required name="name" className="mt-1 w-full border rounded-md px-2 py-1.5" /></label>
            <label className="text-sm block">Description<input name="description" className="mt-1 w-full border rounded-md px-2 py-1.5" /></label>
            {create.error ? <p className="text-sm text-red-700">{(create.error as Error).message}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button className="bg-ink-900 text-white rounded-md px-3 py-1.5 text-sm">Create</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

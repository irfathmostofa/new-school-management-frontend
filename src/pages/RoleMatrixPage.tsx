import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

type CatalogItem = {
  id: number;
  module: string;
  module_name: string;
  resource: string;
  action: string;
  action_label: string;
};

type MatrixPayload = {
  role: { id: number; code: string; name: string; is_system: number };
  catalog: CatalogItem[];
  granted: { permission_id: number; condition: string | null }[];
};

export default function RoleMatrixPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const data = useQuery({
    queryKey: ["role-matrix", id],
    queryFn: () => api<MatrixPayload>(`/api/iam/roles/${id}/permissions`),
  });
  const [selected, setSelected] = useState<Set<number> | null>(null);

  const granted = useMemo(() => {
    if (selected) return selected;
    return new Set((data.data?.granted || []).map((g) => g.permission_id));
  }, [selected, data.data]);

  const grouped = useMemo(() => {
    const map = new Map<string, { module: string; module_name: string; resource: string; actions: CatalogItem[] }>();
    for (const item of data.data?.catalog || []) {
      const key = `${item.module}:${item.resource}`;
      if (!map.has(key)) map.set(key, { module: item.module, module_name: item.module_name, resource: item.resource, actions: [] });
      map.get(key)!.actions.push(item);
    }
    return [...map.values()];
  }, [data.data]);

  const save = useMutation({
    mutationFn: () =>
      api(`/api/iam/roles/${id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permission_ids: [...granted] }),
      }),
    onSuccess: () => {
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["role-matrix", id] });
      qc.invalidateQueries({ queryKey: ["roles"] });
    },
  });

  function toggle(pid: number) {
    const next = new Set(granted);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    setSelected(next);
  }

  if (!data.data) return <p>Loading…</p>;
  const role = data.data.role;
  const writable = can("permission", "approve");

  return (
    <div className="space-y-5">
      <Link to="/iam/roles" className="text-sm text-ink-700 hover:underline">Back to roles</Link>
      <div className="flex justify-between items-end">
        <div>
          <h2 className="font-serif text-2xl">{role.name}</h2>
          <p className="text-sm text-ink-700 font-mono">{role.code}</p>
        </div>
        {writable ? (
          <button className="rounded-md bg-ink-900 text-white px-4 py-2 text-sm" onClick={() => save.mutate()} disabled={save.isPending}>
            Save matrix
          </button>
        ) : null}
      </div>
      <div className="bg-white border border-ink-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-wider text-ink-700">
            <tr>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Resource</th>
              {["view", "create", "update", "delete", "approve", "export", "print"].map((a) => (
                <th key={a} className="px-3 py-3 text-center">{a}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map((row) => (
              <tr key={`${row.module}-${row.resource}`} className="border-t border-ink-100">
                <td className="px-4 py-2">{row.module_name}</td>
                <td className="px-4 py-2 font-mono text-xs">{row.resource}</td>
                {["view", "create", "update", "delete", "approve", "export", "print"].map((action) => {
                  const item = row.actions.find((a) => a.action === action);
                  return (
                    <td key={action} className="text-center">
                      {item ? (
                        <input
                          type="checkbox"
                          disabled={!writable}
                          checked={granted.has(item.id)}
                          onChange={() => toggle(item.id)}
                        />
                      ) : (
                        <span className="text-ink-200">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

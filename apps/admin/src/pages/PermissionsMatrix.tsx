import { useQuery } from "@tanstack/react-query";
import { fetchLookups, listEntities } from "../api";
import { useMemo } from "react";

type Role = { id: number; code: string; name: string };
type Perm = { id: number; module_id: number; resource: string; action_id: number };
type RP = { role_id: number; permission_id: number };
type Mod = { id: number; code: string; name: string };

export function PermissionsMatrix() {
  const roles = useQuery({ queryKey: ["roles-all"], queryFn: () => listEntities<Role>("role", { pageSize: 100 }) });
  const perms = useQuery({
    queryKey: ["perms-all"],
    queryFn: () => listEntities<Perm>("permission", { pageSize: 100 }),
  });
  const rps = useQuery({
    queryKey: ["rp-all"],
    queryFn: () => listEntities<RP>("role_permission", { pageSize: 500 }),
  });
  const mods = useQuery({
    queryKey: ["mods-all"],
    queryFn: () => listEntities<Mod>("module", { pageSize: 50 }),
  });
  const lookups = useQuery({ queryKey: ["lookups"], queryFn: fetchLookups });

  const actionLabel = useMemo(() => {
    const t = lookups.data?.data.find((x) => x.code === "permission_action");
    const m = new Map<number, string>();
    for (const v of t?.values ?? []) m.set(v.id, v.code);
    return m;
  }, [lookups.data]);

  const modName = useMemo(() => {
    const m = new Map<number, string>();
    for (const x of mods.data?.data ?? []) m.set(x.id, x.name);
    return m;
  }, [mods.data]);

  const granted = useMemo(() => {
    const s = new Set<string>();
    for (const r of rps.data?.data ?? []) s.add(`${r.role_id}:${r.permission_id}`);
    return s;
  }, [rps.data]);

  const grouped = useMemo(() => {
    const g = new Map<string, Perm[]>();
    for (const p of perms.data?.data ?? []) {
      const key = `${modName.get(p.module_id) ?? p.module_id} / ${p.resource}`;
      const arr = g.get(key) ?? [];
      arr.push(p);
      g.set(key, arr);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [perms.data, modName]);

  const roleList = roles.data?.data ?? [];

  return (
    <div className="px-8 py-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-terracotta-600">IAM</p>
      <h1 className="mt-1 font-display text-3xl">Permission matrix</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-700">
        Module + resource + action. Super Admin is seeded with every permission. Conditions on
        role_permission can later restrict rows (own campus, own class).
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-paper-300 bg-paper-50 shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-paper-200 font-mono text-[11px] uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">Resource</th>
              {roleList.map((r) => (
                <th key={r.id} className="px-3 py-2 text-left">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(([key, plist]) => (
              <tr key={key} className="border-t border-paper-200">
                <td className="px-3 py-2 align-top">
                  <div className="font-medium">{key}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {plist.map((p) => (
                      <span key={p.id} className="rounded bg-paper-200 px-1.5 font-mono text-[10px]">
                        {actionLabel.get(p.action_id) ?? p.action_id}
                      </span>
                    ))}
                  </div>
                </td>
                {roleList.map((r) => {
                  const n = plist.filter((p) => granted.has(`${r.id}:${p.id}`)).length;
                  return (
                    <td key={r.id} className="px-3 py-2 align-top">
                      <span className={n === plist.length ? "text-pine-700" : n ? "text-brass-500" : "text-ink-400"}>
                        {n}/{plist.length}
                      </span>
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

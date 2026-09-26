import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type Item = { id: number; module: string; module_name: string; resource: string; action: string; action_label: string };

export default function PermissionsPage() {
  const q = useQuery({
    queryKey: ["permissions"],
    queryFn: () => api<{ items: Item[] }>("/api/iam/permissions"),
  });
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-2xl">Permission catalog</h2>
        <p className="text-sm text-ink-700">module + resource + action. Grants are assigned on a role.</p>
      </div>
      <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-wider text-ink-700">
            <tr>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Resource</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.items || []).map((p) => (
              <tr key={p.id} className="border-t border-ink-100">
                <td className="px-4 py-2">{p.module_name}</td>
                <td className="px-4 py-2 font-mono text-xs">{p.resource}</td>
                <td className="px-4 py-2">{p.action_label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

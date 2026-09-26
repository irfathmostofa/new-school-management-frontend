import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Paginated } from "../lib/types";

type Device = {
  id: number;
  platform_label: string;
  push_token: string;
  last_seen_at: string | null;
  email: string;
  first_name: string;
  last_name: string | null;
};

export default function DevicesPage() {
  const q = useQuery({
    queryKey: ["devices"],
    queryFn: () => api<Paginated<Device>>("/api/iam/devices"),
  });
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-2xl">Devices</h2>
        <p className="text-sm text-ink-700">Push tokens. Legacy device columns are not migrated.</p>
      </div>
      <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-wider text-ink-700">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Platform</th>
              <th className="px-4 py-3">Token</th>
              <th className="px-4 py-3">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.items || []).map((d) => (
              <tr key={d.id} className="border-t border-ink-100">
                <td className="px-4 py-2">{[d.first_name, d.last_name].filter(Boolean).join(" ")} · {d.email}</td>
                <td className="px-4 py-2">{d.platform_label}</td>
                <td className="px-4 py-2 font-mono text-xs">{d.push_token.slice(0, 20)}…</td>
                <td className="px-4 py-2">{d.last_seen_at || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

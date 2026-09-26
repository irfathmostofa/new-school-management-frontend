import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Paginated, RoleRow, UserRow } from "../lib/types";

export default function OverviewPage() {
  const { user, can } = useAuth();
  const users = useQuery({
    queryKey: ["users-count"],
    queryFn: () => api<Paginated<UserRow>>("/api/iam/users?pageSize=1"),
    enabled: can("user", "view"),
  });
  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => api<{ items: RoleRow[] }>("/api/iam/roles"),
    enabled: can("role", "view"),
  });

  const cards = [
    { label: "Users", value: users.data?.total ?? "—", to: "/iam/users" },
    { label: "Roles", value: roles.data?.items.length ?? "—", to: "/iam/roles" },
    { label: "Your grants", value: user?.permissions.length ?? 0, to: "/iam/permissions" },
  ];

  return (
    <div className="space-y-8">
      <p className="text-ink-700">
        Signed in as {user?.display_name} ({user?.is_super_admin ? "Super Admin" : user?.roles[0]?.name}).
        Credentials live in Neon Auth; this schema holds school identity and the permission matrix.
      </p>
      <div className="grid grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="bg-white border border-ink-200 rounded-xl p-5 hover:border-ink-700">
            <p className="text-xs uppercase tracking-widest text-ink-700">{c.label}</p>
            <p className="font-serif text-3xl mt-2">{c.value}</p>
          </Link>
        ))}
      </div>
      <div className="bg-white border border-ink-200 rounded-xl p-5">
        <h2 className="font-serif text-xl">Assigned roles</h2>
        <ul className="mt-3 text-sm space-y-2">
          {user?.roles.map((r) => (
            <li key={r.id}>
              {r.name}
              {r.campus_name ? ` · ${r.campus_name}` : " · all campuses"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

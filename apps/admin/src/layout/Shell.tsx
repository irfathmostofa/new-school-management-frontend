import { NavLink, Outlet, useLocation } from "react-router-dom";
import { entities, navGroups } from "@sms/crud-engine";
import { useState } from "react";
import { useAuth } from "../auth";

const extra = [
  { to: "/lookups", label: "Lookup manager" },
  { to: "/iam/permissions", label: "Permission matrix" },
  { to: "/shared/simulate", label: "Rule simulator" },
  { to: "/admission/enrol", label: "Enrol from application" },
];

export function Shell() {
  const loc = useLocation();
  const { user, me, signOut } = useAuth();
  const display =
    [me?.person?.first_name, me?.person?.last_name].filter(Boolean).join(" ") || user?.name || user?.email || "Staff";
  const role = me?.roles?.[0]?.name || "Staff";
  const [open, setOpen] = useState<Record<string, boolean>>({
    platform: false,
    iam: false,
    shared: false,
    front: true,
    admission: true,
    student: true,
    calendar: true,
  });

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-paper-300 bg-ink-950 text-paper-100">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="font-display text-xl tracking-tight text-paper-50">Rooh SMS</div>
          <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-brass-400">
            Admin · Phase 2
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 text-sm">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `mb-3 block rounded-md px-3 py-2 ${isActive ? "bg-white/10 text-paper-50" : "text-ink-400 hover:bg-white/5 hover:text-paper-100"}`
            }
          >
            Dashboard
          </NavLink>
          {navGroups.map((g) => (
            <div key={g.id} className="mb-3">
              <button
                type="button"
                onClick={() => setOpen((s) => ({ ...s, [g.id]: !s[g.id] }))}
                className="flex w-full items-center justify-between px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400"
              >
                {g.label}
                <span>{open[g.id] ? "–" : "+"}</span>
              </button>
              {open[g.id] &&
                g.items.map((item) => {
                  const e = entities[item.entity];
                  const to = `/entities/${item.entity}`;
                  const active = loc.pathname.startsWith(to);
                  return (
                    <NavLink
                      key={item.entity}
                      to={to}
                      className={`block rounded-md px-3 py-1.5 ${active ? "bg-pine-700 text-paper-50" : "text-ink-400 hover:bg-white/5 hover:text-paper-100"}`}
                    >
                      {e.titlePlural}
                    </NavLink>
                  );
                })}
            </div>
          ))}
          <div className="mb-3">
            <div className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
              Tools
            </div>
            {extra.map((x) => (
              <NavLink
                key={x.to}
                to={x.to}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-1.5 ${isActive ? "bg-pine-700 text-paper-50" : "text-ink-400 hover:bg-white/5 hover:text-paper-100"}`
                }
              >
                {x.label}
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="border-t border-white/10 px-5 py-4">
          <div className="font-mono text-[11px] text-ink-400">
            {display} · {role}
          </div>
          <button type="button" onClick={() => void signOut()} className="mt-2 text-[11px] text-brass-400 underline">
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}

import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

const nav = [
  { to: "/", label: "Overview", end: true },
  { to: "/iam/users", label: "Users" },
  { to: "/iam/roles", label: "Roles" },
  { to: "/iam/permissions", label: "Permissions" },
  { to: "/iam/devices", label: "Devices" },
];

export default function AppShell() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const links = nav.filter((item) => {
    if (item.to === "/") return true;
    if (item.to.includes("/users")) return can("user", "view");
    if (item.to.includes("/roles")) return can("role", "view");
    if (item.to.includes("/permissions")) return can("permission", "view");
    if (item.to.includes("/devices")) return can("user_device", "view");
    return true;
  });

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <aside className="bg-ink-900 text-ink-50 flex flex-col">
        <div className="px-5 py-6 border-b border-white/10">
          <p className="font-serif text-xl tracking-tight">SMS</p>
          <p className="text-xs text-ink-200 mt-1">Identity &amp; Access</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm ${
                  isActive ? "bg-white/10 text-white" : "text-ink-200 hover:bg-white/5"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10 text-xs">
          <p className="font-medium">{user?.display_name}</p>
          <p className="text-ink-200 truncate">{user?.email}</p>
          <button
            className="mt-3 text-gold-400 hover:underline"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0">
        <div className="border-b border-ink-200 bg-white px-8 py-4">
          <p className="text-xs uppercase tracking-widest text-ink-700">Admin / Staff</p>
          <h1 className="font-serif text-2xl">Identity &amp; Access</h1>
        </div>
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

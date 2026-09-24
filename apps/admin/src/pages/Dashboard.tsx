import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchDashboard } from "../api";

const cards: { key: string; label: string; to: string }[] = [
  { key: "campuses", label: "Campuses", to: "/entities/campus" },
  { key: "sessions", label: "Sessions", to: "/entities/academic_session" },
  { key: "class_levels", label: "Class levels", to: "/entities/class_level" },
  { key: "subjects", label: "Subjects", to: "/entities/subject" },
  { key: "people", label: "People", to: "/entities/person" },
  { key: "roles", label: "Roles", to: "/entities/role" },
  { key: "users", label: "Users", to: "/entities/app_user" },
  { key: "rules", label: "Rules", to: "/entities/rule" },
  { key: "workflows", label: "Workflows", to: "/entities/workflow" },
  { key: "lookups", label: "Lookup types", to: "/lookups" },
  { key: "modules", label: "Modules", to: "/entities/module" },
  { key: "offerings", label: "Offerings", to: "/entities/class_offering" },
  { key: "students", label: "Students", to: "/entities/student" },
  { key: "enrollments", label: "Enrolments", to: "/entities/enrollment" },
  { key: "applications", label: "Applications", to: "/entities/application" },
  { key: "enquiries", label: "Enquiries", to: "/entities/enquiry" },
];

export function Dashboard() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  const data = q.data?.data;
  const session = data?.current_session as { name?: string; code?: string; starts_on?: string; ends_on?: string } | null;

  return (
    <div className="rule-grid min-h-screen px-8 py-8">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-terracotta-600">Phase 2</p>
          <h1 className="mt-1 font-display text-4xl text-ink-950">School administration</h1>
          <p className="mt-2 max-w-xl text-ink-700">
            Calendar, students, admission and front office are live. Convert an accepted application
            into a roll number without copying names — IDs only.
          </p>
        </div>
        {session && (
          <div className="rounded-lg border border-paper-300 bg-paper-50 px-5 py-3 shadow-card">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-500">Current session</div>
            <div className="font-display text-lg">{session.name}</div>
            <div className="font-mono text-xs text-ink-500">
              {session.code} · {session.starts_on} → {session.ends_on}
            </div>
          </div>
        )}
      </header>

      {q.isLoading && <p className="text-ink-500">Loading…</p>}
      {q.error && <p className="text-terracotta-600">{(q.error as Error).message}</p>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.key}
            to={c.to}
            className="rounded-lg border border-paper-300 bg-paper-50 p-4 shadow-card transition hover:-translate-y-0.5 hover:border-pine-500"
          >
            <div className="font-mono text-3xl text-ink-950">{data?.counts[c.key] ?? "—"}</div>
            <div className="mt-1 text-sm text-ink-700">{c.label}</div>
          </Link>
        ))}
      </div>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-paper-300 bg-paper-50 p-5 shadow-card">
          <h2 className="font-display text-xl">Delivery order</h2>
          <ol className="mt-3 space-y-2 text-sm text-ink-700">
            <li><span className="font-mono text-pine-600">0–1</span> Neon, monorepo, lookups, IAM, settings, rules</li>
            <li><span className="font-mono text-pine-600">2</span> Calendar, students, admission, front office</li>
            <li><span className="font-mono text-ink-400">3</span> Academic, attendance, devices</li>
            <li><span className="font-mono text-ink-400">4–5</span> Exams, fees, payments, accounts</li>
            <li><span className="font-mono text-ink-400">6–8</span> HR / payroll, support ops, portals</li>
          </ol>
        </div>
        <div className="rounded-lg border border-paper-300 bg-paper-50 p-5 shadow-card">
          <h2 className="font-display text-xl">Start here</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link className="text-pine-600 underline" to="/lookups">
                Review seeded lookup types
              </Link>{" "}
              — statuses, gender, religion, permission actions.
            </li>
            <li>
              <Link className="text-pine-600 underline" to="/entities/campus">
                Confirm campuses and the current session
              </Link>
              .
            </li>
            <li>
              <Link className="text-pine-600 underline" to="/entities/rule">
                Draft attendance-deduction rules
              </Link>{" "}
              then simulate them.
            </li>
            <li>
              <Link className="text-pine-600 underline" to="/admission/enrol">
                Enrol Nadia Islam's accepted Grade 1 application
              </Link>
              .
            </li>
            <li>
              <Link className="text-pine-600 underline" to="/iam/permissions">
                Inspect the Super Admin permission matrix
              </Link>
              .
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

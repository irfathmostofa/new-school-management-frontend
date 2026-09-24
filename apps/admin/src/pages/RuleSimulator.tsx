import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listEntities } from "../api";

type Rule = {
  id: number;
  name: string;
  priority: number;
  condition: unknown;
  actions: unknown;
  status_id: number;
};

function evalJsonLogic(logic: unknown, data: Record<string, number>): boolean {
  if (logic == null || (typeof logic === "object" && !Array.isArray(logic) && Object.keys(logic as object).length === 0)) {
    return true;
  }
  if (typeof logic !== "object" || logic === null || Array.isArray(logic)) return Boolean(logic);
  const obj = logic as Record<string, unknown>;
  const op = Object.keys(obj)[0];
  const arg = obj[op];
  const val = (x: unknown): unknown => {
    if (x && typeof x === "object" && !Array.isArray(x) && "var" in (x as object)) {
      return data[String((x as { var: string }).var)] ?? 0;
    }
    return x;
  };
  const pair = Array.isArray(arg) ? arg : [arg];
  const a = val(pair[0]);
  const b = val(pair[1]);
  switch (op) {
    case ">=":
      return Number(a) >= Number(b);
    case ">":
      return Number(a) > Number(b);
    case "<=":
      return Number(a) <= Number(b);
    case "<":
      return Number(a) < Number(b);
    case "==":
      return a == b;
    case "!=":
      return a != b;
    case "and":
      return (arg as unknown[]).every((x) => evalJsonLogic(x, data));
    case "or":
      return (arg as unknown[]).some((x) => evalJsonLogic(x, data));
    default:
      return false;
  }
}

export function RuleSimulator() {
  const rules = useQuery({
    queryKey: ["rules-sim"],
    queryFn: () => listEntities<Rule>("rule", { pageSize: 100, sort: "priority", dir: "asc" }),
  });
  const [late, setLate] = useState(3);
  const [absent, setAbsent] = useState(0);

  const facts = useMemo(() => ({ late_count: late, absent_days: absent }), [late, absent]);
  const results = (rules.data?.data ?? []).map((r) => ({
    rule: r,
    matched: evalJsonLogic(r.condition, facts),
  }));

  return (
    <div className="px-8 py-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-terracotta-600">Rules</p>
      <h1 className="mt-1 font-display text-3xl">Rule simulator</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-700">
        Feed facts the payroll engine would collect and see which draft / published rules match.
        No money is posted — this is explainability only.
      </p>

      <div className="mt-6 grid max-w-lg grid-cols-2 gap-4 rounded-lg border border-paper-300 bg-paper-50 p-5 shadow-card">
        <label className="text-sm">
          Late count
          <input
            type="number"
            min={0}
            value={late}
            onChange={(e) => setLate(Number(e.target.value))}
            className="mt-1 w-full rounded border border-paper-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Absent days
          <input
            type="number"
            min={0}
            value={absent}
            onChange={(e) => setAbsent(Number(e.target.value))}
            className="mt-1 w-full rounded border border-paper-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="mt-6 space-y-3">
        {results.map(({ rule, matched }) => (
          <div
            key={rule.id}
            className={`rounded-lg border p-4 ${matched ? "border-pine-500 bg-pine-500/10" : "border-paper-300 bg-paper-50"}`}
          >
            <div className="flex items-center justify-between">
              <div className="font-medium">{rule.name}</div>
              <span className="font-mono text-xs">{matched ? "MATCH" : "no match"}</span>
            </div>
            <pre className="mt-2 overflow-x-auto font-mono text-[11px] text-ink-700">
              {JSON.stringify({ condition: rule.condition, actions: rule.actions }, null, 2)}
            </pre>
          </div>
        ))}
        {results.length === 0 && <p className="text-ink-500">No rules yet.</p>}
      </div>
    </div>
  );
}

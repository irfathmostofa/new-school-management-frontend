import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { entities, type FieldConfig } from "@sms/crud-engine";
import { fetchLookups, fetchOptions, listEntities } from "../api";
import { useMemo } from "react";

export function EntityList({ entityKey }: { entityKey: string }) {
  const cfg = entities[entityKey];
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get("page") || 1);
  const q = sp.get("q") || "";
  const pageSize = 20;

  const list = useQuery({
    queryKey: ["entity", entityKey, page, q],
    queryFn: () => listEntities<Record<string, unknown>>(entityKey, { page, pageSize, q }),
  });
  const lookups = useQuery({ queryKey: ["lookups"], queryFn: fetchLookups });
  const fkCols = (cfg?.fields ?? []).filter(
    (f) => f.type === "fk" && f.fkEntity && (cfg?.listColumns ?? []).includes(f.name),
  );
  const fkMap = useQuery({
    queryKey: ["list-fk", entityKey, fkCols.map((f) => f.fkEntity).join(",")],
    queryFn: async () => {
      const entries = await Promise.all(
        fkCols.map(async (f) => {
          const r = await fetchOptions(f.fkEntity!, f.fkLabel || "name");
          return [f.name, new Map(r.data.map((o) => [o.id, o.label]))] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, Map<number, string>>;
    },
    enabled: fkCols.length > 0,
  });

  const lookupIndex = useMemo(() => {
    const m = new Map<number, { label: string; type: string }>();
    for (const t of lookups.data?.data ?? []) {
      for (const v of t.values) m.set(v.id, { label: v.label, type: t.code });
    }
    return m;
  }, [lookups.data]);

  if (!cfg) return <p className="p-8">Unknown entity</p>;

  const total = list.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const fieldsByName = Object.fromEntries(cfg.fields.map((f) => [f.name, f])) as Record<
    string,
    FieldConfig
  >;

  function cell(row: Record<string, unknown>, col: string) {
    const f = fieldsByName[col];
    const v = row[col];
    if (v == null || v === "") return <span className="text-ink-400">—</span>;
    if (f?.type === "boolean") return v ? "yes" : "no";
    if (f?.type === "lookup" && typeof v === "number") {
      return lookupIndex.get(v)?.label ?? v;
    }
    if (f?.type === "fk" && typeof v === "number") {
      return fkMap.data?.[col]?.get(v) ?? v;
    }
    if (f?.type === "json") return <span className="font-mono text-xs">{JSON.stringify(v)}</span>;
    if (f?.type === "datetime") return String(v).replace("T", " ").slice(0, 16);
    return String(v);
  }

  return (
    <div className="px-8 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-terracotta-600">
            {cfg.table}
          </p>
          <h1 className="mt-1 font-display text-3xl">{cfg.titlePlural}</h1>
          {cfg.description && <p className="mt-1 text-sm text-ink-700">{cfg.description}</p>}
        </div>
        <Link
          to={`/entities/${entityKey}/new`}
          className="rounded bg-ink-950 px-4 py-2 text-sm text-paper-50"
        >
          New {cfg.title.toLowerCase()}
        </Link>
      </div>

      {cfg.searchFields.length > 0 && (
        <form
          className="mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setSp({ q: String(fd.get("q") || ""), page: "1" });
          }}
        >
          <input
            name="q"
            defaultValue={q}
            placeholder={`Search ${cfg.searchFields.join(", ")}`}
            className="w-full max-w-md rounded border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          />
        </form>
      )}

      {list.isLoading && <p className="text-ink-500">Loading…</p>}
      {list.error && <p className="text-terracotta-600">{(list.error as Error).message}</p>}

      <div className="overflow-x-auto rounded-lg border border-paper-300 bg-paper-50 shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-paper-200 font-mono text-[11px] uppercase tracking-wider text-ink-700">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              {cfg.listColumns.map((c) => (
                <th key={c} className="px-3 py-2 text-left">
                  {fieldsByName[c]?.label ?? c}
                </th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(list.data?.data ?? []).map((row) => (
              <tr
                key={String(row.id ?? `${row.role_id}:${row.permission_id}`)}
                className="border-t border-paper-200 hover:bg-paper-100"
              >
                <td className="px-3 py-2 font-mono text-xs text-ink-500">
                  {String(row.id ?? `${row.role_id}:${row.permission_id}`)}
                </td>
                {cfg.listColumns.map((c) => (
                  <td key={c} className="px-3 py-2">
                    {cell(row, c)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  {row.id != null && (
                    <Link className="text-pine-600 underline" to={`/entities/${entityKey}/${row.id}`}>
                      Edit
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {(list.data?.data ?? []).length === 0 && !list.isLoading && (
              <tr>
                <td colSpan={cfg.listColumns.length + 2} className="px-3 py-8 text-center text-ink-500">
                  No records
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3 text-sm text-ink-700">
        <span className="font-mono text-xs">
          {total} row{total === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setSp({ q, page: String(page - 1) })}
          className="rounded border border-paper-300 px-2 py-1 disabled:opacity-40"
        >
          Prev
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => setSp({ q, page: String(page + 1) })}
          className="rounded border border-paper-300 px-2 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

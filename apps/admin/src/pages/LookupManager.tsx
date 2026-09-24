import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { createLookupValue, fetchLookups, updateLookupValue, type LookupType } from "../api";

export function LookupManager() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lookups"], queryFn: fetchLookups });
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState({ code: "", label: "", sort_order: 0, is_final: false });

  const types = q.data?.data ?? [];
  const filtered = useMemo(() => {
    const n = filter.toLowerCase();
    return types.filter(
      (t) => !n || t.code.includes(n) || t.name.toLowerCase().includes(n),
    );
  }, [types, filter]);

  const current: LookupType | undefined =
    types.find((t) => t.code === selected) ?? filtered[0];

  const add = useMutation({
    mutationFn: () => createLookupValue(current!.code, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lookups"] });
      setForm({ code: "", label: "", sort_order: 0, is_final: false });
    },
  });

  const toggle = useMutation({
    mutationFn: (v: { id: number; is_active: boolean }) =>
      updateLookupValue(v.id, { is_active: !v.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lookups"] }),
  });

  return (
    <div className="px-8 py-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-terracotta-600">Core</p>
      <h1 className="mt-1 font-display text-3xl">Lookup manager</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-700">
        Every enum-like value and status lives here. Admins can extend types; system codes stay
        locked because application code references them.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="rounded-lg border border-paper-300 bg-paper-50 p-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter types…"
            className="mb-2 w-full rounded border border-paper-300 bg-white px-3 py-2 text-sm"
          />
          <div className="max-h-[70vh] overflow-y-auto">
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t.code)}
                className={`mb-1 flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm ${
                  current?.code === t.code ? "bg-ink-950 text-paper-50" : "hover:bg-paper-200"
                }`}
              >
                <span>
                  <span className="block font-medium">{t.name}</span>
                  <span className="font-mono text-[11px] opacity-70">{t.code}</span>
                </span>
                <span className="font-mono text-[11px]">{t.values.length}</span>
              </button>
            ))}
          </div>
        </div>

        {current && (
          <div>
            <div className="mb-4 flex items-center gap-2">
              {current.is_status && (
                <span className="rounded-full bg-terracotta-500/15 px-2 py-0.5 text-xs text-terracotta-600">
                  status set
                </span>
              )}
              {current.is_system && (
                <span className="rounded-full bg-pine-500/15 px-2 py-0.5 text-xs text-pine-700">system</span>
              )}
            </div>
            <table className="w-full overflow-hidden rounded-lg border border-paper-300 bg-paper-50 text-sm">
              <thead className="bg-paper-200 font-mono text-[11px] uppercase tracking-wider text-ink-700">
                <tr>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Label</th>
                  <th className="px-3 py-2 text-left">Order</th>
                  <th className="px-3 py-2 text-left">Final</th>
                  <th className="px-3 py-2 text-left">Active</th>
                </tr>
              </thead>
              <tbody>
                {current.values.map((v) => (
                  <tr key={v.id} className="border-t border-paper-200">
                    <td className="px-3 py-2 font-mono text-xs">{v.code}</td>
                    <td className="px-3 py-2">{v.label}</td>
                    <td className="px-3 py-2">{v.sort_order}</td>
                    <td className="px-3 py-2">{v.is_final ? "yes" : "—"}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={v.is_system}
                        onClick={() => toggle.mutate({ id: v.id, is_active: v.is_active })}
                        className={`rounded px-2 py-0.5 text-xs ${v.is_active ? "bg-pine-500/15 text-pine-700" : "bg-paper-200 text-ink-500"}`}
                      >
                        {v.is_active ? "active" : "off"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <form
              className="mt-6 grid grid-cols-2 gap-3 rounded-lg border border-dashed border-paper-300 bg-paper-50 p-4 md:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (current) add.mutate();
              }}
            >
              <input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="code"
                className="rounded border border-paper-300 bg-white px-3 py-2 font-mono text-sm"
              />
              <input
                required
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="label"
                className="rounded border border-paper-300 bg-white px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                className="rounded border border-paper-300 bg-white px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_final}
                  onChange={(e) => setForm({ ...form, is_final: e.target.checked })}
                />
                Terminal status
              </label>
              <button
                type="submit"
                className="col-span-2 rounded bg-ink-950 px-4 py-2 text-sm text-paper-50 md:col-span-4"
              >
                Add value to {current.code}
              </button>
              {add.error && (
                <p className="col-span-full text-sm text-terracotta-600">{(add.error as Error).message}</p>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

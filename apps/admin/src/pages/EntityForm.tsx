import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { entities, type FieldConfig } from "@sms/crud-engine";
import { createEntity, fetchLookups, fetchOptions, getEntity, updateEntity } from "../api";

function emptyValue(f: FieldConfig): unknown {
  if (f.default !== undefined) return f.default;
  if (f.type === "boolean") return false;
  if (f.type === "json") return f.name === "actions" ? [] : {};
  return "";
}

export function EntityForm({ entityKey }: { entityKey: string }) {
  const cfg = entities[entityKey];
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const qc = useQueryClient();

  const existing = useQuery({
    queryKey: ["entity-one", entityKey, id],
    queryFn: () => getEntity<Record<string, unknown>>(entityKey, id!),
    enabled: !isNew,
  });
  const lookups = useQuery({ queryKey: ["lookups"], queryFn: fetchLookups });

  const fkFields = (cfg?.fields ?? []).filter((f) => f.type === "fk" && f.fkEntity);
  const optionQueries = useQuery({
    queryKey: ["fk-options", entityKey, fkFields.map((f) => f.fkEntity).join(",")],
    queryFn: async () => {
      const entries = await Promise.all(
        fkFields.map(async (f) => {
          const r = await fetchOptions(f.fkEntity!, f.fkLabel || "name");
          return [f.name, r.data] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, { id: number; label: string }[]>;
    },
    enabled: Boolean(cfg) && fkFields.length > 0,
  });

  const [form, setForm] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cfg) return;
    if (isNew) {
      const init: Record<string, unknown> = {};
      for (const f of cfg.fields) init[f.name] = emptyValue(f);
      setForm(init);
    } else if (existing.data?.data) {
      setForm({ ...existing.data.data });
    }
  }, [isNew, existing.data, cfg]);

  const lookupByType = useMemo(() => {
    const m: Record<string, { id: number; label: string; code: string }[]> = {};
    for (const t of lookups.data?.data ?? []) {
      m[t.code] = t.values.filter((v) => v.is_active).map((v) => ({ id: v.id, label: v.label, code: v.code }));
    }
    return m;
  }, [lookups.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      for (const f of cfg.fields) {
        if (f.hiddenInForm) continue;
        let v = form[f.name];
        if (v === "") v = null;
        if (f.type === "number" && v != null && v !== "") v = Number(v);
        if (f.type === "json" && typeof v === "string") {
          v = v.trim() ? JSON.parse(v) : null;
        }
        payload[f.name] = v;
      }
      if (isNew) return createEntity(entityKey, payload);
      return updateEntity(entityKey, id!, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity", entityKey] });
      nav(`/entities/${entityKey}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!cfg) return <p className="p-8">Unknown entity</p>;

  function set(name: string, value: unknown) {
    setForm((s) => ({ ...s, [name]: value }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    save.mutate();
  }

  return (
    <div className="px-8 py-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-terracotta-600">{cfg.table}</p>
      <h1 className="mt-1 font-display text-3xl">
        {isNew ? `New ${cfg.title.toLowerCase()}` : `Edit ${cfg.title.toLowerCase()}`}
      </h1>
      <Link to={`/entities/${entityKey}`} className="mt-2 inline-block text-sm text-pine-600 underline">
        Back to list
      </Link>

      <form onSubmit={onSubmit} className="mt-6 max-w-2xl space-y-4 rounded-lg border border-paper-300 bg-paper-50 p-6 shadow-card">
        {cfg.fields.map((f) => {
          if (f.hiddenInForm) return null;
          const value = form[f.name];
          return (
            <label key={f.name} className="block">
              <span className="mb-1 block text-sm font-medium">
                {f.label}
                {f.required && <span className="text-terracotta-600"> *</span>}
              </span>
              {f.description && <span className="mb-1 block text-xs text-ink-500">{f.description}</span>}
              <FieldInput
                field={f}
                value={value}
                disabled={Boolean(f.readonly) && !isNew}
                onChange={(v) => set(f.name, v)}
                lookupOptions={f.lookupType ? lookupByType[f.lookupType] ?? [] : []}
                fkOptions={optionQueries.data?.[f.name] ?? []}
              />
            </label>
          );
        })}
        {error && <p className="text-sm text-terracotta-600">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" className="rounded bg-ink-950 px-4 py-2 text-sm text-paper-50" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
          <Link to={`/entities/${entityKey}`} className="rounded border border-paper-300 px-4 py-2 text-sm">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
  lookupOptions,
  fkOptions,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  lookupOptions: { id: number; label: string; code: string }[];
  fkOptions: { id: number; label: string }[];
}) {
  const cls = "w-full rounded border border-paper-300 bg-white px-3 py-2 text-sm disabled:bg-paper-200";
  if (field.type === "textarea") {
    return (
      <textarea
        required={field.required}
        disabled={disabled}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        rows={5}
        className={cls}
      />
    );
  }
  if (field.type === "boolean") {
    return (
      <input
        type="checkbox"
        disabled={disabled}
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  if (field.type === "number") {
    return (
      <input
        type="number"
        required={field.required}
        disabled={disabled}
        value={value === null || value === undefined ? "" : Number(value)}
        min={field.min}
        max={field.max}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className={cls}
      />
    );
  }
  if (field.type === "date") {
    return (
      <input
        type="date"
        required={field.required}
        disabled={disabled}
        value={String(value ?? "").slice(0, 10)}
        onChange={(e) => onChange(e.target.value)}
        className={cls}
      />
    );
  }
  if (field.type === "datetime") {
    const raw = String(value ?? "");
    const local = raw ? raw.slice(0, 16) : "";
    return (
      <input
        type="datetime-local"
        required={field.required}
        disabled={disabled}
        value={local}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : "")}
        className={cls}
      />
    );
  }
  if (field.type === "color") {
    return (
      <input
        type="color"
        disabled={disabled}
        value={typeof value === "string" && value ? value : "#888888"}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-16"
      />
    );
  }
  if (field.type === "lookup") {
    return (
      <select
        required={field.required}
        disabled={disabled}
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={cls}
      >
        <option value="">—</option>
        {lookupOptions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label} ({o.code})
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "fk") {
    return (
      <select
        required={field.required}
        disabled={disabled}
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={cls}
      >
        <option value="">—</option>
        {fkOptions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "json") {
    const text = typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);
    return (
      <textarea
        required={field.required}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            onChange(e.target.value);
          }
        }}
        rows={6}
        className={`${cls} font-mono text-xs`}
      />
    );
  }
  return (
    <input
      type={field.type === "email" ? "email" : "text"}
      required={field.required}
      disabled={disabled}
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className={cls}
    />
  );
}

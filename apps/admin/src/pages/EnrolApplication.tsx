import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { enrolApplication, fetchLookups, fetchOptions, listEntities } from "../api";

type AppRow = {
  id: number;
  applicant_person_id: number;
  class_level_id: number;
  session_id: number;
  campus_id: number;
  status_id: number;
  notes: string | null;
};

export function EnrolApplication() {
  const qc = useQueryClient();
  const apps = useQuery({
    queryKey: ["apps-enrol"],
    queryFn: () => listEntities<AppRow>("application", { pageSize: 100 }),
  });
  const lookups = useQuery({ queryKey: ["lookups"], queryFn: fetchLookups });
  const people = useQuery({ queryKey: ["opt-person"], queryFn: () => fetchOptions("person") });
  const levels = useQuery({ queryKey: ["opt-level"], queryFn: () => fetchOptions("class_level") });
  const sections = useQuery({ queryKey: ["opt-section"], queryFn: () => fetchOptions("class_section") });
  const houses = useQuery({ queryKey: ["opt-house"], queryFn: () => fetchOptions("house") });

  const statusCode = useMemo(() => {
    const t = lookups.data?.data.find((x) => x.code === "application_status");
    const m = new Map<number, string>();
    for (const v of t?.values ?? []) m.set(v.id, v.code);
    return m;
  }, [lookups.data]);
  const statusLabel = useMemo(() => {
    const t = lookups.data?.data.find((x) => x.code === "application_status");
    const m = new Map<number, string>();
    for (const v of t?.values ?? []) m.set(v.id, v.label);
    return m;
  }, [lookups.data]);
  const personName = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of people.data?.data ?? []) m.set(o.id, o.label);
    return m;
  }, [people.data]);
  const levelName = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of levels.data?.data ?? []) m.set(o.id, o.label);
    return m;
  }, [levels.data]);

  const enrolable = (apps.data?.data ?? []).filter((a) => {
    const c = statusCode.get(a.status_id);
    return c && !["enrolled", "rejected", "withdrawn", "draft"].includes(c);
  });

  const [appId, setAppId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [houseId, setHouseId] = useState<string>("");
  const [roll, setRoll] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);

  const mutate = useMutation({
    mutationFn: () =>
      enrolApplication(appId, {
        class_section_id: Number(sectionId),
        house_id: houseId ? Number(houseId) : null,
        roll_no: roll ? Number(roll) : null,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["apps-enrol"] });
      qc.invalidateQueries({ queryKey: ["entity", "student"] });
      qc.invalidateQueries({ queryKey: ["entity", "enrollment"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setMsg(`Enrolled ${String(r.data.student.student_code)} (student #${r.data.student.id})`);
    },
    onError: (e: Error) => setMsg(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    mutate.mutate();
  }

  return (
    <div className="px-8 py-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-terracotta-600">Admission</p>
      <h1 className="mt-1 font-display text-3xl">Enrol from application</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-700">
        Converts an accepted application into a student + current-session enrolment, copies guardians,
        marks the form sale used, and assigns STD-##### from the ID sequence.
      </p>

      <form onSubmit={onSubmit} className="mt-6 max-w-xl space-y-4 rounded-lg border border-paper-300 bg-paper-50 p-6 shadow-card">
        <label className="block text-sm">
          Application
          <select
            required
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            className="mt-1 w-full rounded border border-paper-300 bg-white px-3 py-2"
          >
            <option value="">—</option>
            {enrolable.map((a) => (
              <option key={a.id} value={a.id}>
                #{a.id} {personName.get(a.applicant_person_id) ?? "person"} · {levelName.get(a.class_level_id) ?? ""} ·{" "}
                {statusLabel.get(a.status_id)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Class section
          <select
            required
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className="mt-1 w-full rounded border border-paper-300 bg-white px-3 py-2"
          >
            <option value="">—</option>
            {(sections.data?.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          House
          <select
            value={houseId}
            onChange={(e) => setHouseId(e.target.value)}
            className="mt-1 w-full rounded border border-paper-300 bg-white px-3 py-2"
          >
            <option value="">—</option>
            {(houses.data?.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Roll no
          <input
            type="number"
            min={1}
            value={roll}
            onChange={(e) => setRoll(e.target.value)}
            className="mt-1 w-full rounded border border-paper-300 bg-white px-3 py-2"
          />
        </label>
        <button type="submit" disabled={mutate.isPending} className="rounded bg-ink-950 px-4 py-2 text-sm text-paper-50">
          {mutate.isPending ? "Enrolling…" : "Enrol student"}
        </button>
        {msg && <p className="text-sm text-pine-700">{msg}</p>}
      </form>

      <p className="mt-6 text-sm">
        <Link className="text-pine-600 underline" to="/entities/application">
          All applications
        </Link>
        {" · "}
        <Link className="text-pine-600 underline" to="/entities/student">
          Students
        </Link>
      </p>
    </div>
  );
}

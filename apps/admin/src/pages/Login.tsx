import { FormEvent, useState } from "react";
import { useAuth } from "../auth";

export function Login() {
  const { configured, signIn, signUp, error: authError } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "up") await signUp(email, password, name || email.split("@")[0]);
      else await signIn(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  if (!configured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-100 px-6">
        <div className="max-w-lg rounded-lg border border-paper-300 bg-paper-50 p-8 shadow-card">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-terracotta-600">Neon Data API</p>
          <h1 className="mt-2 font-display text-3xl">Connect a Neon project</h1>
          <p className="mt-3 text-sm text-ink-700">
            Copy <span className="font-mono text-xs">apps/admin/.env.example</span> to{" "}
            <span className="font-mono text-xs">apps/admin/.env</span> and set{" "}
            <span className="font-mono text-xs">VITE_NEON_DATABASE_URL</span> (HTTPS Neon database URL, not a
            Postgres connection string). Apply migrations <span className="font-mono text-xs">001–004</span>,
            expose schemas in Data API settings, then restart Vite.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-100 px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-lg border border-paper-300 bg-paper-50 p-8 shadow-card"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-terracotta-600">Rooh SMS</p>
        <h1 className="font-display text-3xl">{mode === "in" ? "Sign in" : "Create account"}</h1>
        <p className="text-sm text-ink-700">
          Neon Auth JWT is sent to the Data API. RLS maps <span className="font-mono text-xs">sub</span> to{" "}
          <span className="font-mono text-xs">iam.app_user</span>. The first login becomes Super Admin.
        </p>
        {mode === "up" && (
          <label className="block text-sm">
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-paper-300 bg-white px-3 py-2"
            />
          </label>
        )}
        <label className="block text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-paper-300 bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-paper-300 bg-white px-3 py-2"
          />
        </label>
        {(error || authError) && <p className="text-sm text-terracotta-600">{error || authError}</p>}
        <button type="submit" disabled={pending} className="w-full rounded bg-ink-950 px-4 py-2 text-sm text-paper-50">
          {pending ? "Working…" : mode === "in" ? "Sign in" : "Sign up"}
        </button>
        <button
          type="button"
          className="w-full text-sm text-pine-600 underline"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
        >
          {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}

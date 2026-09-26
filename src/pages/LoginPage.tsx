import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/";
  const [email, setEmail] = useState("admin@school.local");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-ink-50 px-4">
      <div className="w-full max-w-md bg-white border border-ink-200 rounded-2xl p-8 shadow-sm">
        <p className="text-xs uppercase tracking-widest text-ink-700">School Management System</p>
        <h1 className="font-serif text-3xl mt-2">Sign in</h1>
        <p className="text-sm text-ink-700 mt-2">
          Neon Auth in production. Local adapter for this preview.
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm">
            Email
            <input
              className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </label>
          <label className="block text-sm">
            Password
            <input
              className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button
            className="w-full rounded-md bg-ink-900 text-white py-2.5 text-sm font-medium disabled:opacity-60"
            disabled={busy}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="mt-6 text-xs text-ink-700 space-y-1 border-t border-ink-100 pt-4">
          <p>admin@school.local / Admin@123 — Super Admin</p>
          <p>staff@school.local / Staff@123 — Teacher</p>
        </div>
      </div>
    </div>
  );
}

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { bootstrapStaff, fetchMe, type SchoolMe } from "./api";
import { getNeon, neonConfigured, neonErrorMessage } from "./lib/neon";

type AuthUser = { id?: string; email?: string; name?: string };

type AuthState = {
  loading: boolean;
  configured: boolean;
  session: unknown;
  user: AuthUser | null;
  me: SchoolMe | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function afterAuth(name?: string): Promise<SchoolMe | null> {
  const parts = (name || "").trim().split(/\s+/);
  await bootstrapStaff(parts[0] || "Staff", parts.slice(1).join(" ") || undefined);
  return fetchMe();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<unknown>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [me, setMe] = useState<SchoolMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configured = neonConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error: err } = await getNeon().auth.getSession();
        if (cancelled) return;
        if (err) {
          setError(neonErrorMessage(err));
          setLoading(false);
          return;
        }
        if (data?.session && data?.user) {
          setSession(data.session);
          setUser(data.user as AuthUser);
          try {
            setMe(await afterAuth((data.user as AuthUser).name));
          } catch (e) {
            setError((e as Error).message);
          }
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      configured,
      session,
      user,
      me,
      error,
      signIn: async (email, password) => {
        setError(null);
        const result = await getNeon().auth.signIn.email({ email, password });
        if (result.error) throw new Error(neonErrorMessage(result.error));
        const sessionResult = await getNeon().auth.getSession();
        if (sessionResult.error) throw new Error(neonErrorMessage(sessionResult.error));
        setSession(sessionResult.data?.session ?? null);
        const nextUser = (sessionResult.data?.user ?? result.data?.user) as AuthUser | undefined;
        setUser(nextUser ?? null);
        setMe(await afterAuth(nextUser?.name));
      },
      signUp: async (email, password, name) => {
        setError(null);
        const result = await getNeon().auth.signUp.email({ email, password, name });
        if (result.error) throw new Error(neonErrorMessage(result.error));
        const sessionResult = await getNeon().auth.getSession();
        if (sessionResult.error) throw new Error(neonErrorMessage(sessionResult.error));
        setSession(sessionResult.data?.session ?? result.data ?? null);
        const nextUser = (sessionResult.data?.user ?? result.data?.user) as AuthUser | undefined;
        setUser(nextUser ?? null);
        setMe(await afterAuth(name));
      },
      signOut: async () => {
        await getNeon().auth.signOut();
        setSession(null);
        setUser(null);
        setMe(null);
      },
    }),
    [loading, configured, session, user, me, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

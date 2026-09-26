import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";
import type { SessionUser } from "./types";

type AuthState = {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (resource: string, action: string) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<SessionUser>("/api/auth/session")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      async login(email, password) {
        const session = await api<SessionUser>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setUser(session);
      },
      async logout() {
        await api("/api/auth/logout", { method: "POST" });
        setUser(null);
      },
      can(resource, action) {
        if (!user) return false;
        if (user.is_super_admin) return true;
        return user.permissions.some(
          (p) => p.module === "identity_access" && p.resource === resource && p.action === action
        );
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}

export function isUnauthorized(err: unknown) {
  return err instanceof ApiError && err.status === 401;
}

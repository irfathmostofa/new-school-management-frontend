import { createClient } from "@neondatabase/neon-js";

const databaseUrl = import.meta.env.VITE_NEON_DATABASE_URL as string | undefined;
const authUrl = import.meta.env.VITE_NEON_AUTH_URL as string | undefined;
const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL as string | undefined;

export function neonConfigured(): boolean {
  return Boolean(databaseUrl || (authUrl && dataApiUrl));
}

export const neon = neonConfigured()
  ? databaseUrl
    ? createClient(databaseUrl)
    : createClient({
        auth: { url: authUrl! },
        dataApi: { url: dataApiUrl! },
      })
  : null;

export function getNeon() {
  if (!neon) {
    throw new Error("Neon is not configured. Set VITE_NEON_DATABASE_URL in apps/admin/.env");
  }
  return neon;
}

export function neonErrorMessage(error: unknown): string {
  if (!error) return "Request failed";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const e = error as { message?: string; details?: string; hint?: string };
    return e.message || e.details || e.hint || "Request failed";
  }
  return "Request failed";
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, ApiError, setApiAuthToken, setAuthExpiredHandler } from "./api";
import { saveSession, loadSession, clearSession } from "./secureSession";

export interface Me {
  id: string;
  email: string;
  displayName: string | null;
  roles: string[];
  patientId: string | null;
  clinicianId: string | null;
}

type AuthStatus = "loading" | "signedOut" | "signedIn";

interface AuthContextValue {
  status: AuthStatus;
  me: Me | null;
  /** Populated only on a failed attempt — screens read this instead of
   * catching, so the same error state survives a re-render. */
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-runs GET /auth/me — used after onboarding/profile changes so the
   * rest of the app sees fresh identity data without a full app reload. */
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Owns the app's entire authentication lifecycle (M5 brief §6/§10): on
 * mount, loads any stored session token from SecureStore and validates it
 * against the server (never trusts client-side expiry alone); every
 * sign-in/sign-up requests `clientType: "native"` so the API includes the
 * raw session token in the response body (see
 * docs/noor/M5-IMPLEMENTATION.md §6.3) for SecureStore to persist; wires
 * apiFetch's auth-expired handler to sign the app out the moment the
 * server reports 401, regardless of which screen triggered it.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signOut = useCallback(async () => {
    // Best-effort — even if the network call fails, the local session is
    // cleared regardless, so the app never gets stuck "signed in" with no
    // way to sign out (M5 brief §10 "logout").
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    await clearSession();
    setApiAuthToken(null);
    setMe(null);
    setStatus("signedOut");
  }, []);

  useEffect(() => {
    setAuthExpiredHandler(() => {
      clearSession().catch(() => undefined);
      setApiAuthToken(null);
      setMe(null);
      setStatus("signedOut");
    });
    return () => setAuthExpiredHandler(null);
  }, []);

  const refreshMe = useCallback(async () => {
    const result = await apiFetch<Me>("/auth/me");
    setMe(result);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const stored = await loadSession();
      if (!stored) {
        if (!cancelled) setStatus("signedOut");
        return;
      }
      setApiAuthToken(stored.token);
      try {
        const result = await apiFetch<Me>("/auth/me");
        if (cancelled) return;
        setMe(result);
        setStatus("signedIn");
      } catch {
        // Token exists but the server no longer honors it (revoked,
        // expired since last app open, account deactivated) — same
        // treatment as never having had one.
        if (cancelled) return;
        await clearSession();
        setApiAuthToken(null);
        setStatus("signedOut");
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const result = await apiFetch<{ user: Me; session: { token: string; expiresAt: string } }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, app: "patient", clientType: "native" }),
      });
      await saveSession(result.session);
      setApiAuthToken(result.session.token);
      setMe(result.user);
      setStatus("signedIn");
    } catch (err) {
      // Deliberately the SAME message for "wrong password" and "no such
      // account" — the API already collapses these (M1's constant-shape
      // failure path); the mobile client must not re-introduce an
      // enumeration leak by handling them differently here.
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      throw err;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const result = await apiFetch<{ user: Me; session: { token: string; expiresAt: string } }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, app: "patient", clientType: "native" }),
      });
      await saveSession(result.session);
      setApiAuthToken(result.session.token);
      setMe(result.user);
      setStatus("signedIn");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      throw err;
    }
  }, []);

  const value = useMemo(
    () => ({ status, me, error, signIn, signUp, signOut, refreshMe }),
    [status, me, error, signIn, signUp, signOut, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

// Centralized native API client (M5 brief §21) — the ONLY place this app
// calls fetch(). Every screen imports apiFetch instead of scattering raw
// fetch() calls, so auth-header injection, error shaping, and
// auth-expiry handling live in exactly one place.

import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Thrown specifically on a 401 — distinct from a generic ApiError so
 * screens/navigation can react to "you were signed out" (clear the
 * stored session, route to Welcome) without string-matching a message. */
export class AuthExpiredError extends ApiError {
  constructor(message: string) {
    super(401, message);
  }
}

/** Thrown when the request never reached the server at all (offline,
 * DNS failure, server unreachable) — distinct from a server-returned
 * error status, so screens can show "check your connection" rather than
 * a generic failure (M5 brief §23/§24). */
export class NetworkUnavailableError extends Error {}

let cachedToken: string | null = null;
let authExpiredHandler: (() => void) | null = null;

/** Called once by AuthContext on mount/token-change — keeps the token
 * available synchronously to apiFetch without every call site needing to
 * await a SecureStore read. The token itself still only ever lives in
 * SecureStore + this in-memory variable, never AsyncStorage, never a log
 * line (see docs/noor/M5-IMPLEMENTATION.md §19). */
export function setApiAuthToken(token: string | null): void {
  cachedToken = token;
}

/** Called once by AuthContext to be notified when the API itself reports
 * a session as no-longer-valid (401), so the app can react in one place
 * (clear storage, route to sign-in) instead of every screen handling it
 * individually. */
export function setAuthExpiredHandler(handler: (() => void) | null): void {
  authExpiredHandler = handler;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (init.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (cachedToken) {
    headers["Authorization"] = `Bearer ${cachedToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    // Never log the underlying error — it can echo request details; a
    // generic connectivity message is all any screen needs (M5 §23).
    throw new NetworkUnavailableError("Unable to reach Noor. Check your connection and try again.");
  }

  if (response.status === 401) {
    authExpiredHandler?.();
    throw new AuthExpiredError("Your session has expired. Please sign in again.");
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Non-JSON error body — fall back to the generic message above.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

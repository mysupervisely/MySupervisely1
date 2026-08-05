// Thin client-side fetch wrapper. This is the ONLY place this app talks to
// the Noor API — the app never queries Postgres directly (M1 requirement
// #1/#2: PHI stays behind the authenticated API boundary, never exposed
// straight from the database to a frontend). `credentials: "include"` is
// required so the httpOnly session cookie is sent — see
// docs/noor/ARCHITECTURE.md §D for why this works across the app's own
// origin and the API's origin (same-site, different port, in local dev).

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Only set Content-Type when there's actually a body — Fastify's JSON
  // body parser rejects a request that declares application/json but
  // sends zero bytes (e.g. POST /auth/logout, POST .../onboarding/complete),
  // a real bug caught during M2 manual/browser verification that the
  // automated test suite's app.inject() calls didn't surface (inject
  // doesn't reproduce a real browser's default fetch headers).
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (init.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

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

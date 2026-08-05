import "server-only";
import { API_URL } from "./api";

/**
 * M6.0 — Demo Mode server-side authentication. See
 * docs/doseprepped/ARCHITECTURE.md "M6.0 — Demo Mode authentication" for
 * the full design rationale. Summary:
 *
 * - Demo Mode uses three DEDICATED, isolated accounts
 *   (`demo-mode-*@demo.doseprepped.dev`, seeded by packages/db/prisma/seed.ts)
 *   — never the pilot's existing published accounts (patient-b,
 *   pharmacist@, orga-admin@, etc.). These accounts belong to their own
 *   "DosePrepped Demo Mode" organization, completely separate from
 *   Meridian Telehealth and Northstar Digital Pharmacy, and hold no
 *   platform-level role beyond what a normal patient/pharmacist has.
 * - Authentication goes through the real, unmodified
 *   `POST /auth/login` endpoint — this is not a new/parallel auth
 *   system, not an impersonation mechanism, and does not bypass or
 *   weaken any authorization check. Every subsequent Demo Mode API call
 *   is independently re-authorized by the API exactly as any other
 *   request would be.
 * - The resulting session cookie is used ONLY for server-to-server calls
 *   made by this file's callers (Next.js server -> API). It is never set
 *   on any visitor's own browser response, so an anonymous demo visitor
 *   never receives, sees, or can reuse this credential — there is no
 *   code path anywhere in Demo Mode that forwards it to the client.
 * - The password is the same shared, already-published, non-secret
 *   local-dev demo password every other seed account uses (see README)
 *   — not a new secret to manage — but it is used here purely as a
 *   server-side implementation detail, never exposed through the Demo
 *   Mode UI or API responses.
 */

const DEMO_PASSWORD = process.env.DEMO_MODE_PASSWORD ?? "DosepreppedDemo!1";

export type DemoPersona = "patient" | "pharmacist" | "admin";

export const DEMO_ACCOUNT_EMAILS: Record<DemoPersona, string> = {
  patient: "demo-mode-patient@demo.doseprepped.dev",
  pharmacist: "demo-mode-pharmacist@demo.doseprepped.dev",
  admin: "demo-mode-admin@demo.doseprepped.dev",
};

interface CachedSession {
  cookie: string;
  obtainedAt: number;
}

// Process-local cache only — never persisted to a database, never sent
// to a browser. `/auth/login` is rate-limited (10/min/IP, see
// apps/api/src/routes/auth.ts) specifically to slow credential-stuffing
// — reusing one session per persona for up to an hour keeps Demo Mode
// traffic (including repeated page views and screenshot automation)
// well under that limit instead of logging in on every request.
const sessionCache = new Map<DemoPersona, CachedSession>();
const SESSION_CACHE_TTL_MS = 60 * 60 * 1000;

async function loginAsDemoPersona(persona: DemoPersona): Promise<string | null> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: DEMO_ACCOUNT_EMAILS[persona], password: DEMO_PASSWORD }),
    cache: "no-store",
  });
  if (!response.ok) return null;

  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return null;
  // Only the `name=value` pair is needed as a Cookie header on
  // subsequent requests — strip the Path/HttpOnly/SameSite attributes.
  const cookiePair = setCookie.split(";")[0];
  return cookiePair ?? null;
}

/**
 * Returns a `Cookie` header value authenticated as the given Demo Mode
 * persona. Returns null if the demo account/DB isn't seeded (e.g. a
 * fresh environment before `pnpm db:seed` has run) — callers must treat
 * that the same as "no data available," never throw a hard error that
 * would break the rest of the page.
 */
export async function getDemoSessionCookie(persona: DemoPersona): Promise<string | null> {
  const cached = sessionCache.get(persona);
  if (cached && Date.now() - cached.obtainedAt < SESSION_CACHE_TTL_MS) {
    return cached.cookie;
  }

  const cookie = await loginAsDemoPersona(persona);
  if (!cookie) return null;

  sessionCache.set(persona, { cookie, obtainedAt: Date.now() });
  return cookie;
}

/** Drops a cached session — used after a demo action if a call
 * unexpectedly 401s, so the next request re-authenticates instead of
 * retrying a stale/invalid cookie indefinitely. */
export function invalidateDemoSession(persona: DemoPersona): void {
  sessionCache.delete(persona);
}

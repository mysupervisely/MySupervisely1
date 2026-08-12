// Shared helper for reading the raw session token off a request,
// regardless of transport (web cookie vs. native Authorization header —
// see docs/noor/M5-IMPLEMENTATION.md §6). Used by both the session
// plugin (request-time identity resolution) and the logout route (which
// needs the same raw token to revoke the right Session row) so the
// "how do we find the token on this request" logic exists exactly once.

import type { FastifyRequest } from "fastify";
import { SESSION_COOKIE_NAME } from "@noor/auth";

const BEARER_PREFIX = "Bearer ";

/** Returns the raw (unhashed) session token from either the signed
 * cookie or an `Authorization: Bearer <token>` header — cookie takes
 * precedence if somehow both are present. Returns null if neither is
 * present or the cookie signature is invalid. Never throws. */
export function readRawSessionToken(request: FastifyRequest): string | null {
  const rawCookie = request.cookies[SESSION_COOKIE_NAME];
  if (rawCookie) {
    const unsigned = request.unsignCookie(rawCookie);
    if (unsigned.valid && unsigned.value) return unsigned.value;
  }

  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith(BEARER_PREFIX)) {
    const token = authHeader.slice(BEARER_PREFIX.length).trim();
    return token || null;
  }

  return null;
}

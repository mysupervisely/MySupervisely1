import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { getSessionUser } from "@noor/auth";
import type { SessionUser } from "@noor/auth";
import { readRawSessionToken } from "../lib/session-token.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Populated by this plugin on every request. Null if there is no
     * valid, unexpired session — routes must check this themselves via
     * the rbac helpers in src/rbac, never assume it is set. */
    sessionUser: SessionUser | null;
  }
}

/**
 * Resolves either the signed session cookie (web) or an `Authorization:
 * Bearer <token>` header (native — see docs/noor/M5-IMPLEMENTATION.md §6)
 * to a SessionUser on every request, before any route handler runs. This
 * is the single place session verification happens for BOTH transports —
 * both resolve through the same getSessionUser(), so there is exactly one
 * code path from "raw token" to "authenticated identity" regardless of
 * which client sent the request. See docs/noor/ARCHITECTURE.md §D
 * "sessions" (only a hash of the token is stored server-side) for the web
 * cookie's original design, unchanged here.
 *
 * Cookie values are signed (tamper-evident via a server secret) because a
 * browser could be coerced into resending an attacker-supplied cookie; a
 * bearer header has no such coercion vector (the native app controls
 * exactly what it sends), so no separate signing step applies to it — the
 * token itself is already an unguessable 32-byte random value, and
 * getSessionUser() only ever matches it against a stored hash either way.
 */
async function sessionPlugin(app: FastifyInstance) {
  app.decorateRequest("sessionUser", null);

  app.addHook("onRequest", async (request: FastifyRequest) => {
    const token = readRawSessionToken(request);
    request.sessionUser = token ? await getSessionUser(token) : null;
  });
}

export const registerSessionPlugin = fp(sessionPlugin, {
  name: "session-plugin",
  dependencies: ["security-plugins"],
});

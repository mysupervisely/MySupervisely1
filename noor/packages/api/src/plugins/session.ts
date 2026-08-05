import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { getSessionUser, SESSION_COOKIE_NAME } from "@noor/auth";
import type { SessionUser } from "@noor/auth";

declare module "fastify" {
  interface FastifyRequest {
    /** Populated by this plugin on every request. Null if there is no
     * valid, unexpired session — routes must check this themselves via
     * the rbac helpers in src/rbac, never assume it is set. */
    sessionUser: SessionUser | null;
  }
}

/**
 * Resolves the signed session cookie (if present and valid) to a
 * SessionUser on every request, before any route handler runs. This is the
 * single place session-cookie verification happens — see
 * docs/noor/ARCHITECTURE.md §D "sessions" (httpOnly, signed cookie; only a
 * hash of the token is stored server-side).
 */
async function sessionPlugin(app: FastifyInstance) {
  app.decorateRequest("sessionUser", null);

  app.addHook("onRequest", async (request: FastifyRequest) => {
    const rawCookie = request.cookies[SESSION_COOKIE_NAME];
    if (!rawCookie) {
      request.sessionUser = null;
      return;
    }

    const unsigned = request.unsignCookie(rawCookie);
    if (!unsigned.valid || !unsigned.value) {
      // Tampered or malformed cookie — treat exactly like no session.
      request.sessionUser = null;
      return;
    }

    request.sessionUser = await getSessionUser(unsigned.value);
  });
}

export const registerSessionPlugin = fp(sessionPlugin, {
  name: "session-plugin",
  dependencies: ["security-plugins"],
});

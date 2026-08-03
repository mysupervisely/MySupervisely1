import type { FastifyReply, FastifyRequest } from "fastify";
import { getSessionUser, SESSION_COOKIE_NAME, type SessionUser } from "@doseprepped/auth";
import type { Role } from "@doseprepped/db";
import { env } from "../config/env.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

export function readSessionToken(request: FastifyRequest): string | undefined {
  const raw = request.cookies[SESSION_COOKIE_NAME];
  if (!raw) return undefined;
  const result = request.unsignCookie(raw);
  return result.valid && result.value ? result.value : undefined;
}

/** Fastify preHandler: rejects the request with 401 unless it carries a valid session. */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = readSessionToken(request);
  const user = await getSessionUser(token);

  if (!user) {
    await reply.code(401).send({ error: "Authentication required." });
    return;
  }

  request.user = user;
}

/** Fastify preHandler factory: requires authentication AND one of the given roles. */
export function requireRole(...roles: Role[]) {
  return async function requireRoleHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user || !roles.includes(request.user.role)) {
      await reply.code(403).send({ error: "You do not have access to this resource." });
    }
  };
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    signed: true,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
}

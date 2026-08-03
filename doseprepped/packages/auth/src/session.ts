import { randomBytes, createHash } from "node:crypto";
import { prisma, Role } from "@doseprepped/db";

export const SESSION_COOKIE_NAME = "doseprepped_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  createdAt: Date;
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Creates a new session for a user and returns the *raw* token to hand to
 * the browser as a cookie value. Only a SHA-256 hash of the token is ever
 * persisted, so reading the sessions table doesn't hand out live sessions.
 */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  return { token, expiresAt };
}

/**
 * Resolves a raw session token (as read from the cookie) to the signed-in
 * user, or null if the token is missing, unknown, or expired.
 */
export async function getSessionUser(rawToken: string | undefined | null): Promise<SessionUser | null> {
  if (!rawToken) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    // Opportunistic cleanup; not load-bearing if this fails.
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (session.user.deletedAt) return null;

  const { id, email, firstName, lastName, role, createdAt } = session.user;
  return { id, email, firstName, lastName, role, createdAt };
}

export async function deleteSession(rawToken: string | undefined | null): Promise<void> {
  if (!rawToken) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}

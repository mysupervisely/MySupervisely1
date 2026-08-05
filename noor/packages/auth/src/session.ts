import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@noor/db";
import type { Role } from "@noor/types";

export const SESSION_COOKIE_NAME = "noor_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours — see docs/noor/ARCHITECTURE.md §J "session management"

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  mfaEnabled: boolean;
  roles: string[];
  /** Set only if this user has a Patient record. */
  patientId: string | null;
  /** Set only if this user has a Clinician record. */
  clinicianId: string | null;
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface CreateSessionOptions {
  issuedForApp?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Creates a new session for a user and returns the *raw* token to hand to
 * the browser as a cookie value. Only a SHA-256 hash of the token is ever
 * persisted, so reading the sessions table doesn't hand out live sessions.
 */
export async function createSession(
  userId: string,
  options: CreateSessionOptions = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      issuedForApp: options.issuedForApp ?? null,
      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,
    },
  });

  return { token, expiresAt };
}

/**
 * Resolves a raw session token (as read from the cookie) to the signed-in
 * user, or null if the token is missing, unknown, expired, or the account
 * is no longer active.
 */
export async function getSessionUser(rawToken: string | undefined | null): Promise<SessionUser | null> {
  if (!rawToken) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: {
      user: {
        include: {
          roles: { include: { role: true } },
          patient: true,
          clinician: true,
        },
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    // Opportunistic cleanup; not load-bearing if this fails.
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  const { user } = session;
  if (user.status !== "ACTIVE") return null;

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    mfaEnabled: user.mfaEnabled,
    roles: user.roles.map((ur) => ur.role.name) as Role[],
    patientId: user.patient?.id ?? null,
    clinicianId: user.clinician?.id ?? null,
  };
}

export async function deleteSession(rawToken: string | undefined | null): Promise<void> {
  if (!rawToken) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}

/** Invalidates every session for a user (e.g. on password change). */
export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

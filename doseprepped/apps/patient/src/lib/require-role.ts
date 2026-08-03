import "server-only";
import { redirect } from "next/navigation";
import type { Role } from "@doseprepped/types";
import { getServerSessionUser, type SessionUser } from "./session";

const ROLE_HOME: Record<Role, string> = {
  PATIENT: "/home",
  PHARMACIST: "/pharmacist",
  ADMIN: "/admin",
};

/**
 * Server-side route guard for a page/layout: redirects to /login if
 * unauthenticated, or to the caller's own role home if authenticated with
 * the wrong role. This is enforcement for navigation/UX only — the API
 * enforces the same rule independently on every request (see
 * apps/api/src/lib/auth.ts requireRole), which is what actually protects
 * the data.
 */
export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await getServerSessionUser();

  if (!user) {
    redirect("/login");
  }
  if (user.role !== role) {
    redirect(ROLE_HOME[user.role]);
  }

  return user;
}

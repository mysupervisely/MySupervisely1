import "server-only";
import { redirect } from "next/navigation";
import { getServerSessionUser, type SessionUser } from "./session";
import { getMyMemberships } from "./organizations";

const ROLE_HOME: Record<SessionUser["role"], string> = {
  PATIENT: "/home",
  PHARMACIST: "/pharmacist",
  ADMIN: "/admin",
};

export interface OrgAdminContext {
  user: SessionUser;
  organizationId: string;
  organizationName: string;
}

/**
 * Server-side route guard for the `/org-admin/*` route group —
 * deliberately separate from `requireRole` (`lib/require-role.ts`)
 * because organization administration is not a platform `Role` at all.
 * An org admin's platform role is `PATIENT` (inert) by M5.4 seed
 * convention — their admin capability comes entirely from an
 * `OrganizationMembership.role = ORG_ADMIN` row, resolved here via
 * `GET /organizations/me`. See docs/doseprepped/ARCHITECTURE.md "M5.5 —
 * Frontend architecture".
 *
 * This is UX-only enforcement: the API independently re-verifies
 * organization-admin membership on every single request via
 * `requireOrganizationAdmin` (M5.4), which is what actually protects the
 * data. A user who somehow reached this route group without this guard
 * would still get 404s from every API call.
 */
export async function requireOrganizationAdmin(): Promise<OrgAdminContext> {
  const user = await getServerSessionUser();
  if (!user) {
    redirect("/login");
  }

  const memberships = await getMyMemberships();
  // If a user holds more than one ORG_ADMIN membership (schema-legal
  // since M5.4, not built/tested), the first one found is used —
  // multi-org admin UI is explicitly out of scope. See
  // docs/doseprepped/ARCHITECTURE.md "M5.5 — Remaining limitations".
  const adminMembership = memberships.find((m) => m.role === "ORG_ADMIN");

  if (!adminMembership) {
    redirect(ROLE_HOME[user.role]);
  }

  return {
    user,
    organizationId: adminMembership.organizationId,
    organizationName: adminMembership.organizationName,
  };
}

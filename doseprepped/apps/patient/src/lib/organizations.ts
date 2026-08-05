import "server-only";
import { cookies } from "next/headers";
import { API_URL } from "./api";
import type { AnalyticsReport } from "./analytics";

// M5.5 — server-only data-fetching for the /org-admin/* route group.
// Follows the exact cookies()-forwarding pattern already used by
// lib/analytics.ts / lib/pharmacist.ts / lib/medications.ts: forward the
// incoming request's cookies, cache: "no-store", return null/an empty
// array on a non-OK response rather than throwing. See
// docs/doseprepped/ARCHITECTURE.md "M5.5 — Frontend architecture".

export type OrganizationRole = "ORG_ADMIN" | "ORG_PHARMACIST" | "ORG_PATIENT";

export interface MyOrgMembership {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrganizationRole;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, cookie: cookieHeader },
    cache: "no-store",
  });
}

/** Always the caller's own memberships — never accepts or trusts a
 * client-supplied organizationId. See GET /organizations/me (M5.4). */
export async function getMyMemberships(): Promise<MyOrgMembership[]> {
  const response = await apiFetch("/organizations/me");
  if (!response.ok) return [];
  const data = (await response.json()) as { memberships: MyOrgMembership[] };
  return data.memberships;
}

export async function getOrganization(organizationId: string): Promise<Organization | null> {
  const response = await apiFetch(`/organizations/${encodeURIComponent(organizationId)}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { organization: Organization };
  return data.organization;
}

export async function getOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
  const response = await apiFetch(`/organizations/${encodeURIComponent(organizationId)}/memberships`);
  if (!response.ok) return [];
  const data = (await response.json()) as { memberships: OrganizationMember[] };
  return data.memberships;
}

export async function getOrganizationAnalyticsReport(
  organizationId: string,
  range?: { from?: string; to?: string },
): Promise<AnalyticsReport | null> {
  const params = new URLSearchParams();
  if (range?.from) params.set("from", range.from);
  if (range?.to) params.set("to", range.to);
  const query = params.toString();
  const response = await apiFetch(
    `/organizations/${encodeURIComponent(organizationId)}/analytics/report${query ? `?${query}` : ""}`,
  );
  if (!response.ok) return null;
  return (await response.json()) as AnalyticsReport;
}

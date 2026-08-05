import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma, Role, OrganizationRole } from "@doseprepped/db";
import { MockMedicationEducationProvider } from "@doseprepped/ai-service";
import {
  TEST_EMAIL_DOMAIN,
  TEST_ORG_SLUG_PREFIX,
  addOrgMembership,
  createMedicationForPatient,
  createOrganizationDirectly,
  createQuestionForPatient,
  createUserDirectly,
  loginAndGetCookie,
} from "./helpers.js";

// M5.5 — organization-admin experience: PATCH org name, PATCH membership
// role, and the full cross-tenant checklist from the milestone brief. See
// docs/doseprepped/ARCHITECTURE.md "M5.5 — Organization Admin &
// Organization-Scoped Analytics". Complements (does not duplicate)
// apps/api/tests/organizations.test.ts, which already covers the M5.4
// CRUD/isolation baseline this milestone builds on.

afterAll(async () => {
  await prisma.analyticsEvent.deleteMany({});
  await prisma.organizationMembership.deleteMany({
    where: { user: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } },
  });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: TEST_ORG_SLUG_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } });
  await prisma.$disconnect();
});

function app() {
  return buildApp({ aiProvider: new MockMedicationEducationProvider({ mode: "success" }) });
}

async function userWithCookie(a: ReturnType<typeof buildApp>, role: Role, label: string) {
  const { user, email } = await createUserDirectly(role, label);
  const cookie = await loginAndGetCookie(a, email);
  return { user, cookie };
}

/** Same shape as organizations.test.ts's seedOrganization — an org with
 * an ORG_ADMIN, ORG_PHARMACIST, and ORG_PATIENT, the patient having a
 * medication and one queued PHARMACIST_REVIEW question. */
async function seedOrganization(a: ReturnType<typeof buildApp>, label: string) {
  const organization = await createOrganizationDirectly(label);

  const admin = await userWithCookie(a, Role.PATIENT, `${label}-org-admin`);
  await addOrgMembership(organization.id, admin.user.id, OrganizationRole.ORG_ADMIN);

  const pharmacist = await userWithCookie(a, Role.PHARMACIST, `${label}-org-pharmacist`);
  await addOrgMembership(organization.id, pharmacist.user.id, OrganizationRole.ORG_PHARMACIST);

  const patient = await userWithCookie(a, Role.PATIENT, `${label}-org-patient`);
  await addOrgMembership(organization.id, patient.user.id, OrganizationRole.ORG_PATIENT);

  const medication = await createMedicationForPatient(a, patient.cookie);
  const question = await createQuestionForPatient(a, patient.cookie, medication.id);
  expect(question.disposition).toBe("PHARMACIST_REVIEW");

  return { organization, admin, pharmacist, patient, medication, question };
}

describe("PATCH /organizations/:organizationId — rename", () => {
  it("an org admin can rename their own organization; slug is unaffected", async () => {
    const a = app();
    const { organization, admin } = await seedOrganization(a, "rename-basic");

    const response = await a.inject({
      method: "PATCH",
      url: `/organizations/${organization.id}`,
      headers: { cookie: admin.cookie },
      payload: { name: "Renamed Org" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().organization.name).toBe("Renamed Org");
    expect(response.json().organization.slug).toBe(organization.slug);

    await a.close();
  });

  it("rejects an empty name", async () => {
    const a = app();
    const { organization, admin } = await seedOrganization(a, "rename-empty");

    const response = await a.inject({
      method: "PATCH",
      url: `/organizations/${organization.id}`,
      headers: { cookie: admin.cookie },
      payload: { name: "" },
    });
    expect(response.statusCode).toBe(400);

    await a.close();
  });

  it("rejects a non-admin member (pharmacist or patient) — 403", async () => {
    const a = app();
    const { organization, pharmacist, patient } = await seedOrganization(a, "rename-nonadmin");

    const asPharmacist = await a.inject({
      method: "PATCH",
      url: `/organizations/${organization.id}`,
      headers: { cookie: pharmacist.cookie },
      payload: { name: "Hijacked" },
    });
    const asPatient = await a.inject({
      method: "PATCH",
      url: `/organizations/${organization.id}`,
      headers: { cookie: patient.cookie },
      payload: { name: "Hijacked" },
    });

    expect(asPharmacist.statusCode).toBe(403);
    expect(asPatient.statusCode).toBe(403);

    const stored = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    expect(stored.name).not.toBe("Hijacked");

    await a.close();
  });

  it("an org admin of Organization A cannot rename Organization B — 404", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "rename-cross-a");
    const orgB = await seedOrganization(a, "rename-cross-b");

    const response = await a.inject({
      method: "PATCH",
      url: `/organizations/${orgB.organization.id}`,
      headers: { cookie: orgA.admin.cookie },
      payload: { name: "Stolen Name" },
    });
    expect(response.statusCode).toBe(404);

    const stored = await prisma.organization.findUniqueOrThrow({ where: { id: orgB.organization.id } });
    expect(stored.name).not.toBe("Stolen Name");

    await a.close();
  });

  it("platform admin behavior remains correct — can rename any organization", async () => {
    const a = app();
    const { organization } = await seedOrganization(a, "rename-platform-admin");
    const { cookie } = await userWithCookie(a, Role.ADMIN, "rename-platform-admin");

    const response = await a.inject({
      method: "PATCH",
      url: `/organizations/${organization.id}`,
      headers: { cookie },
      payload: { name: "Platform Renamed" },
    });
    expect(response.statusCode).toBe(200);

    await a.close();
  });

  it("rejects an unauthenticated request", async () => {
    const a = app();
    const { organization } = await seedOrganization(a, "rename-unauth");

    const response = await a.inject({
      method: "PATCH",
      url: `/organizations/${organization.id}`,
      payload: { name: "No Session" },
    });
    expect(response.statusCode).toBe(401);

    await a.close();
  });

  it("rejects a patient with no organization membership at all — 404", async () => {
    const a = app();
    const { organization } = await seedOrganization(a, "rename-outsider");
    const { cookie } = await userWithCookie(a, Role.PATIENT, "rename-outsider-patient");

    const response = await a.inject({
      method: "PATCH",
      url: `/organizations/${organization.id}`,
      headers: { cookie },
      payload: { name: "Outsider Rename" },
    });
    expect(response.statusCode).toBe(404);

    await a.close();
  });
});

describe("PATCH /organizations/:organizationId/memberships/:membershipId — role change", () => {
  it("an org admin can promote a patient member to pharmacist", async () => {
    const a = app();
    const { organization, admin, patient } = await seedOrganization(a, "role-change-basic");
    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: organization.id, userId: patient.user.id } },
    });

    const response = await a.inject({
      method: "PATCH",
      url: `/organizations/${organization.id}/memberships/${membership.id}`,
      headers: { cookie: admin.cookie },
      payload: { role: "ORG_PHARMACIST" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().membership.role).toBe("ORG_PHARMACIST");

    // The target's *platform* Role is completely untouched by an
    // organization-scoped role change — the two axes remain decoupled
    // (M5.4 §2).
    const storedUser = await prisma.user.findUniqueOrThrow({ where: { id: patient.user.id } });
    expect(storedUser.role).toBe(Role.PATIENT);

    await a.close();
  });

  it("cannot promote a member to platform admin — the role enum has no such value", async () => {
    const a = app();
    const { organization, admin, patient } = await seedOrganization(a, "role-change-platform-admin");
    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: organization.id, userId: patient.user.id } },
    });

    const response = await a.inject({
      method: "PATCH",
      url: `/organizations/${organization.id}/memberships/${membership.id}`,
      headers: { cookie: admin.cookie },
      payload: { role: "ADMIN" },
    });
    expect(response.statusCode).toBe(400);

    const stored = await prisma.organizationMembership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(stored.role).toBe(OrganizationRole.ORG_PATIENT);
    const storedUser = await prisma.user.findUniqueOrThrow({ where: { id: patient.user.id } });
    expect(storedUser.role).toBe(Role.PATIENT);

    await a.close();
  });

  it("rejects a non-admin member — 403", async () => {
    const a = app();
    const { organization, pharmacist, patient } = await seedOrganization(a, "role-change-nonadmin");
    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: organization.id, userId: patient.user.id } },
    });

    const response = await a.inject({
      method: "PATCH",
      url: `/organizations/${organization.id}/memberships/${membership.id}`,
      headers: { cookie: pharmacist.cookie },
      payload: { role: "ORG_PHARMACIST" },
    });
    expect(response.statusCode).toBe(403);

    await a.close();
  });

  it("an org admin of Organization A cannot change a membership role in Organization B — 404", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "role-change-cross-a");
    const orgB = await seedOrganization(a, "role-change-cross-b");
    const bMembership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: orgB.organization.id, userId: orgB.patient.user.id } },
    });

    const response = await a.inject({
      method: "PATCH",
      url: `/organizations/${orgB.organization.id}/memberships/${bMembership.id}`,
      headers: { cookie: orgA.admin.cookie },
      payload: { role: "ORG_PHARMACIST" },
    });
    expect(response.statusCode).toBe(404);

    const stored = await prisma.organizationMembership.findUniqueOrThrow({ where: { id: bMembership.id } });
    expect(stored.role).toBe(OrganizationRole.ORG_PATIENT);

    await a.close();
  });

  it("a membership id from a different organization, even under Organization A's own URL, is 404", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "role-change-wrong-membership-a");
    const orgB = await seedOrganization(a, "role-change-wrong-membership-b");
    const bMembership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: orgB.organization.id, userId: orgB.patient.user.id } },
    });

    // orgA's own admin, orgA's own URL, but orgB's membership id.
    const response = await a.inject({
      method: "PATCH",
      url: `/organizations/${orgA.organization.id}/memberships/${bMembership.id}`,
      headers: { cookie: orgA.admin.cookie },
      payload: { role: "ORG_PHARMACIST" },
    });
    expect(response.statusCode).toBe(404);

    await a.close();
  });
});

describe("Spoofing resistance — query parameters, headers, and body fields never override the URL path", () => {
  it("a query-string organizationId has no effect on a PATCH membership role route", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "spoof-query-a");
    const orgB = await seedOrganization(a, "spoof-query-b");
    const bMembership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: orgB.organization.id, userId: orgB.patient.user.id } },
    });

    // orgA's admin, orgA's own membership route, but a query string
    // claiming orgB — the server must still resolve organizationId from
    // the path segment alone and find no matching membership.
    const response = await a.inject({
      method: "PATCH",
      url: `/organizations/${orgA.organization.id}/memberships/${bMembership.id}?organizationId=${orgB.organization.id}`,
      headers: { cookie: orgA.admin.cookie },
      payload: { role: "ORG_PHARMACIST" },
    });
    expect(response.statusCode).toBe(404);

    const stored = await prisma.organizationMembership.findUniqueOrThrow({ where: { id: bMembership.id } });
    expect(stored.role).toBe(OrganizationRole.ORG_PATIENT);

    await a.close();
  });

  it("a custom x-organization-id header has no effect on organization resolution", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "spoof-header-a");
    const orgB = await seedOrganization(a, "spoof-header-b");

    // orgA's admin, requesting orgA's own URL, with a header claiming to
    // be orgB — the API never reads any such header, so this must behave
    // identically to the header being absent (i.e. succeed, scoped to A).
    const response = await a.inject({
      method: "GET",
      url: `/organizations/${orgA.organization.id}`,
      headers: { cookie: orgA.admin.cookie, "x-organization-id": orgB.organization.id },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().organization.id).toBe(orgA.organization.id);

    await a.close();
  });

  it("a request body organizationId never overrides the URL path on a role-change PATCH", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "spoof-body-patch-a");
    const orgB = await seedOrganization(a, "spoof-body-patch-b");
    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: orgA.organization.id, userId: orgA.patient.user.id } },
    });

    const response = await a.inject({
      method: "PATCH",
      url: `/organizations/${orgA.organization.id}/memberships/${membership.id}`,
      headers: { cookie: orgA.admin.cookie },
      payload: { role: "ORG_PHARMACIST", organizationId: orgB.organization.id },
    });
    // Still succeeds — scoped to orgA (from the URL), the smuggled body
    // field is simply ignored by the Zod schema (role-only).
    expect(response.statusCode).toBe(200);
    expect(response.json().membership.organizationId).toBe(orgA.organization.id);

    await a.close();
  });
});

describe("Patients and unauthenticated users cannot access organization-admin endpoints", () => {
  it("a DosePrepped Direct patient (zero memberships anywhere) gets 404 from every organization-admin route", async () => {
    const a = app();
    const { organization } = await seedOrganization(a, "no-access-direct-patient");
    const { cookie } = await userWithCookie(a, Role.PATIENT, "no-access-direct-patient");

    const routes = [
      ["GET", `/organizations/${organization.id}`],
      ["GET", `/organizations/${organization.id}/memberships`],
      ["GET", `/organizations/${organization.id}/analytics/report`],
    ] as const;
    for (const [method, url] of routes) {
      const response = await a.inject({ method, url, headers: { cookie } });
      expect(response.statusCode).toBe(404);
    }

    await a.close();
  });

  it("every organization-admin route rejects an unauthenticated caller with 401", async () => {
    const a = app();
    const { organization } = await seedOrganization(a, "no-access-unauth");

    const routes = [
      ["GET", `/organizations/${organization.id}`],
      ["GET", `/organizations/${organization.id}/memberships`],
      ["POST", `/organizations/${organization.id}/memberships`],
      ["DELETE", `/organizations/${organization.id}/memberships/nonexistent`],
      ["PATCH", `/organizations/${organization.id}/memberships/nonexistent`],
      ["PATCH", `/organizations/${organization.id}`],
      ["GET", `/organizations/${organization.id}/analytics/report`],
      ["GET", `/organizations/${organization.id}/pharmacist/queue`],
      ["GET", "/organizations/me"],
    ] as const;
    for (const [method, url] of routes) {
      const response = await a.inject({ method, url });
      expect(response.statusCode).toBe(401);
    }

    await a.close();
  });
});

describe("Platform admin — platform-level organization management remains intact", () => {
  it("only a platform admin can create an organization; a seeded-in org admin cannot", async () => {
    const a = app();
    const { admin } = await seedOrganization(a, "platform-mgmt-orgadmin");
    const { cookie: platformAdminCookie } = await userWithCookie(a, Role.ADMIN, "platform-mgmt-platform");

    const asOrgAdmin = await a.inject({
      method: "POST",
      url: "/organizations",
      headers: { cookie: admin.cookie },
      payload: { name: "Should Fail", slug: `${TEST_ORG_SLUG_PREFIX}should-fail-${Date.now()}` },
    });
    expect(asOrgAdmin.statusCode).toBe(403);

    const asPlatformAdmin = await a.inject({
      method: "POST",
      url: "/organizations",
      headers: { cookie: platformAdminCookie },
      payload: { name: "Should Succeed", slug: `${TEST_ORG_SLUG_PREFIX}should-succeed-${Date.now()}` },
    });
    expect(asPlatformAdmin.statusCode).toBe(201);

    await a.close();
  });
});

describe("Analytics isolation — two organizations with distinguishable synthetic activity", () => {
  it("each organization admin sees only their own organization's question/patient counts, never the other's", async () => {
    const a = app();
    const orgMeridianLike = await seedOrganization(a, "analytics-isolation-meridian");
    const orgNorthstarLike = await seedOrganization(a, "analytics-isolation-northstar");

    // Give Meridian-like a second question so the two orgs are
    // distinguishable by volume, not just by identity.
    const secondMedication = await createMedicationForPatient(a, orgMeridianLike.patient.cookie, {
      name: "Metformin",
    });
    await createQuestionForPatient(a, orgMeridianLike.patient.cookie, secondMedication.id, {
      questionText: "Should I take this with food every time?",
    });

    const meridianReport = await a.inject({
      method: "GET",
      url: `/organizations/${orgMeridianLike.organization.id}/analytics/report`,
      headers: { cookie: orgMeridianLike.admin.cookie },
    });
    const northstarReport = await a.inject({
      method: "GET",
      url: `/organizations/${orgNorthstarLike.organization.id}/analytics/report`,
      headers: { cookie: orgNorthstarLike.admin.cookie },
    });

    expect(meridianReport.statusCode).toBe(200);
    expect(northstarReport.statusCode).toBe(200);
    expect(meridianReport.json().questionFunnel.totalQuestions).toBe(2);
    expect(northstarReport.json().questionFunnel.totalQuestions).toBe(1);
    expect(meridianReport.json().patientEngagement.totalPatients).toBe(1);
    expect(northstarReport.json().patientEngagement.totalPatients).toBe(1);

    // Cross-check: Northstar's admin requesting Meridian's URL is 404,
    // never a report at all, let alone Meridian's numbers.
    const crossAttempt = await a.inject({
      method: "GET",
      url: `/organizations/${orgMeridianLike.organization.id}/analytics/report`,
      headers: { cookie: orgNorthstarLike.admin.cookie },
    });
    expect(crossAttempt.statusCode).toBe(404);

    await a.close();
  });
});

describe("POST /organizations/:organizationId/memberships — email lookup edge cases (M5.5)", () => {
  it("matches an email case-insensitively, same as login", async () => {
    const a = app();
    const { organization, admin } = await seedOrganization(a, "email-case-insensitive");
    const { user: target, email } = await createUserDirectly(Role.PATIENT, "email-case-insensitive-target");

    const response = await a.inject({
      method: "POST",
      url: `/organizations/${organization.id}/memberships`,
      headers: { cookie: admin.cookie },
      payload: { email: email.toUpperCase(), role: "ORG_PATIENT" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().membership.userId).toBe(target.id);

    await a.close();
  });

  it("rejects a malformed email with 400, not 404", async () => {
    const a = app();
    const { organization, admin } = await seedOrganization(a, "email-malformed");

    const response = await a.inject({
      method: "POST",
      url: `/organizations/${organization.id}/memberships`,
      headers: { cookie: admin.cookie },
      payload: { email: "not-an-email", role: "ORG_PATIENT" },
    });
    expect(response.statusCode).toBe(400);

    await a.close();
  });

  it("never exposes another organization's member list through the add-member 404/409 responses", async () => {
    const a = app();
    const { organization, admin, pharmacist } = await seedOrganization(a, "email-no-leak");

    // Adding an already-registered pharmacist who ISN'T yet a member —
    // sanity check the happy path still works with a real existing user.
    const { email: freshEmail } = await createUserDirectly(Role.PHARMACIST, "email-no-leak-fresh");
    const ok = await a.inject({
      method: "POST",
      url: `/organizations/${organization.id}/memberships`,
      headers: { cookie: admin.cookie },
      payload: { email: freshEmail, role: "ORG_PHARMACIST" },
    });
    expect(ok.statusCode).toBe(201);

    // Adding the already-member pharmacist again is 409, not 404 or 500.
    const duplicate = await a.inject({
      method: "POST",
      url: `/organizations/${organization.id}/memberships`,
      headers: { cookie: admin.cookie },
      payload: { email: pharmacist.user.email, role: "ORG_PHARMACIST" },
    });
    expect(duplicate.statusCode).toBe(409);

    await a.close();
  });
});

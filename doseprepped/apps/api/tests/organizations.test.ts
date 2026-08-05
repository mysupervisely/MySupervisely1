import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma, Role, OrganizationRole } from "@doseprepped/db";
import { MockMedicationEducationProvider } from "@doseprepped/ai-service";
import { buildAnalyticsReport } from "../src/lib/analytics-report.js";
import {
  TEST_EMAIL_DOMAIN,
  TEST_ORG_SLUG_PREFIX,
  addOrgMembership,
  createMedicationForPatient,
  createOrganizationDirectly,
  createQuestionForPatient,
  createUserDirectly,
  loginAndGetCookie,
  uniqueEmail,
  uniqueSlug,
} from "./helpers.js";

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

/**
 * Creates an organization plus one ORG_ADMIN, one ORG_PHARMACIST, and one
 * ORG_PATIENT member. The org patient also gets a medication and a
 * PHARMACIST_REVIEW-disposition question already in the shared queue, so
 * the tenant-isolation tests below have real cross-organization data to
 * assert against.
 */
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

describe("POST /organizations — platform-admin-only creation", () => {
  it("rejects an unauthenticated request", async () => {
    const a = app();
    const response = await a.inject({
      method: "POST",
      url: "/organizations",
      payload: { name: "Unauthed Org", slug: uniqueSlug("unauthed") },
    });
    expect(response.statusCode).toBe(401);
    await a.close();
  });

  it("rejects a patient", async () => {
    const a = app();
    const { cookie } = await userWithCookie(a, Role.PATIENT, "create-org-patient");
    const response = await a.inject({
      method: "POST",
      url: "/organizations",
      headers: { cookie },
      payload: { name: "Patient Org", slug: uniqueSlug("patient-org") },
    });
    expect(response.statusCode).toBe(403);
    await a.close();
  });

  it("rejects a pharmacist", async () => {
    const a = app();
    const { cookie } = await userWithCookie(a, Role.PHARMACIST, "create-org-pharmacist");
    const response = await a.inject({
      method: "POST",
      url: "/organizations",
      headers: { cookie },
      payload: { name: "Pharmacist Org", slug: uniqueSlug("pharmacist-org") },
    });
    expect(response.statusCode).toBe(403);
    await a.close();
  });

  it("rejects an organization admin — org admin is not a platform admin", async () => {
    const a = app();
    const { organization, admin } = await seedOrganization(a, "create-org-orgadmin");
    void organization;
    const response = await a.inject({
      method: "POST",
      url: "/organizations",
      headers: { cookie: admin.cookie },
      payload: { name: "Org Admin's New Org", slug: uniqueSlug("org-admin-new-org") },
    });
    expect(response.statusCode).toBe(403);
    await a.close();
  });

  it("allows a platform admin, and rejects a duplicate slug", async () => {
    const a = app();
    const { cookie } = await userWithCookie(a, Role.ADMIN, "create-org-admin");
    const slug = uniqueSlug("platform-created");

    const response = await a.inject({
      method: "POST",
      url: "/organizations",
      headers: { cookie },
      payload: { name: "Platform Created Org", slug },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().organization.slug).toBe(slug);

    const duplicate = await a.inject({
      method: "POST",
      url: "/organizations",
      headers: { cookie },
      payload: { name: "Duplicate Slug Org", slug },
    });
    expect(duplicate.statusCode).toBe(409);

    await a.close();
  });

  it("rejects an invalid slug", async () => {
    const a = app();
    const { cookie } = await userWithCookie(a, Role.ADMIN, "create-org-invalid-slug");
    const response = await a.inject({
      method: "POST",
      url: "/organizations",
      headers: { cookie },
      payload: { name: "Bad Slug Org", slug: "Not A Valid Slug!" },
    });
    expect(response.statusCode).toBe(400);
    await a.close();
  });
});

describe("Organization membership — creation, roles, isolation", () => {
  it("an org admin can list and add memberships within their own organization", async () => {
    const a = app();
    const { organization, admin } = await seedOrganization(a, "membership-add");
    const { user: newUser } = await createUserDirectly(Role.PATIENT, "membership-add-target");

    const list = await a.inject({
      method: "GET",
      url: `/organizations/${organization.id}/memberships`,
      headers: { cookie: admin.cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().memberships.length).toBeGreaterThanOrEqual(3);

    const add = await a.inject({
      method: "POST",
      url: `/organizations/${organization.id}/memberships`,
      headers: { cookie: admin.cookie },
      payload: { email: newUser.email, role: "ORG_PATIENT" },
    });
    expect(add.statusCode).toBe(201);
    expect(add.json().membership.userId).toBe(newUser.id);
    expect(add.json().membership.role).toBe("ORG_PATIENT");

    await a.close();
  });

  it("rejects adding the same user to the same organization twice", async () => {
    const a = app();
    const { organization, admin, patient } = await seedOrganization(a, "membership-duplicate");

    const response = await a.inject({
      method: "POST",
      url: `/organizations/${organization.id}/memberships`,
      headers: { cookie: admin.cookie },
      payload: { email: patient.user.email, role: "ORG_PATIENT" },
    });
    expect(response.statusCode).toBe(409);

    await a.close();
  });

  it("returns 404 for a non-existent target user", async () => {
    const a = app();
    const { organization, admin } = await seedOrganization(a, "membership-nouser");

    const response = await a.inject({
      method: "POST",
      url: `/organizations/${organization.id}/memberships`,
      headers: { cookie: admin.cookie },
      payload: { email: uniqueEmail("membership-nouser-target"), role: "ORG_PATIENT" },
    });
    expect(response.statusCode).toBe(404);

    await a.close();
  });

  it("an org admin can remove a membership from their own organization", async () => {
    const a = app();
    const { organization, admin, pharmacist } = await seedOrganization(a, "membership-remove");

    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: organization.id, userId: pharmacist.user.id } },
    });

    const response = await a.inject({
      method: "DELETE",
      url: `/organizations/${organization.id}/memberships/${membership.id}`,
      headers: { cookie: admin.cookie },
    });
    expect(response.statusCode).toBe(204);

    const stillExists = await prisma.organizationMembership.findUnique({ where: { id: membership.id } });
    expect(stillExists).toBeNull();

    await a.close();
  });

  it("an ORG_PHARMACIST or ORG_PATIENT member (non-admin) cannot manage memberships in their own org", async () => {
    const a = app();
    const { organization, pharmacist, patient } = await seedOrganization(a, "membership-nonadmin");

    const listAsPharmacist = await a.inject({
      method: "GET",
      url: `/organizations/${organization.id}/memberships`,
      headers: { cookie: pharmacist.cookie },
    });
    const listAsPatient = await a.inject({
      method: "GET",
      url: `/organizations/${organization.id}/memberships`,
      headers: { cookie: patient.cookie },
    });

    expect(listAsPharmacist.statusCode).toBe(403);
    expect(listAsPatient.statusCode).toBe(403);

    await a.close();
  });

  it("an org admin of Organization A cannot list, add, or remove memberships of Organization B", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "membership-cross-a");
    const orgB = await seedOrganization(a, "membership-cross-b");

    const listAttempt = await a.inject({
      method: "GET",
      url: `/organizations/${orgB.organization.id}/memberships`,
      headers: { cookie: orgA.admin.cookie },
    });
    const addAttempt = await a.inject({
      method: "POST",
      url: `/organizations/${orgB.organization.id}/memberships`,
      headers: { cookie: orgA.admin.cookie },
      payload: { email: orgA.patient.user.email, role: "ORG_PATIENT" },
    });
    const bMembership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: orgB.organization.id, userId: orgB.pharmacist.user.id } },
    });
    const removeAttempt = await a.inject({
      method: "DELETE",
      url: `/organizations/${orgB.organization.id}/memberships/${bMembership.id}`,
      headers: { cookie: orgA.admin.cookie },
    });

    // 404, not 403 — Organization A's admin must never learn whether
    // Organization B's membership rows exist. See
    // docs/doseprepped/ARCHITECTURE.md "M5.4 — Authorization helpers".
    expect(listAttempt.statusCode).toBe(404);
    expect(addAttempt.statusCode).toBe(404);
    expect(removeAttempt.statusCode).toBe(404);

    // Confirm nothing was actually mutated.
    const stillExists = await prisma.organizationMembership.findUnique({ where: { id: bMembership.id } });
    expect(stillExists).not.toBeNull();

    await a.close();
  });

  it("organization membership cannot be spoofed through a request body organizationId — the URL path is authoritative", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "spoof-body-a");
    const orgB = await seedOrganization(a, "spoof-body-b");
    const { user: target } = await createUserDirectly(Role.PATIENT, "spoof-body-target");

    // Org A's admin POSTs to Org A's own memberships URL but tries to
    // smuggle Org B's id into the body — the server must derive the
    // organization purely from the URL path and ignore the body field.
    const response = await a.inject({
      method: "POST",
      url: `/organizations/${orgA.organization.id}/memberships`,
      headers: { cookie: orgA.admin.cookie },
      payload: { email: target.email, role: "ORG_PATIENT", organizationId: orgB.organization.id },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().membership.organizationId).toBe(orgA.organization.id);

    const inOrgB = await prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: orgB.organization.id, userId: target.id } },
    });
    expect(inOrgB).toBeNull();

    await a.close();
  });
});

describe("GET /organizations/me", () => {
  it("returns only the authenticated user's own memberships, never another user's", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "me-a");
    const orgB = await seedOrganization(a, "me-b");

    const response = await a.inject({
      method: "GET",
      url: "/organizations/me",
      headers: { cookie: orgA.admin.cookie },
    });

    expect(response.statusCode).toBe(200);
    const orgIds = response.json().memberships.map((m: { organizationId: string }) => m.organizationId);
    expect(orgIds).toEqual([orgA.organization.id]);
    expect(orgIds).not.toContain(orgB.organization.id);

    await a.close();
  });

  it("returns an empty list for a DosePrepped Direct (org-less) user", async () => {
    const a = app();
    const { cookie } = await userWithCookie(a, Role.PATIENT, "me-direct");

    const response = await a.inject({ method: "GET", url: "/organizations/me", headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().memberships).toEqual([]);

    await a.close();
  });

  it("rejects an unauthenticated request", async () => {
    const a = app();
    const response = await a.inject({ method: "GET", url: "/organizations/me" });
    expect(response.statusCode).toBe(401);
    await a.close();
  });
});

describe("GET /organizations/:organizationId — membership required", () => {
  it("a member of the organization (any role) can read it", async () => {
    const a = app();
    const { organization, pharmacist } = await seedOrganization(a, "read-member");
    const response = await a.inject({
      method: "GET",
      url: `/organizations/${organization.id}`,
      headers: { cookie: pharmacist.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().organization.id).toBe(organization.id);
    await a.close();
  });

  it("a non-member (including a DosePrepped Direct user) gets 404, never 403", async () => {
    const a = app();
    const { organization } = await seedOrganization(a, "read-nonmember");
    const { cookie } = await userWithCookie(a, Role.PATIENT, "read-nonmember-outsider");

    const response = await a.inject({
      method: "GET",
      url: `/organizations/${organization.id}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(404);
    await a.close();
  });

  it("a member of Organization A cannot read Organization B", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "read-cross-a");
    const orgB = await seedOrganization(a, "read-cross-b");

    const response = await a.inject({
      method: "GET",
      url: `/organizations/${orgB.organization.id}`,
      headers: { cookie: orgA.patient.cookie },
    });
    expect(response.statusCode).toBe(404);
    await a.close();
  });

  it("platform admin behavior remains correct — can read any organization via the platform-admin override", async () => {
    const a = app();
    const { organization } = await seedOrganization(a, "read-platform-admin");
    const { cookie } = await userWithCookie(a, Role.ADMIN, "read-platform-admin");

    const response = await a.inject({
      method: "GET",
      url: `/organizations/${organization.id}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    await a.close();
  });
});

describe("Tenant isolation — pharmacist queue", () => {
  it("an org-affiliated pharmacist sees only their own organization's questions in the global queue", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "queue-a");
    const orgB = await seedOrganization(a, "queue-b");

    const response = await a.inject({
      method: "GET",
      url: "/pharmacist/queue",
      headers: { cookie: orgA.pharmacist.cookie },
    });
    expect(response.statusCode).toBe(200);
    const ids = response.json().questions.map((q: { id: string }) => q.id);
    expect(ids).toContain(orgA.question.id);
    expect(ids).not.toContain(orgB.question.id);

    await a.close();
  });

  it("an org-less (DosePrepped Direct) pharmacist sees only org-less patients, not any organization's questions", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "queue-direct-a");
    const directPharmacist = await userWithCookie(a, Role.PHARMACIST, "queue-direct-pharmacist");
    const directPatient = await userWithCookie(a, Role.PATIENT, "queue-direct-patient");
    const directMedication = await createMedicationForPatient(a, directPatient.cookie);
    const directQuestion = await createQuestionForPatient(a, directPatient.cookie, directMedication.id);

    const response = await a.inject({
      method: "GET",
      url: "/pharmacist/queue",
      headers: { cookie: directPharmacist.cookie },
    });
    expect(response.statusCode).toBe(200);
    const ids = response.json().questions.map((q: { id: string }) => q.id);
    expect(ids).toContain(directQuestion.id);
    expect(ids).not.toContain(orgA.question.id);

    await a.close();
  });

  it("an org-affiliated pharmacist cannot claim another organization's question — 404, and the claim never applies", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "queue-claim-a");
    const orgB = await seedOrganization(a, "queue-claim-b");

    const claimAttempt = await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${orgB.question.id}/claim`,
      headers: { cookie: orgA.pharmacist.cookie },
    });
    expect(claimAttempt.statusCode).toBe(404);

    const stored = await prisma.medicationQuestion.findUniqueOrThrow({ where: { id: orgB.question.id } });
    expect(stored.pharmacistId).toBeNull();
    expect(stored.status).toBe("PHARMACIST_REQUESTED");

    await a.close();
  });

  it("an org-less pharmacist cannot claim an organization's question, and an org pharmacist cannot claim an org-less question", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "queue-claim-mixed-a");
    const directPharmacist = await userWithCookie(a, Role.PHARMACIST, "queue-claim-mixed-direct-pharmacist");
    const directPatient = await userWithCookie(a, Role.PATIENT, "queue-claim-mixed-direct-patient");
    const directMedication = await createMedicationForPatient(a, directPatient.cookie);
    const directQuestion = await createQuestionForPatient(a, directPatient.cookie, directMedication.id);

    const directPharmacistClaimsOrgQuestion = await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${orgA.question.id}/claim`,
      headers: { cookie: directPharmacist.cookie },
    });
    const orgPharmacistClaimsDirectQuestion = await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${directQuestion.id}/claim`,
      headers: { cookie: orgA.pharmacist.cookie },
    });

    expect(directPharmacistClaimsOrgQuestion.statusCode).toBe(404);
    expect(orgPharmacistClaimsDirectQuestion.statusCode).toBe(404);

    await a.close();
  });

  it("GET /organizations/:organizationId/pharmacist/queue — an org pharmacist sees their queue; a different organization's pharmacist is rejected", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "org-queue-route-a");
    const orgB = await seedOrganization(a, "org-queue-route-b");

    const own = await a.inject({
      method: "GET",
      url: `/organizations/${orgA.organization.id}/pharmacist/queue`,
      headers: { cookie: orgA.pharmacist.cookie },
    });
    expect(own.statusCode).toBe(200);
    const ownIds = own.json().questions.map((q: { id: string }) => q.id);
    expect(ownIds).toContain(orgA.question.id);
    expect(ownIds).not.toContain(orgB.question.id);

    const crossOrgAttempt = await a.inject({
      method: "GET",
      url: `/organizations/${orgB.organization.id}/pharmacist/queue`,
      headers: { cookie: orgA.pharmacist.cookie },
    });
    expect(crossOrgAttempt.statusCode).toBe(404);

    await a.close();
  });

  it("a pharmacist role alone (platform Role.PHARMACIST) is not enough — an org-less pharmacist is rejected from an organization's queue route", async () => {
    const a = app();
    const { organization } = await seedOrganization(a, "org-queue-route-outsider");
    const { cookie } = await userWithCookie(a, Role.PHARMACIST, "org-queue-route-outsider-pharmacist");

    const response = await a.inject({
      method: "GET",
      url: `/organizations/${organization.id}/pharmacist/queue`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(404);
    await a.close();
  });

  it("a patient cannot access an organization's pharmacist queue route even if they are a member of that organization", async () => {
    const a = app();
    const { organization, patient } = await seedOrganization(a, "org-queue-route-patient");

    const response = await a.inject({
      method: "GET",
      url: `/organizations/${organization.id}/pharmacist/queue`,
      headers: { cookie: patient.cookie },
    });
    expect(response.statusCode).toBe(403);
    await a.close();
  });
});

describe("Tenant isolation — analytics", () => {
  it("buildAnalyticsReport with organizationId only counts that organization's activity, never another organization's", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "analytics-scope-a");
    const orgB = await seedOrganization(a, "analytics-scope-b");

    const from = new Date(Date.now() - 60 * 60 * 1000);
    const to = new Date(Date.now() + 60 * 60 * 1000);

    const reportA = await buildAnalyticsReport({ from, to, organizationId: orgA.organization.id });
    const reportB = await buildAnalyticsReport({ from, to, organizationId: orgB.organization.id });

    expect(reportA.questionFunnel.totalQuestions).toBe(1);
    expect(reportB.questionFunnel.totalQuestions).toBe(1);
    expect(reportA.patientEngagement.totalPatients).toBe(1);
    expect(reportB.patientEngagement.totalPatients).toBe(1);

    await a.close();
  });

  it("GET /organizations/:organizationId/analytics/report — an org admin sees only their org's report", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "analytics-route-a");
    const orgB = await seedOrganization(a, "analytics-route-b");
    void orgB;

    const response = await a.inject({
      method: "GET",
      url: `/organizations/${orgA.organization.id}/analytics/report`,
      headers: { cookie: orgA.admin.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().questionFunnel.totalQuestions).toBe(1);

    await a.close();
  });

  it("an org admin of Organization A cannot fetch Organization B's analytics report", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "analytics-cross-a");
    const orgB = await seedOrganization(a, "analytics-cross-b");

    const response = await a.inject({
      method: "GET",
      url: `/organizations/${orgB.organization.id}/analytics/report`,
      headers: { cookie: orgA.admin.cookie },
    });
    expect(response.statusCode).toBe(404);

    await a.close();
  });

  it("an org pharmacist or org patient (non-admin) cannot access their own organization's analytics report", async () => {
    const a = app();
    const { organization, pharmacist, patient } = await seedOrganization(a, "analytics-nonadmin");

    const asPharmacist = await a.inject({
      method: "GET",
      url: `/organizations/${organization.id}/analytics/report`,
      headers: { cookie: pharmacist.cookie },
    });
    const asPatient = await a.inject({
      method: "GET",
      url: `/organizations/${organization.id}/analytics/report`,
      headers: { cookie: patient.cookie },
    });

    expect(asPharmacist.statusCode).toBe(403);
    expect(asPatient.statusCode).toBe(403);

    await a.close();
  });

  it("an organization admin cannot reach the global platform admin analytics endpoint — no global analytics exposure", async () => {
    const a = app();
    const { admin } = await seedOrganization(a, "analytics-no-global");

    const response = await a.inject({
      method: "GET",
      url: "/admin/analytics/report",
      headers: { cookie: admin.cookie },
    });
    expect(response.statusCode).toBe(403);

    await a.close();
  });

  it("platform admin behavior remains correct — global report still works and is unaffected by organizations existing", async () => {
    const a = app();
    await seedOrganization(a, "analytics-platform-admin-context");
    const { cookie } = await userWithCookie(a, Role.ADMIN, "analytics-platform-admin");

    const response = await a.inject({ method: "GET", url: "/admin/analytics/report", headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty("questionFunnel");

    await a.close();
  });

  it("a patient cannot switch organization context through any client-supplied parameter", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "analytics-no-spoof-a");
    const orgB = await seedOrganization(a, "analytics-no-spoof-b");

    // orgA's patient tries to reach orgB's analytics report by hitting
    // orgB's URL directly — organizationId always comes from the URL and
    // is always membership-checked, so this is 404, and there is no
    // request body/query field anywhere in this API that accepts an
    // organizationId override.
    const response = await a.inject({
      method: "GET",
      url: `/organizations/${orgB.organization.id}/analytics/report`,
      headers: { cookie: orgA.patient.cookie },
    });
    expect(response.statusCode).toBe(404);

    await a.close();
  });
});

describe("Regression — existing M0–M5.3 authorization is unaffected by M5.4", () => {
  it("patient ownership: a patient still cannot see another patient's medication", async () => {
    const a = app();
    const patientA = await userWithCookie(a, Role.PATIENT, "regression-ownership-a");
    const patientB = await userWithCookie(a, Role.PATIENT, "regression-ownership-b");
    const medication = await createMedicationForPatient(a, patientA.cookie);

    const response = await a.inject({
      method: "GET",
      url: `/medications/${medication.id}`,
      headers: { cookie: patientB.cookie },
    });
    expect(response.statusCode).toBe(404);

    await a.close();
  });

  it("pharmacist claim concurrency: still exactly one winner among two org-less pharmacists racing for an org-less question", async () => {
    const a = app();
    const patient = await userWithCookie(a, Role.PATIENT, "regression-race-patient");
    const medication = await createMedicationForPatient(a, patient.cookie);
    const question = await createQuestionForPatient(a, patient.cookie, medication.id);
    const pharmacistA = await userWithCookie(a, Role.PHARMACIST, "regression-race-a");
    const pharmacistB = await userWithCookie(a, Role.PHARMACIST, "regression-race-b");

    const [responseA, responseB] = await Promise.all([
      a.inject({
        method: "POST",
        url: `/pharmacist/questions/${question.id}/claim`,
        headers: { cookie: pharmacistA.cookie },
      }),
      a.inject({
        method: "POST",
        url: `/pharmacist/questions/${question.id}/claim`,
        headers: { cookie: pharmacistB.cookie },
      }),
    ]);

    const statusCodes = [responseA.statusCode, responseB.statusCode].sort();
    expect(statusCodes).toEqual([200, 409]);

    await a.close();
  });

  it("an org-less pharmacist and an org pharmacist racing for the SAME org question: only the org pharmacist can ever win", async () => {
    const a = app();
    const orgA = await seedOrganization(a, "regression-race-org");
    const directPharmacist = await userWithCookie(a, Role.PHARMACIST, "regression-race-org-direct");

    const [orgAttempt, directAttempt] = await Promise.all([
      a.inject({
        method: "POST",
        url: `/pharmacist/questions/${orgA.question.id}/claim`,
        headers: { cookie: orgA.pharmacist.cookie },
      }),
      a.inject({
        method: "POST",
        url: `/pharmacist/questions/${orgA.question.id}/claim`,
        headers: { cookie: directPharmacist.cookie },
      }),
    ]);

    expect(orgAttempt.statusCode).toBe(200);
    expect(directAttempt.statusCode).toBe(404);

    const stored = await prisma.medicationQuestion.findUniqueOrThrow({ where: { id: orgA.question.id } });
    expect(stored.pharmacistId).toBe(orgA.pharmacist.user.id);

    await a.close();
  });
});

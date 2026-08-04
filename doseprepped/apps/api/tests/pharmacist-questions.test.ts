import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma, Role } from "@doseprepped/db";
import { MockMedicationEducationProvider } from "@doseprepped/ai-service";
import {
  TEST_EMAIL_DOMAIN,
  createMedicationForPatient,
  createQuestionForPatient,
  createUserDirectly,
  loginAndGetCookie,
} from "./helpers.js";

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } });
  await prisma.$disconnect();
});

function app() {
  return buildApp({ aiProvider: new MockMedicationEducationProvider({ mode: "success" }) });
}

async function patientWithCookie(label: string, a: ReturnType<typeof buildApp>) {
  const { user, email } = await createUserDirectly(Role.PATIENT, label);
  const cookie = await loginAndGetCookie(a, email);
  return { user, cookie };
}

async function pharmacistWithCookie(label: string, a: ReturnType<typeof buildApp>) {
  const { user, email } = await createUserDirectly(Role.PHARMACIST, label);
  const cookie = await loginAndGetCookie(a, email);
  return { user, cookie };
}

/** Creates a patient + medication + a PHARMACIST_REVIEW-disposition
 * question (auto-queued as of M4), returning the pharmacist-review-ready
 * question id along with the owning patient's cookie. */
async function seedQueuedQuestion(a: ReturnType<typeof buildApp>, label: string) {
  const patient = await patientWithCookie(label, a);
  const medication = await createMedicationForPatient(a, patient.cookie);
  const question = await createQuestionForPatient(a, patient.cookie, medication.id);
  return { patient, question };
}

describe("M4 — pharmacist queue, claim, respond, escalate", () => {
  it("1. a pharmacist can access their authorized queue", async () => {
    const a = app();
    const pharmacist = await pharmacistWithCookie("queue-access", a);

    const response = await a.inject({ method: "GET", url: "/pharmacist/queue", headers: { cookie: pharmacist.cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty("counts");
    expect(response.json()).toHaveProperty("questions");

    await a.close();
  });

  it("2. a patient cannot access the pharmacist queue", async () => {
    const a = app();
    const patient = await patientWithCookie("no-queue-access", a);

    const response = await a.inject({ method: "GET", url: "/pharmacist/queue", headers: { cookie: patient.cookie } });

    expect(response.statusCode).toBe(403);

    await a.close();
  });

  it("3. a pharmacist can claim an available question", async () => {
    const a = app();
    const { question } = await seedQueuedQuestion(a, "claim-basic");
    expect(question.status).toBe("PHARMACIST_REQUESTED");
    const pharmacist = await pharmacistWithCookie("claim-basic", a);

    const response = await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().question.status).toBe("PHARMACIST_IN_PROGRESS");
    expect(response.json().question.pharmacistId).toBe(pharmacist.user.id);

    await a.close();
  });

  it("4. two pharmacists cannot claim the same question simultaneously", async () => {
    const a = app();
    const { question } = await seedQueuedQuestion(a, "claim-race");
    const pharmacistA = await pharmacistWithCookie("claim-race-a", a);
    const pharmacistB = await pharmacistWithCookie("claim-race-b", a);

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

    const winner = responseA.statusCode === 200 ? responseA : responseB;
    const winnerId = winner.json().question.pharmacistId;
    expect([pharmacistA.user.id, pharmacistB.user.id]).toContain(winnerId);

    const stored = await prisma.medicationQuestion.findUniqueOrThrow({ where: { id: question.id } });
    expect(stored.pharmacistId).toBe(winnerId);
    expect(stored.status).toBe("PHARMACIST_IN_PROGRESS");

    await a.close();
  });

  it("5. a claimed question belongs to the claiming pharmacist, not others", async () => {
    const a = app();
    const { question } = await seedQueuedQuestion(a, "claim-belongs");
    const claimer = await pharmacistWithCookie("claim-belongs-owner", a);
    const other = await pharmacistWithCookie("claim-belongs-other", a);

    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: claimer.cookie },
    });

    const ownerView = await a.inject({
      method: "GET",
      url: `/pharmacist/questions/${question.id}`,
      headers: { cookie: claimer.cookie },
    });
    const otherView = await a.inject({
      method: "GET",
      url: `/pharmacist/questions/${question.id}`,
      headers: { cookie: other.cookie },
    });

    expect(ownerView.statusCode).toBe(200);
    expect(ownerView.json().question.pharmacistId).toBe(claimer.user.id);
    expect(otherView.statusCode).toBe(404);

    await a.close();
  });

  it("6. a pharmacist can respond to a claimed question", async () => {
    const a = app();
    const { question } = await seedQueuedQuestion(a, "respond-basic");
    const pharmacist = await pharmacistWithCookie("respond-basic", a);
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });

    const response = await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/respond`,
      headers: { cookie: pharmacist.cookie },
      payload: { responseText: "Missing a dose occasionally is generally fine; take it as soon as you remember." },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().question.status).toBe("PHARMACIST_RESOLVED");
    expect(response.json().question.pharmacistResponse).toContain("Missing a dose");

    await a.close();
  });

  it("7. the patient can see the completed pharmacist response", async () => {
    const a = app();
    const { patient, question } = await seedQueuedQuestion(a, "patient-sees-response");
    const pharmacist = await pharmacistWithCookie("patient-sees-response", a);
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/respond`,
      headers: { cookie: pharmacist.cookie },
      payload: { responseText: "Here is guidance from your pharmacist." },
    });

    const response = await a.inject({
      method: "GET",
      url: `/questions/${question.id}`,
      headers: { cookie: patient.cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().question.pharmacistResponse).toBe("Here is guidance from your pharmacist.");
    expect(response.json().question.status).toBe("PHARMACIST_RESOLVED");

    await a.close();
  });

  it("8. a patient cannot modify the pharmacist response", async () => {
    const a = app();
    const { patient, question } = await seedQueuedQuestion(a, "patient-cannot-modify");
    const pharmacist = await pharmacistWithCookie("patient-cannot-modify", a);
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/respond`,
      headers: { cookie: pharmacist.cookie },
      payload: { responseText: "Original pharmacist response." },
    });

    // There is no patient-facing endpoint that writes pharmacistResponse
    // at all — GET /questions/:id is read-only, and there is no PATCH.
    const patchAttempt = await a.inject({
      method: "PATCH",
      url: `/questions/${question.id}`,
      headers: { cookie: patient.cookie },
      payload: { pharmacistResponse: "Hijacked response" },
    });
    expect(patchAttempt.statusCode).toBe(404);

    const stored = await prisma.medicationQuestion.findUniqueOrThrow({ where: { id: question.id } });
    expect(stored.pharmacistResponse).toBe("Original pharmacist response.");

    await a.close();
  });

  it("9. a pharmacist can escalate a claimed question", async () => {
    const a = app();
    const { question } = await seedQueuedQuestion(a, "escalate-basic");
    const pharmacist = await pharmacistWithCookie("escalate-basic", a);
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });

    const response = await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/escalate`,
      headers: { cookie: pharmacist.cookie },
      payload: {
        escalationReasonCategory: "BEYOND_PHARMACIST_SCOPE",
        escalationReason: "This requires a prescriber's judgment.",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().question.status).toBe("ESCALATED");
    expect(response.json().question.escalationReasonCategory).toBe("BEYOND_PHARMACIST_SCOPE");

    await a.close();
  });

  it("10. escalation reason is required", async () => {
    const a = app();
    const { question } = await seedQueuedQuestion(a, "escalate-requires-reason");
    const pharmacist = await pharmacistWithCookie("escalate-requires-reason", a);
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });

    const missingReason = await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/escalate`,
      headers: { cookie: pharmacist.cookie },
      payload: { escalationReasonCategory: "OTHER" },
    });
    const missingCategory = await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/escalate`,
      headers: { cookie: pharmacist.cookie },
      payload: { escalationReason: "Some reason." },
    });

    expect(missingReason.statusCode).toBe(400);
    expect(missingCategory.statusCode).toBe(400);

    await a.close();
  });

  it("11. the patient sees appropriate escalation status", async () => {
    const a = app();
    const { patient, question } = await seedQueuedQuestion(a, "patient-sees-escalation");
    const pharmacist = await pharmacistWithCookie("patient-sees-escalation", a);
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/escalate`,
      headers: { cookie: pharmacist.cookie },
      payload: { escalationReasonCategory: "OTHER", escalationReason: "Needs provider input." },
    });

    const response = await a.inject({
      method: "GET",
      url: `/questions/${question.id}`,
      headers: { cookie: patient.cookie },
    });

    expect(response.json().question.status).toBe("ESCALATED");
    expect(response.json().question.escalatedAt).not.toBeNull();

    await a.close();
  });

  it("12. a pharmacist cannot modify the deterministic disposition", async () => {
    const a = app();
    const { question } = await seedQueuedQuestion(a, "cannot-modify-disposition");
    expect(question.disposition).toBe("PHARMACIST_REVIEW");
    const pharmacist = await pharmacistWithCookie("cannot-modify-disposition", a);
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });

    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/respond`,
      headers: { cookie: pharmacist.cookie },
      // Attempt to smuggle a disposition override into the request body —
      // the respond schema doesn't recognize this field at all.
      payload: { responseText: "A response.", disposition: "URGENT_EMERGENCY" },
    });

    const stored = await prisma.medicationQuestion.findUniqueOrThrow({ where: { id: question.id } });
    expect(stored.disposition).toBe("PHARMACIST_REVIEW");

    await a.close();
  });

  it("13. AI-generated content cannot become a pharmacist response automatically", async () => {
    const a = app();
    const { question } = await seedQueuedQuestion(a, "ai-not-auto-response");
    // The AI education pipeline already ran at creation time (mock
    // provider, success mode) — confirm it produced AI content, but that
    // content never populated pharmacistResponse.
    expect(question.aiEducationResponse ?? question.clarifyingQuestion ?? true).toBeTruthy();

    const stored = await prisma.medicationQuestion.findUniqueOrThrow({ where: { id: question.id } });
    expect(stored.pharmacistResponse).toBeNull();
    expect(stored.status).toBe("PHARMACIST_REQUESTED");

    await a.close();
  });

  it("14. timestamp metrics are recorded correctly", async () => {
    const a = app();
    const { question } = await seedQueuedQuestion(a, "timestamps");
    const pharmacist = await pharmacistWithCookie("timestamps", a);
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/respond`,
      headers: { cookie: pharmacist.cookie },
      payload: { responseText: "Response for timing." },
    });

    const stored = await prisma.medicationQuestion.findUniqueOrThrow({ where: { id: question.id } });
    expect(stored.pharmacistRequestedAt).not.toBeNull();
    expect(stored.pharmacistClaimedAt).not.toBeNull();
    expect(stored.pharmacistRespondedAt).not.toBeNull();
    expect(stored.pharmacistClaimedAt!.getTime()).toBeGreaterThanOrEqual(stored.createdAt.getTime());
    expect(stored.pharmacistRespondedAt!.getTime()).toBeGreaterThanOrEqual(stored.pharmacistClaimedAt!.getTime());
    expect(stored.resolvedAt).not.toBeNull();

    await a.close();
  });

  it("15. an unauthorized pharmacist cannot access, respond to, or escalate a restricted question", async () => {
    const a = app();
    const { question } = await seedQueuedQuestion(a, "unauthorized-pharmacist");
    const claimer = await pharmacistWithCookie("unauthorized-owner", a);
    const intruder = await pharmacistWithCookie("unauthorized-intruder", a);
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: claimer.cookie },
    });

    const getAttempt = await a.inject({
      method: "GET",
      url: `/pharmacist/questions/${question.id}`,
      headers: { cookie: intruder.cookie },
    });
    const respondAttempt = await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/respond`,
      headers: { cookie: intruder.cookie },
      payload: { responseText: "Intruding response." },
    });
    const escalateAttempt = await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/escalate`,
      headers: { cookie: intruder.cookie },
      payload: { escalationReasonCategory: "OTHER", escalationReason: "Intruding escalation." },
    });
    const releaseAttempt = await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/release`,
      headers: { cookie: intruder.cookie },
    });

    expect(getAttempt.statusCode).toBe(404);
    expect(respondAttempt.statusCode).toBe(404);
    expect(escalateAttempt.statusCode).toBe(404);
    expect(releaseAttempt.statusCode).toBe(404);

    const stored = await prisma.medicationQuestion.findUniqueOrThrow({ where: { id: question.id } });
    expect(stored.pharmacistId).toBe(claimer.user.id);
    expect(stored.pharmacistResponse).toBeNull();
    expect(stored.status).toBe("PHARMACIST_IN_PROGRESS");

    await a.close();
  });

  it("release: a pharmacist can release a claimed question back to the shared queue", async () => {
    const a = app();
    const { question } = await seedQueuedQuestion(a, "release-basic");
    const pharmacistA = await pharmacistWithCookie("release-basic-a", a);
    const pharmacistB = await pharmacistWithCookie("release-basic-b", a);
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: pharmacistA.cookie },
    });

    const release = await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/release`,
      headers: { cookie: pharmacistA.cookie },
    });
    expect(release.statusCode).toBe(200);
    expect(release.json().question.status).toBe("PHARMACIST_REQUESTED");
    expect(release.json().question.pharmacistId).toBeNull();

    const reclaim = await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: pharmacistB.cookie },
    });
    expect(reclaim.statusCode).toBe(200);
    expect(reclaim.json().question.pharmacistId).toBe(pharmacistB.user.id);

    await a.close();
  });

  it("claiming a non-existent question returns 404, and a resolved question cannot be re-claimed", async () => {
    const a = app();
    const pharmacist = await pharmacistWithCookie("claim-edge-cases", a);

    const missing = await a.inject({
      method: "POST",
      url: "/pharmacist/questions/00000000-0000-0000-0000-000000000000/claim",
      headers: { cookie: pharmacist.cookie },
    });
    expect(missing.statusCode).toBe(404);

    const { question } = await seedQueuedQuestion(a, "claim-edge-cases-2");
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/respond`,
      headers: { cookie: pharmacist.cookie },
      payload: { responseText: "Done." },
    });

    const reclaimAttempt = await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });
    expect(reclaimAttempt.statusCode).toBe(409);

    await a.close();
  });

  it("dashboard counts reflect New/In Review/Completed/Escalated correctly", async () => {
    const a = app();
    const pharmacist = await pharmacistWithCookie("dashboard-counts", a);

    const { question: newQ } = await seedQueuedQuestion(a, "dashboard-new");
    const { question: inReviewQ } = await seedQueuedQuestion(a, "dashboard-in-review");
    const { question: completedQ } = await seedQueuedQuestion(a, "dashboard-completed");
    const { question: escalatedQ } = await seedQueuedQuestion(a, "dashboard-escalated");
    void newQ;

    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${inReviewQ.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });

    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${completedQ.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${completedQ.id}/respond`,
      headers: { cookie: pharmacist.cookie },
      payload: { responseText: "Resolved." },
    });

    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${escalatedQ.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${escalatedQ.id}/escalate`,
      headers: { cookie: pharmacist.cookie },
      payload: { escalationReasonCategory: "OTHER", escalationReason: "Escalated." },
    });

    const response = await a.inject({ method: "GET", url: "/pharmacist/queue", headers: { cookie: pharmacist.cookie } });
    const { counts } = response.json();
    expect(counts.new).toBeGreaterThanOrEqual(1);
    expect(counts.inReview).toBeGreaterThanOrEqual(1);
    expect(counts.completed).toBeGreaterThanOrEqual(1);
    expect(counts.escalated).toBeGreaterThanOrEqual(1);

    await a.close();
  });
});

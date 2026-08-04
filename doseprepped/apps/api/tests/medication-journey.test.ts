import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma, Role } from "@doseprepped/db";
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

async function patientWithCookie(app: ReturnType<typeof buildApp>, label: string) {
  const { user, email } = await createUserDirectly(Role.PATIENT, label);
  const cookie = await loginAndGetCookie(app, email);
  return { user, cookie };
}

describe("POST/GET /medications/:id/adherence-events", () => {
  it("lets a patient record a taken dose", async () => {
    const app = buildApp();
    const { cookie } = await patientWithCookie(app, "adherence-create");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await app.inject({
      method: "POST",
      url: `/medications/${medication.id}/adherence-events`,
      headers: { cookie },
      payload: { status: "TAKEN" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.event.status).toBe("TAKEN");
    expect(body.event.medicationId).toBe(medication.id);
    expect(body.event.scheduledAt).toBeTruthy();
    expect(body.event.recordedAt).toBeTruthy();

    await app.close();
  });

  it("accepts an explicit scheduledAt", async () => {
    const app = buildApp();
    const { cookie } = await patientWithCookie(app, "adherence-scheduled-at");
    const medication = await createMedicationForPatient(app, cookie);
    const scheduledAt = "2026-02-01T08:00:00.000Z";

    const response = await app.inject({
      method: "POST",
      url: `/medications/${medication.id}/adherence-events`,
      headers: { cookie },
      payload: { status: "MISSED", scheduledAt },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().event.scheduledAt).toBe(scheduledAt);

    await app.close();
  });

  it("rejects an invalid status value", async () => {
    const app = buildApp();
    const { cookie } = await patientWithCookie(app, "adherence-invalid-status");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await app.inject({
      method: "POST",
      url: `/medications/${medication.id}/adherence-events`,
      headers: { cookie },
      payload: { status: "TAKEN_TWICE" },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it("rejects unauthenticated requests", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/medications/does-not-matter/adherence-events",
      payload: { status: "TAKEN" },
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it("never lets a patient record or read another patient's adherence events", async () => {
    const app = buildApp();
    const owner = await patientWithCookie(app, "adherence-owner");
    const intruder = await patientWithCookie(app, "adherence-intruder");
    const medication = await createMedicationForPatient(app, owner.cookie);

    const createResponse = await app.inject({
      method: "POST",
      url: `/medications/${medication.id}/adherence-events`,
      headers: { cookie: intruder.cookie },
      payload: { status: "TAKEN" },
    });
    expect(createResponse.statusCode).toBe(404);

    const listResponse = await app.inject({
      method: "GET",
      url: `/medications/${medication.id}/adherence-events`,
      headers: { cookie: intruder.cookie },
    });
    expect(listResponse.statusCode).toBe(404);

    await app.close();
  });

  it("refuses to record a new dose for an archived (inactive) medication, but reading history still works", async () => {
    const app = buildApp();
    const { cookie } = await patientWithCookie(app, "adherence-archived");
    const medication = await createMedicationForPatient(app, cookie);

    await app.inject({
      method: "POST",
      url: `/medications/${medication.id}/adherence-events`,
      headers: { cookie },
      payload: { status: "TAKEN" },
    });
    await app.inject({ method: "POST", url: `/medications/${medication.id}/archive`, headers: { cookie } });

    const createResponse = await app.inject({
      method: "POST",
      url: `/medications/${medication.id}/adherence-events`,
      headers: { cookie },
      payload: { status: "TAKEN" },
    });
    expect(createResponse.statusCode).toBe(409);

    const listResponse = await app.inject({
      method: "GET",
      url: `/medications/${medication.id}/adherence-events`,
      headers: { cookie },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().events).toHaveLength(1);

    await app.close();
  });

  it("computes the documented adherence percentage: taken / (taken + missed + skipped), rounded", async () => {
    const app = buildApp();
    const { cookie } = await patientWithCookie(app, "adherence-percentage");
    const medication = await createMedicationForPatient(app, cookie);

    for (const status of ["TAKEN", "TAKEN", "MISSED"]) {
      await app.inject({
        method: "POST",
        url: `/medications/${medication.id}/adherence-events`,
        headers: { cookie },
        payload: { status },
      });
    }

    const response = await app.inject({
      method: "GET",
      url: `/medications/${medication.id}/adherence-events`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const { summary } = response.json();
    // 2 taken / 3 total = 66.67% → rounds to 67.
    expect(summary).toEqual({
      takenCount: 2,
      missedCount: 1,
      skippedCount: 0,
      totalCount: 3,
      adherencePercentage: 67,
    });

    await app.close();
  });

  it("returns a null adherencePercentage (never 0%) when there are zero recorded events", async () => {
    const app = buildApp();
    const { cookie } = await patientWithCookie(app, "adherence-empty");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await app.inject({
      method: "GET",
      url: `/medications/${medication.id}/adherence-events`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const { summary, events } = response.json();
    expect(events).toHaveLength(0);
    expect(summary.adherencePercentage).toBeNull();

    await app.close();
  });
});

describe("POST/GET /medications/:id/check-ins", () => {
  it("lets a patient record a check-in with optional notes", async () => {
    const app = buildApp();
    const { cookie } = await patientWithCookie(app, "checkin-create");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await app.inject({
      method: "POST",
      url: `/medications/${medication.id}/check-ins`,
      headers: { cookie },
      payload: { response: "HAVING_SOME_ISSUES", notes: "Some nausea after doses." },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.checkIn.response).toBe("HAVING_SOME_ISSUES");
    expect(body.checkIn.notes).toBe("Some nausea after doses.");

    await app.close();
  });

  it("allows omitting notes", async () => {
    const app = buildApp();
    const { cookie } = await patientWithCookie(app, "checkin-no-notes");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await app.inject({
      method: "POST",
      url: `/medications/${medication.id}/check-ins`,
      headers: { cookie },
      payload: { response: "DOING_WELL" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().checkIn.notes).toBeNull();

    await app.close();
  });

  it("rejects an invalid response value", async () => {
    const app = buildApp();
    const { cookie } = await patientWithCookie(app, "checkin-invalid");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await app.inject({
      method: "POST",
      url: `/medications/${medication.id}/check-ins`,
      headers: { cookie },
      payload: { response: "FEELING_GREAT" },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it("never lets a patient record or read another patient's check-ins", async () => {
    const app = buildApp();
    const owner = await patientWithCookie(app, "checkin-owner");
    const intruder = await patientWithCookie(app, "checkin-intruder");
    const medication = await createMedicationForPatient(app, owner.cookie);

    const createResponse = await app.inject({
      method: "POST",
      url: `/medications/${medication.id}/check-ins`,
      headers: { cookie: intruder.cookie },
      payload: { response: "DOING_WELL" },
    });
    expect(createResponse.statusCode).toBe(404);

    const listResponse = await app.inject({
      method: "GET",
      url: `/medications/${medication.id}/check-ins`,
      headers: { cookie: intruder.cookie },
    });
    expect(listResponse.statusCode).toBe(404);

    await app.close();
  });
});

describe("GET /medications/:id/timeline", () => {
  it("includes a MEDICATION_STARTED entry for a brand-new medication", async () => {
    const app = buildApp();
    const { cookie } = await patientWithCookie(app, "timeline-started");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await app.inject({
      method: "GET",
      url: `/medications/${medication.id}/timeline`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const { timeline } = response.json();
    expect(timeline.some((e: { type: string }) => e.type === "MEDICATION_STARTED")).toBe(true);

    await app.close();
  });

  it("derives dose, check-in, and question entries from existing records", async () => {
    const app = buildApp();
    const { cookie } = await patientWithCookie(app, "timeline-derived");
    const medication = await createMedicationForPatient(app, cookie);

    await app.inject({
      method: "POST",
      url: `/medications/${medication.id}/adherence-events`,
      headers: { cookie },
      payload: { status: "TAKEN" },
    });
    await app.inject({
      method: "POST",
      url: `/medications/${medication.id}/check-ins`,
      headers: { cookie },
      payload: { response: "DOING_WELL" },
    });
    const question = await createQuestionForPatient(app, cookie, medication.id, { category: "STORAGE" });

    const response = await app.inject({
      method: "GET",
      url: `/medications/${medication.id}/timeline`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const { timeline } = response.json();
    const types = timeline.map((e: { type: string }) => e.type);
    expect(types).toContain("DOSE_TAKEN");
    expect(types).toContain("CHECK_IN_COMPLETED");
    expect(types).toContain("QUESTION_SUBMITTED");
    const questionEntry = timeline.find((e: { type: string }) => e.type === "QUESTION_SUBMITTED");
    expect(questionEntry.questionId).toBe(question.id);

    await app.close();
  });

  it("never lets a patient read another patient's medication timeline", async () => {
    const app = buildApp();
    const owner = await patientWithCookie(app, "timeline-owner");
    const intruder = await patientWithCookie(app, "timeline-intruder");
    const medication = await createMedicationForPatient(app, owner.cookie);

    const response = await app.inject({
      method: "GET",
      url: `/medications/${medication.id}/timeline`,
      headers: { cookie: intruder.cookie },
    });
    expect(response.statusCode).toBe(404);

    await app.close();
  });
});

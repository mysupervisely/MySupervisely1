import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma, Role } from "@doseprepped/db";
import {
  TEST_EMAIL_DOMAIN,
  createMedicationForPatient,
  createUserDirectly,
  loginAndGetCookie,
} from "./helpers.js";

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } });
  await prisma.$disconnect();
});

async function createPatientWithCookie(app: ReturnType<typeof buildApp>, label: string) {
  const { user, email } = await createUserDirectly(Role.PATIENT, label);
  const cookie = await loginAndGetCookie(app, email);
  return { user, cookie };
}

describe("POST /questions", () => {
  it("creates a question for a specific medication (medication-detail flow)", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "q-create");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await app.inject({
      method: "POST",
      url: "/questions",
      headers: { cookie },
      payload: {
        medicationId: medication.id,
        category: "MISSED_DOSE",
        questionText: "I missed my dose this morning, what should I do?",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.question.medicationId).toBe(medication.id);
    expect(body.question.category).toBe("MISSED_DOSE");
    expect(body.question.status).toBe("RECEIVED");

    await app.close();
  });

  it("creates a question after selecting among several medications (home flow)", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "q-create-home");
    await createMedicationForPatient(app, cookie, { name: "Metformin" });
    const selected = await createMedicationForPatient(app, cookie, { name: "Semaglutide" });

    const response = await app.inject({
      method: "POST",
      url: "/questions",
      headers: { cookie },
      payload: {
        medicationId: selected.id,
        category: "GENERAL_INFO",
        questionText: "What does this medication do?",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.question.medicationId).toBe(selected.id);
    expect(body.question.medicationSnapshot.name).toBe("Semaglutide");

    await app.close();
  });

  it("requires a medication", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "q-req-med");

    const response = await app.inject({
      method: "POST",
      url: "/questions",
      headers: { cookie },
      payload: { category: "GENERAL_INFO", questionText: "Anything?" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().details.fieldErrors.medicationId).toBeDefined();

    await app.close();
  });

  it("requires a category", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "q-req-cat");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await app.inject({
      method: "POST",
      url: "/questions",
      headers: { cookie },
      payload: { medicationId: medication.id, questionText: "Anything?" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().details.fieldErrors.category).toBeDefined();

    await app.close();
  });

  it("requires question text", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "q-req-text");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await app.inject({
      method: "POST",
      url: "/questions",
      headers: { cookie },
      payload: { medicationId: medication.id, category: "GENERAL_INFO", questionText: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().details.fieldErrors.questionText).toBeDefined();

    await app.close();
  });

  it("rejects an invalid category value", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "q-invalid-cat");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await app.inject({
      method: "POST",
      url: "/questions",
      headers: { cookie },
      payload: { medicationId: medication.id, category: "NOT_A_REAL_CATEGORY", questionText: "Hi" },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it("rejects unauthenticated requests", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/questions",
      payload: { medicationId: "whatever", category: "GENERAL_INFO", questionText: "Hi" },
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it("rejects creating a question using another patient's medication ID", async () => {
    const app = buildApp();
    const owner = await createPatientWithCookie(app, "q-hijack-owner");
    const intruder = await createPatientWithCookie(app, "q-hijack-intruder");
    const ownerMedication = await createMedicationForPatient(app, owner.cookie);

    const response = await app.inject({
      method: "POST",
      url: "/questions",
      headers: { cookie: intruder.cookie },
      payload: {
        medicationId: ownerMedication.id,
        category: "OTHER",
        questionText: "Trying to use someone else's medication.",
      },
    });

    expect(response.statusCode).toBe(404);

    const ownerQuestions = await app.inject({
      method: "GET",
      url: "/questions",
      headers: { cookie: owner.cookie },
    });
    expect(ownerQuestions.json().questions).toHaveLength(0);

    await app.close();
  });
});

describe("Medication snapshot behavior", () => {
  it("captures the medication's fields correctly at creation time", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "q-snapshot");
    const medication = await createMedicationForPatient(app, cookie, {
      name: "Atorvastatin",
      strength: "20 mg",
      directions: "Take one tablet at bedtime.",
      frequency: "Once daily",
      route: "Oral",
    });

    const response = await app.inject({
      method: "POST",
      url: "/questions",
      headers: { cookie },
      payload: { medicationId: medication.id, category: "GENERAL_INFO", questionText: "What is this for?" },
    });

    const snapshot = response.json().question.medicationSnapshot;
    expect(snapshot).toEqual({
      name: "Atorvastatin",
      strength: "20 mg",
      directions: "Take one tablet at bedtime.",
      frequency: "Once daily",
      route: "Oral",
    });

    await app.close();
  });

  it("does not change the snapshot when the medication is edited afterward", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "q-snapshot-immutable");
    const medication = await createMedicationForPatient(app, cookie, {
      directions: "Take one tablet by mouth once daily.",
    });

    const created = await app.inject({
      method: "POST",
      url: "/questions",
      headers: { cookie },
      payload: { medicationId: medication.id, category: "ADMINISTRATION", questionText: "How do I take this?" },
    });
    const questionId = created.json().question.id;

    await app.inject({
      method: "PATCH",
      url: `/medications/${medication.id}`,
      headers: { cookie },
      payload: { directions: "Take two tablets by mouth twice daily now." },
    });

    const refetched = await app.inject({
      method: "GET",
      url: `/questions/${questionId}`,
      headers: { cookie },
    });

    expect(refetched.json().question.medicationSnapshot.directions).toBe(
      "Take one tablet by mouth once daily.",
    );

    await app.close();
  });

  it("captures other active medications only for interaction/side-effect categories", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "q-other-meds");
    const target = await createMedicationForPatient(app, cookie, { name: "Warfarin" });
    await createMedicationForPatient(app, cookie, { name: "Ibuprofen" });

    const interactionQuestion = await app.inject({
      method: "POST",
      url: "/questions",
      headers: { cookie },
      payload: { medicationId: target.id, category: "DRUG_INTERACTION", questionText: "Is this safe together?" },
    });
    expect(interactionQuestion.json().question.otherMedicationsSnapshot).toEqual([
      { name: "Ibuprofen", strength: "10 mg" },
    ]);

    const generalQuestion = await app.inject({
      method: "POST",
      url: "/questions",
      headers: { cookie },
      payload: { medicationId: target.id, category: "STORAGE", questionText: "How should I store this?" },
    });
    expect(generalQuestion.json().question.otherMedicationsSnapshot).toBeNull();

    await app.close();
  });
});

describe("GET /questions and /questions/:id", () => {
  it("lets a patient retrieve their own questions", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "q-list");
    const medication = await createMedicationForPatient(app, cookie);
    await app.inject({
      method: "POST",
      url: "/questions",
      headers: { cookie },
      payload: { medicationId: medication.id, category: "OTHER", questionText: "General question." },
    });

    const response = await app.inject({ method: "GET", url: "/questions", headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().questions).toHaveLength(1);

    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    const app = buildApp();
    const listResponse = await app.inject({ method: "GET", url: "/questions" });
    const detailResponse = await app.inject({ method: "GET", url: "/questions/does-not-matter" });

    expect(listResponse.statusCode).toBe(401);
    expect(detailResponse.statusCode).toBe(401);

    await app.close();
  });

  it("never lets a patient retrieve another patient's question", async () => {
    const app = buildApp();
    const owner = await createPatientWithCookie(app, "q-owner");
    const intruder = await createPatientWithCookie(app, "q-intruder");
    const medication = await createMedicationForPatient(app, owner.cookie);

    const created = await app.inject({
      method: "POST",
      url: "/questions",
      headers: { cookie: owner.cookie },
      payload: { medicationId: medication.id, category: "OTHER", questionText: "Private question." },
    });
    const questionId = created.json().question.id;

    const response = await app.inject({
      method: "GET",
      url: `/questions/${questionId}`,
      headers: { cookie: intruder.cookie },
    });
    expect(response.statusCode).toBe(404);

    await app.close();
  });
});

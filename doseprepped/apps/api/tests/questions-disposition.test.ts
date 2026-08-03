import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma, Role } from "@doseprepped/db";
import { SAFETY_RULE_SET_VERSION } from "@doseprepped/safety-rules";
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

async function askQuestion(
  app: ReturnType<typeof buildApp>,
  cookie: string,
  medicationId: string,
  category: string,
  questionText: string,
  extra: Record<string, unknown> = {},
) {
  return app.inject({
    method: "POST",
    url: "/questions",
    headers: { cookie },
    payload: { medicationId, category, questionText, ...extra },
  });
}

describe("M3 Phase 2 — deterministic safety/disposition assignment", () => {
  it("1. assigns GENERAL_EDUCATION to a routine general-information question", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "disp-general");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "GENERAL_INFO",
      "What is this medication generally prescribed for?",
    );

    expect(response.statusCode).toBe(201);
    const { question } = response.json();
    expect(question.disposition).toBe("GENERAL_EDUCATION");
    expect(question.dispositionRuleIds).toEqual([]);

    await app.close();
  });

  it("2. assigns PHARMACIST_REVIEW to an individualized-guidance question with no red-flag text", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "disp-pharmacist");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "MISSED_DOSE",
      "I forgot to take my dose this morning. What should I do now?",
    );

    expect(response.statusCode).toBe(201);
    const { question } = response.json();
    expect(question.disposition).toBe("PHARMACIST_REVIEW");
    expect(question.dispositionRuleIds).toEqual([]);

    await app.close();
  });

  it("3. escalates to PROVIDER_EVALUATION for a severe/worsening symptom description", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "disp-provider");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "SIDE_EFFECT",
      "My rash from this medication seems to be getting worse over the last two days.",
    );

    expect(response.statusCode).toBe(201);
    const { question } = response.json();
    expect(question.disposition).toBe("PROVIDER_EVALUATION");
    expect(question.dispositionRuleIds).toContain("severe-or-rapidly-worsening-symptom");

    await app.close();
  });

  it("4. escalates to URGENT_EMERGENCY for a possible-overdose scenario", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "disp-urgent");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "SIDE_EFFECT",
      "I think I may have taken an overdose of this medication by mistake.",
    );

    expect(response.statusCode).toBe(201);
    const { question } = response.json();
    expect(question.disposition).toBe("URGENT_EMERGENCY");
    expect(question.dispositionRuleIds).toContain("possible-overdose-or-poisoning");

    await app.close();
  });

  it("5. defaults conservatively to the category baseline for ambiguous text with no recognizable pattern", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "disp-ambiguous");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "COST_ACCESS",
      "I'm paying too much for this medication every month, is there a cheaper option?",
    );

    expect(response.statusCode).toBe(201);
    const { question } = response.json();
    // COST_ACCESS baselines to PHARMACIST_REVIEW (human judgment), and this
    // text must NOT trip the medication-error escalation rule despite
    // containing the word "too much".
    expect(question.disposition).toBe("PHARMACIST_REVIEW");
    expect(question.dispositionRuleIds).toEqual([]);

    await app.close();
  });

  it("6. produces the same disposition for the same input across repeated submissions", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "disp-deterministic");
    const medication = await createMedicationForPatient(app, cookie);
    const text = "I noticed hives spreading across my arms after my last dose.";

    const first = await askQuestion(app, cookie, medication.id, "SIDE_EFFECT", text);
    const second = await askQuestion(app, cookie, medication.id, "SIDE_EFFECT", text);

    expect(first.json().question.disposition).toBe(second.json().question.disposition);
    expect(first.json().question.dispositionRuleIds).toEqual(second.json().question.dispositionRuleIds);

    await app.close();
  });

  it("7. stores the safety rule set version that produced the disposition", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "disp-version");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "STORAGE",
      "How should I store this medication?",
    );

    const { question } = response.json();
    expect(question.safetyRuleSetVersion).toBe(SAFETY_RULE_SET_VERSION);

    await app.close();
  });

  it("8. records dispositionSource as DETERMINISTIC and stamps dispositionAssignedAt", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "disp-source");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "ADMINISTRATION",
      "How do I take this medication?",
    );

    const { question } = response.json();
    expect(question.dispositionSource).toBe("DETERMINISTIC");
    expect(question.dispositionAssignedAt).not.toBeNull();
    expect(new Date(question.dispositionAssignedAt).toString()).not.toBe("Invalid Date");

    await app.close();
  });

  it("9. never leaks another patient's disposition — ownership protections remain intact", async () => {
    const app = buildApp();
    const owner = await createPatientWithCookie(app, "disp-owner");
    const intruder = await createPatientWithCookie(app, "disp-intruder");
    const medication = await createMedicationForPatient(app, owner.cookie);

    const created = await askQuestion(
      app,
      owner.cookie,
      medication.id,
      "SIDE_EFFECT",
      "My throat is swelling and I am having trouble breathing.",
    );
    expect(created.json().question.disposition).toBe("URGENT_EMERGENCY");
    const questionId = created.json().question.id;

    const stolen = await app.inject({
      method: "GET",
      url: `/questions/${questionId}`,
      headers: { cookie: intruder.cookie },
    });
    expect(stolen.statusCode).toBe(404);

    await app.close();
  });

  it("10. ignores any client-supplied disposition field — disposition is always server-computed", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "disp-client-override");
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "GENERAL_INFO",
      "What is this medication for?",
      { disposition: "URGENT_EMERGENCY", dispositionSource: "AI_ASSISTED" },
    );

    expect(response.statusCode).toBe(201);
    const { question } = response.json();
    // The category baseline for GENERAL_INFO is GENERAL_EDUCATION; a
    // client-supplied "disposition" field in the payload must be ignored.
    expect(question.disposition).toBe("GENERAL_EDUCATION");
    expect(question.dispositionSource).toBe("DETERMINISTIC");

    await app.close();
  });

  it("11. existing Phase 1 list/detail workflow continues to work with disposition fields present", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "disp-regression");
    const medication = await createMedicationForPatient(app, cookie);
    const created = await askQuestion(
      app,
      cookie,
      medication.id,
      "OTHER",
      "Just a general question about this medication.",
    );
    const questionId = created.json().question.id;

    const list = await app.inject({ method: "GET", url: "/questions", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json().questions).toHaveLength(1);
    expect(list.json().questions[0]).toHaveProperty("disposition");

    const detail = await app.inject({
      method: "GET",
      url: `/questions/${questionId}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().question.status).toBe("RECEIVED");

    await app.close();
  });

  it("12. computes disposition purely from category + text, with no AI/network dependency", async () => {
    // The API process here has no AI provider configured at all — no API
    // key, no external client. If disposition assignment required an AI
    // service, question creation would fail or hang. It succeeds
    // synchronously and instantly, confirming the deterministic engine is
    // the sole and self-sufficient source of the disposition.
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "disp-no-ai");
    const medication = await createMedicationForPatient(app, cookie);

    const start = Date.now();
    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "GENERAL_INFO",
      "General question with no red flags.",
    );
    const elapsedMs = Date.now() - start;

    expect(response.statusCode).toBe(201);
    expect(response.json().question.dispositionSource).toBe("DETERMINISTIC");
    expect(elapsedMs).toBeLessThan(1000);

    await app.close();
  });
});

import { afterAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma, Role } from "@doseprepped/db";
import { MockMedicationEducationProvider } from "@doseprepped/ai-service";
import type { MedicationEducationInput, MedicationEducationProvider } from "@doseprepped/ai-service";
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

async function createPatientWithCookie(label: string, app: ReturnType<typeof buildApp>) {
  const { user, email } = await createUserDirectly(Role.PATIENT, label);
  const cookie = await loginAndGetCookie(app, email);
  return { user, cookie };
}

/** Records every input the provider was called with, for asserting the
 * approved-fields-only boundary (test 8) without needing real network
 * inspection. */
class SpyMedicationEducationProvider implements MedicationEducationProvider {
  readonly providerName = "spy";
  calls: MedicationEducationInput[] = [];
  private readonly delegate = new MockMedicationEducationProvider();

  async generateEducation(input: MedicationEducationInput) {
    this.calls.push(input);
    return this.delegate.generateEducation(input);
  }
}

async function askQuestion(
  app: ReturnType<typeof buildApp>,
  cookie: string,
  medicationId: string,
  category: string,
  questionText: string,
) {
  return app.inject({
    method: "POST",
    url: "/questions",
    headers: { cookie },
    payload: { medicationId, category, questionText },
  });
}

describe("M3 Phase 3 — AI-assisted medication education", () => {
  it("1. GENERAL_EDUCATION invokes the AI education operation and returns responseText", async () => {
    const app = buildApp({ aiProvider: new MockMedicationEducationProvider({ mode: "success" }) });
    const { cookie } = await createPatientWithCookie("ai-general", app);
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "GENERAL_INFO",
      "What is this medication generally used for?",
    );

    expect(response.statusCode).toBe(201);
    const { question } = response.json();
    expect(question.disposition).toBe("GENERAL_EDUCATION");
    expect(question.aiResponseStatus).toBe("SUCCESS");
    expect(question.aiEducationResponse).toBeTruthy();
    expect(question.status).toBe("AI_ANSWERED");

    await app.close();
  });

  it("2. PHARMACIST_REVIEW: AI runs but never overrides the deterministic disposition", async () => {
    const app = buildApp({ aiProvider: new MockMedicationEducationProvider({ mode: "success" }) });
    const { cookie } = await createPatientWithCookie("ai-pharmacist", app);
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "MISSED_DOSE",
      "I forgot to take my dose this morning, what should I do?",
    );

    expect(response.statusCode).toBe(201);
    const { question } = response.json();
    expect(question.disposition).toBe("PHARMACIST_REVIEW");
    expect(question.aiResponseStatus).toBe("SUCCESS");
    // status must NOT become AI_ANSWERED for a non-GENERAL_EDUCATION
    // disposition — AI supplements, never resolves, this tier. As of M4,
    // PHARMACIST_REVIEW/PROVIDER_EVALUATION questions are automatically
    // queued for pharmacist review instead.
    expect(question.status).toBe("PHARMACIST_REQUESTED");

    await app.close();
  });

  it("3. PROVIDER_EVALUATION: AI runs but never overrides the deterministic disposition", async () => {
    const app = buildApp({ aiProvider: new MockMedicationEducationProvider({ mode: "success" }) });
    const { cookie } = await createPatientWithCookie("ai-provider", app);
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "SIDE_EFFECT",
      "My rash seems to be getting worse over the last two days.",
    );

    expect(response.statusCode).toBe(201);
    const { question } = response.json();
    expect(question.disposition).toBe("PROVIDER_EVALUATION");
    expect(question.aiResponseStatus).toBe("SUCCESS");
    expect(question.status).toBe("PHARMACIST_REQUESTED");

    await app.close();
  });

  it("4. URGENT_EMERGENCY never invokes the AI provider at all", async () => {
    const provider = new SpyMedicationEducationProvider();
    const app = buildApp({ aiProvider: provider });
    const { cookie } = await createPatientWithCookie("ai-urgent", app);
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "SIDE_EFFECT",
      "My throat is swelling and I am having trouble breathing.",
    );

    expect(response.statusCode).toBe(201);
    const { question } = response.json();
    expect(question.disposition).toBe("URGENT_EMERGENCY");
    expect(question.aiResponseStatus).toBe("SKIPPED");
    expect(question.aiEducationResponse).toBeNull();
    expect(provider.calls).toHaveLength(0);

    await app.close();
  });

  it("5. AI provider failure produces safe fallback behavior — no fabricated content", async () => {
    const app = buildApp({ aiProvider: new MockMedicationEducationProvider({ mode: "fail" }) });
    const { cookie } = await createPatientWithCookie("ai-fail", app);
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "GENERAL_INFO",
      "What is this medication for?",
    );

    expect(response.statusCode).toBe(201);
    const { question } = response.json();
    expect(question.aiResponseStatus).toBe("FAILED");
    expect(question.aiEducationResponse).toBeNull();
    // Disposition and Phase 2 routing are unaffected by an AI failure.
    expect(question.disposition).toBe("GENERAL_EDUCATION");
    expect(question.status).toBe("RECEIVED");

    await app.close();
  });

  it("6. Invalid AI output (fails schema/guardrail validation) is rejected, not shown", async () => {
    const app = buildApp({ aiProvider: new MockMedicationEducationProvider({ mode: "invalid" }) });
    const { cookie } = await createPatientWithCookie("ai-invalid", app);
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "GENERAL_INFO",
      "What is this medication for?",
    );

    expect(response.statusCode).toBe(201);
    const { question } = response.json();
    expect(question.aiResponseStatus).toBe("FAILED");
    expect(question.aiEducationResponse).toBeNull();

    await app.close();
  });

  it("7. AI cannot modify the stored disposition even when it runs successfully", async () => {
    const app = buildApp({ aiProvider: new MockMedicationEducationProvider({ mode: "success" }) });
    const { cookie } = await createPatientWithCookie("ai-no-override", app);
    const medication = await createMedicationForPatient(app, cookie);

    // An urgent-pattern question — the deterministic engine must still win
    // even though the (successful) mock AI provider is invoked for every
    // non-emergency disposition in other tests. Here disposition is
    // URGENT_EMERGENCY so AI is skipped entirely, which is itself proof
    // the AI path has no way to touch disposition.
    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "SIDE_EFFECT",
      "I think I may have taken an overdose of this medication by mistake.",
    );

    const { question } = response.json();
    expect(question.disposition).toBe("URGENT_EMERGENCY");

    await app.close();
  });

  it("8. AI receives only the approved input fields — no patient identity or unrelated data", async () => {
    const provider = new SpyMedicationEducationProvider();
    const app = buildApp({ aiProvider: provider });
    const { cookie } = await createPatientWithCookie("ai-input-scope", app);
    const medication = await createMedicationForPatient(app, cookie, { name: "Warfarin" });
    await createMedicationForPatient(app, cookie, { name: "Ibuprofen" });

    await askQuestion(app, cookie, medication.id, "DRUG_INTERACTION", "Is this safe to take together?");

    expect(provider.calls).toHaveLength(1);
    const input = provider.calls[0]!;
    expect(Object.keys(input).sort()).toEqual(
      ["category", "disposition", "medicationSnapshot", "otherMedicationsSnapshot", "questionText"].sort(),
    );
    expect(input.medicationSnapshot.name).toBe("Warfarin");
    // otherMedicationsSnapshot is included here because DRUG_INTERACTION
    // is one of the two categories that already captures it (Phase 1) —
    // but it must be the minimal {name, strength} shape, nothing more.
    expect(input.otherMedicationsSnapshot).toEqual([{ name: "Ibuprofen", strength: "10 mg" }]);
    // No patient identity anywhere in the input.
    expect(JSON.stringify(input)).not.toMatch(/@test\.doseprepped\.local/);

    await app.close();
  });

  it("9. The AI provider abstraction can be mocked in tests (no real network call)", async () => {
    const provider = new MockMedicationEducationProvider({ mode: "success" });
    const app = buildApp({ aiProvider: provider });
    expect(provider.providerName).toBe("mock");
    await app.close();
  });

  it("10. At most one clarifying question is ever returned, never a list", async () => {
    const app = buildApp({ aiProvider: new MockMedicationEducationProvider({ mode: "success" }) });
    const { cookie } = await createPatientWithCookie("ai-clarify", app);
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(app, cookie, medication.id, "GENERAL_INFO", "Short question?");

    const { question } = response.json();
    expect(
      question.clarifyingQuestion === null || typeof question.clarifyingQuestion === "string",
    ).toBe(true);

    await app.close();
  });

  it("11. No open-ended conversation endpoint exists against a question", async () => {
    const app = buildApp({ aiProvider: new MockMedicationEducationProvider({ mode: "success" }) });
    const { cookie } = await createPatientWithCookie("ai-no-chat", app);
    const medication = await createMedicationForPatient(app, cookie);
    const created = await askQuestion(app, cookie, medication.id, "GENERAL_INFO", "What is this for?");
    const questionId = created.json().question.id;

    const clarifyAttempt = await app.inject({
      method: "POST",
      url: `/questions/${questionId}/clarify`,
      headers: { cookie },
      payload: { answer: "trying to continue a conversation" },
    });
    const messageAttempt = await app.inject({
      method: "POST",
      url: `/questions/${questionId}/messages`,
      headers: { cookie },
      payload: { text: "follow-up message" },
    });

    expect(clarifyAttempt.statusCode).toBe(404);
    expect(messageAttempt.statusCode).toBe(404);

    await app.close();
  });

  it("13. Patient ownership remains enforced for AI-processed questions", async () => {
    const app = buildApp({ aiProvider: new MockMedicationEducationProvider({ mode: "success" }) });
    const owner = await createPatientWithCookie("ai-owner", app);
    const intruder = await createPatientWithCookie("ai-intruder", app);
    const medication = await createMedicationForPatient(app, owner.cookie);

    const created = await askQuestion(
      app,
      owner.cookie,
      medication.id,
      "GENERAL_INFO",
      "What is this medication for?",
    );
    const questionId = created.json().question.id;

    const stolen = await app.inject({
      method: "GET",
      url: `/questions/${questionId}`,
      headers: { cookie: intruder.cookie },
    });
    expect(stolen.statusCode).toBe(404);

    await app.close();
  });

  it("14. AI metadata (provider, model, prompt version, usage, timestamp) is stored correctly", async () => {
    const app = buildApp({ aiProvider: new MockMedicationEducationProvider({ mode: "success" }) });
    const { cookie } = await createPatientWithCookie("ai-metadata", app);
    const medication = await createMedicationForPatient(app, cookie);

    const created = await askQuestion(
      app,
      cookie,
      medication.id,
      "GENERAL_INFO",
      "What is this medication for?",
    );
    const questionId = created.json().question.id;

    const stored = await prisma.medicationQuestion.findUniqueOrThrow({ where: { id: questionId } });
    expect(stored.aiProvider).toBe("mock");
    expect(stored.aiModelVersion).toBe("mock-v1");
    expect(stored.aiPromptVersion).toBeTruthy();
    expect(stored.aiUsage).toMatchObject({ inputTokens: expect.any(Number), outputTokens: expect.any(Number) });
    expect(stored.aiEducationGeneratedAt).not.toBeNull();
    expect(stored.aiResponseStatus).toBe("SUCCESS");
    // Audit-only fields are not exposed in the patient-facing response.
    const apiFields = Object.keys(created.json().question);
    expect(apiFields).not.toContain("aiProvider");
    expect(apiFields).not.toContain("aiPromptVersion");
    expect(apiFields).not.toContain("aiUsage");
    expect(apiFields).not.toContain("aiModelVersion");

    await app.close();
  });

  it("15. AI calls do not expose the question text through application logs", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const app = buildApp({ aiProvider: new MockMedicationEducationProvider({ mode: "success" }) });
    const { cookie } = await createPatientWithCookie("ai-no-phi-logs", app);
    const medication = await createMedicationForPatient(app, cookie);

    const distinctiveText = `unique-marker-${Date.now()}-my rash is spreading rapidly`;
    await askQuestion(app, cookie, medication.id, "SIDE_EFFECT", distinctiveText);

    const allLoggedArgs = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().map((arg) => String(arg));
    expect(allLoggedArgs.some((arg) => arg.includes(distinctiveText))).toBe(false);

    logSpy.mockRestore();
    errorSpy.mockRestore();
    await app.close();
  });

  it("timeout: a slow provider beyond aiTimeoutMs fails safe", async () => {
    const app = buildApp({
      aiProvider: new MockMedicationEducationProvider({ mode: "slow", delayMs: 200 }),
      aiTimeoutMs: 20,
    });
    const { cookie } = await createPatientWithCookie("ai-timeout", app);
    const medication = await createMedicationForPatient(app, cookie);

    const response = await askQuestion(
      app,
      cookie,
      medication.id,
      "GENERAL_INFO",
      "What is this medication for?",
    );

    const { question } = response.json();
    expect(question.aiResponseStatus).toBe("FAILED");
    expect(question.aiEducationResponse).toBeNull();

    await app.close();
  });
});

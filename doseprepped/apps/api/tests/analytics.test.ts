import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma, Role, AnalyticsEventType } from "@doseprepped/db";
import { MockMedicationEducationProvider } from "@doseprepped/ai-service";
import { buildAnalyticsReport } from "../src/lib/analytics-report.js";
import {
  TEST_EMAIL_DOMAIN,
  createMedicationForPatient,
  createUserDirectly,
  loginAndGetCookie,
} from "./helpers.js";

afterAll(async () => {
  await prisma.analyticsEvent.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } });
  await prisma.$disconnect();
});

function app() {
  return buildApp({ aiProvider: new MockMedicationEducationProvider({ mode: "success" }) });
}

async function patientWithCookie(a: ReturnType<typeof buildApp>, label: string) {
  const { user, email } = await createUserDirectly(Role.PATIENT, label);
  const cookie = await loginAndGetCookie(a, email);
  return { user, cookie };
}

async function pharmacistWithCookie(a: ReturnType<typeof buildApp>, label: string) {
  const { user, email } = await createUserDirectly(Role.PHARMACIST, label);
  const cookie = await loginAndGetCookie(a, email);
  return { user, cookie };
}

async function adminWithCookie(a: ReturnType<typeof buildApp>, label: string) {
  const { user, email } = await createUserDirectly(Role.ADMIN, label);
  const cookie = await loginAndGetCookie(a, email);
  return { user, cookie };
}

async function askQuestion(
  a: ReturnType<typeof buildApp>,
  cookie: string,
  medicationId: string,
  category: string,
  questionText: string,
) {
  const response = await a.inject({
    method: "POST",
    url: "/questions",
    headers: { cookie },
    payload: { medicationId, category, questionText },
  });
  return response.json().question;
}

describe("AnalyticsEventType taxonomy", () => {
  it("is exactly the documented, implemented set — no fake/speculative events", () => {
    expect(new Set(Object.values(AnalyticsEventType))).toEqual(
      new Set([
        "PATIENT_MEDICATION_VIEWED",
        "MEDICATION_ADHERENCE_RECORDED",
        "MEDICATION_CHECKIN_COMPLETED",
        "QUESTION_SUBMITTED",
        "QUESTION_DISPOSITION_ASSIGNED",
        "AI_EDUCATION_GENERATED",
        "AI_EDUCATION_FAILED",
        "PHARMACIST_QUEUE_ENTERED",
        "PHARMACIST_CLAIMED",
        "PHARMACIST_RESPONDED",
        "PHARMACIST_ESCALATED",
        "PROVIDER_ESCALATION_CREATED",
      ]),
    );
  });
});

describe("Analytics event creation", () => {
  it("emits PATIENT_MEDICATION_VIEWED on GET /medications/:id", async () => {
    const a = app();
    const { user, cookie } = await patientWithCookie(a, "event-view");
    const medication = await createMedicationForPatient(a, cookie);

    await a.inject({ method: "GET", url: `/medications/${medication.id}`, headers: { cookie } });

    const events = await prisma.analyticsEvent.findMany({
      where: { eventType: AnalyticsEventType.PATIENT_MEDICATION_VIEWED, patientId: user.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.medicationId).toBe(medication.id);

    await a.close();
  });

  it("emits MEDICATION_ADHERENCE_RECORDED on POST /medications/:id/adherence-events", async () => {
    const a = app();
    const { user, cookie } = await patientWithCookie(a, "event-adherence");
    const medication = await createMedicationForPatient(a, cookie);

    await a.inject({
      method: "POST",
      url: `/medications/${medication.id}/adherence-events`,
      headers: { cookie },
      payload: { status: "TAKEN" },
    });

    const events = await prisma.analyticsEvent.findMany({
      where: { eventType: AnalyticsEventType.MEDICATION_ADHERENCE_RECORDED, patientId: user.id },
    });
    expect(events).toHaveLength(1);
    expect((events[0]!.metadata as { status: string }).status).toBe("TAKEN");

    await a.close();
  });

  it("emits MEDICATION_CHECKIN_COMPLETED without notes on POST /medications/:id/check-ins", async () => {
    const a = app();
    const { user, cookie } = await patientWithCookie(a, "event-checkin");
    const medication = await createMedicationForPatient(a, cookie);

    await a.inject({
      method: "POST",
      url: `/medications/${medication.id}/check-ins`,
      headers: { cookie },
      payload: { response: "HAVING_SOME_ISSUES", notes: "distinctive-checkin-note-xyz" },
    });

    const events = await prisma.analyticsEvent.findMany({
      where: { eventType: AnalyticsEventType.MEDICATION_CHECKIN_COMPLETED, patientId: user.id },
    });
    expect(events).toHaveLength(1);
    const metadata = events[0]!.metadata as Record<string, unknown>;
    expect(metadata.response).toBe("HAVING_SOME_ISSUES");
    expect(metadata).not.toHaveProperty("notes");
    expect(JSON.stringify(metadata)).not.toContain("distinctive-checkin-note-xyz");

    await a.close();
  });

  it("emits QUESTION_SUBMITTED, QUESTION_DISPOSITION_ASSIGNED, and AI_EDUCATION_GENERATED for a GENERAL_EDUCATION question", async () => {
    const a = app();
    const { user, cookie } = await patientWithCookie(a, "event-question-general");
    const medication = await createMedicationForPatient(a, cookie);

    const question = await askQuestion(
      a,
      cookie,
      medication.id,
      "GENERAL_INFO",
      "What is this medication generally prescribed for?",
    );
    expect(question.disposition).toBe("GENERAL_EDUCATION");

    const events = await prisma.analyticsEvent.findMany({ where: { questionId: question.id } });
    const types = events.map((e) => e.eventType).sort();
    expect(types).toEqual(
      ["AI_EDUCATION_GENERATED", "QUESTION_DISPOSITION_ASSIGNED", "QUESTION_SUBMITTED"].sort(),
    );
    for (const e of events) expect(e.patientId).toBe(user.id);

    await a.close();
  });

  it("emits PHARMACIST_QUEUE_ENTERED and PROVIDER_ESCALATION_CREATED (automatic_routing) for a PROVIDER_EVALUATION question", async () => {
    const a = app();
    const { cookie } = await patientWithCookie(a, "event-question-provider");
    const medication = await createMedicationForPatient(a, cookie);

    const question = await askQuestion(
      a,
      cookie,
      medication.id,
      "SIDE_EFFECT",
      "My rash from this medication seems to be getting worse over the last two days.",
    );
    expect(question.disposition).toBe("PROVIDER_EVALUATION");

    const events = await prisma.analyticsEvent.findMany({ where: { questionId: question.id } });
    const types = events.map((e) => e.eventType);
    expect(types).toContain("PHARMACIST_QUEUE_ENTERED");
    const escalationEvent = events.find((e) => e.eventType === "PROVIDER_ESCALATION_CREATED");
    expect(escalationEvent).toBeDefined();
    expect((escalationEvent!.metadata as { source: string }).source).toBe("automatic_routing");

    await a.close();
  });

  it("emits PHARMACIST_CLAIMED, PHARMACIST_RESPONDED without responseText, and never for URGENT_EMERGENCY (never queued)", async () => {
    const a = app();
    const { cookie: patientCookie } = await patientWithCookie(a, "event-question-urgent");
    const medication = await createMedicationForPatient(a, patientCookie);

    const urgent = await askQuestion(
      a,
      patientCookie,
      medication.id,
      "SIDE_EFFECT",
      "I think I may have taken an overdose of this medication by mistake.",
    );
    expect(urgent.disposition).toBe("URGENT_EMERGENCY");
    const urgentEvents = await prisma.analyticsEvent.findMany({ where: { questionId: urgent.id } });
    // URGENT_EMERGENCY is never queued/AI-invoked — only QUESTION_SUBMITTED
    // and QUESTION_DISPOSITION_ASSIGNED should exist for it.
    expect(urgentEvents.map((e) => e.eventType).sort()).toEqual(
      ["QUESTION_DISPOSITION_ASSIGNED", "QUESTION_SUBMITTED"].sort(),
    );

    const reviewQuestion = await askQuestion(
      a,
      patientCookie,
      medication.id,
      "MISSED_DOSE",
      "I forgot to take my dose this morning. What should I do now?",
    );
    expect(reviewQuestion.disposition).toBe("PHARMACIST_REVIEW");

    const pharmacist = await pharmacistWithCookie(a, "event-question-urgent");
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${reviewQuestion.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${reviewQuestion.id}/respond`,
      headers: { cookie: pharmacist.cookie },
      payload: { responseText: "distinctive-pharmacist-response-abc" },
    });

    const events = await prisma.analyticsEvent.findMany({ where: { questionId: reviewQuestion.id } });
    const claimEvent = events.find((e) => e.eventType === "PHARMACIST_CLAIMED");
    const respondEvent = events.find((e) => e.eventType === "PHARMACIST_RESPONDED");
    expect(claimEvent).toBeDefined();
    expect(claimEvent!.pharmacistId).toBe(pharmacist.user.id);
    expect(respondEvent).toBeDefined();
    expect(JSON.stringify(respondEvent!.metadata)).not.toContain("distinctive-pharmacist-response-abc");
    expect(typeof (respondEvent!.metadata as { handlingTimeMs: number }).handlingTimeMs).toBe("number");

    await a.close();
  });

  it("emits PHARMACIST_ESCALATED (with reason category, never free-text reason) and a second PROVIDER_ESCALATION_CREATED (pharmacist_initiated)", async () => {
    const a = app();
    const { cookie: patientCookie } = await patientWithCookie(a, "event-escalate");
    const medication = await createMedicationForPatient(a, patientCookie);
    const question = await askQuestion(
      a,
      patientCookie,
      medication.id,
      "MISSED_DOSE",
      "I forgot to take my dose this morning. What should I do now?",
    );

    const pharmacist = await pharmacistWithCookie(a, "event-escalate");
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${question.id}/escalate`,
      headers: { cookie: pharmacist.cookie },
      payload: {
        escalationReasonCategory: "PATIENT_REQUESTED_PROVIDER",
        escalationReason: "distinctive-escalation-explanation-def",
      },
    });

    const events = await prisma.analyticsEvent.findMany({ where: { questionId: question.id } });
    const escalated = events.find((e) => e.eventType === "PHARMACIST_ESCALATED");
    expect(escalated).toBeDefined();
    expect((escalated!.metadata as { escalationReasonCategory: string }).escalationReasonCategory).toBe(
      "PATIENT_REQUESTED_PROVIDER",
    );
    expect(JSON.stringify(escalated!.metadata)).not.toContain("distinctive-escalation-explanation-def");

    const providerCreated = events.filter((e) => e.eventType === "PROVIDER_ESCALATION_CREATED");
    expect(providerCreated).toHaveLength(1);
    expect((providerCreated[0]!.metadata as { source: string }).source).toBe("pharmacist_initiated");

    await a.close();
  });

  it("never stores question text, AI response text, or any free text anywhere in analytics metadata", async () => {
    const a = app();
    const { cookie } = await patientWithCookie(a, "event-no-freetext");
    const medication = await createMedicationForPatient(a, cookie);
    const distinctiveText = "totally-unique-question-phrase-qqzzyy-9182";

    await askQuestion(a, cookie, medication.id, "GENERAL_INFO", distinctiveText);

    const allEvents = await prisma.analyticsEvent.findMany({});
    const serialized = JSON.stringify(allEvents.map((e) => e.metadata));
    expect(serialized).not.toContain(distinctiveText);
    expect(serialized).not.toContain("responseText");

    await a.close();
  });
});

describe("GET /admin/analytics/report — authorization", () => {
  it("rejects an unauthenticated request", async () => {
    const a = app();
    const response = await a.inject({ method: "GET", url: "/admin/analytics/report" });
    expect(response.statusCode).toBe(401);
    await a.close();
  });

  it("rejects a patient", async () => {
    const a = app();
    const { cookie } = await patientWithCookie(a, "report-auth-patient");
    const response = await a.inject({ method: "GET", url: "/admin/analytics/report", headers: { cookie } });
    expect(response.statusCode).toBe(403);
    await a.close();
  });

  it("rejects a pharmacist", async () => {
    const a = app();
    const { cookie } = await pharmacistWithCookie(a, "report-auth-pharmacist");
    const response = await a.inject({ method: "GET", url: "/admin/analytics/report", headers: { cookie } });
    expect(response.statusCode).toBe(403);
    await a.close();
  });

  it("allows an admin", async () => {
    const a = app();
    const { cookie } = await adminWithCookie(a, "report-auth-admin");
    const response = await a.inject({ method: "GET", url: "/admin/analytics/report", headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty("questionFunnel");
    await a.close();
  });

  it("rejects from > to", async () => {
    const a = app();
    const { cookie } = await adminWithCookie(a, "report-auth-badrange");
    const response = await a.inject({
      method: "GET",
      url: "/admin/analytics/report?from=2026-06-01&to=2026-01-01",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(400);
    await a.close();
  });
});

describe("buildAnalyticsReport — aggregate calculations", () => {
  it("computes patient engagement, question funnel, pharmacist, provider-escalation, and adherence/check-in metrics for a known scenario, scoped to an exact date range", async () => {
    const a = app();

    const before = await buildAnalyticsReport({ from: new Date(0), to: new Date() });
    const totalPatientsBefore = before.patientEngagement.totalPatients;
    const totalMedicationRecordsBefore = before.patientEngagement.totalMedicationRecords;

    const rangeStart = new Date();

    const patientA = await patientWithCookie(a, "report-scenario-a");
    const patientB = await patientWithCookie(a, "report-scenario-b");
    const medA = await createMedicationForPatient(a, patientA.cookie);
    const medB = await createMedicationForPatient(a, patientB.cookie);

    // Q1: GENERAL_EDUCATION, AI succeeds, never queued.
    const q1 = await askQuestion(
      a,
      patientA.cookie,
      medA.id,
      "GENERAL_INFO",
      "What is this medication generally prescribed for?",
    );
    // Q2: PHARMACIST_REVIEW, queued, claimed + responded.
    const q2 = await askQuestion(
      a,
      patientA.cookie,
      medA.id,
      "MISSED_DOSE",
      "I forgot to take my dose this morning. What should I do now?",
    );
    // Q3: PROVIDER_EVALUATION (automatic), then ALSO pharmacist-escalated —
    // must still count once in totalEscalatedToProvider (OR-dedup).
    const q3 = await askQuestion(
      a,
      patientB.cookie,
      medB.id,
      "SIDE_EFFECT",
      "My rash from this medication seems to be getting worse over the last two days.",
    );
    // Q4: URGENT_EMERGENCY — tracked separately, never queued.
    const q4 = await askQuestion(
      a,
      patientB.cookie,
      medB.id,
      "SIDE_EFFECT",
      "I think I may have taken an overdose of this medication by mistake.",
    );
    expect([q1.disposition, q2.disposition, q3.disposition, q4.disposition]).toEqual([
      "GENERAL_EDUCATION",
      "PHARMACIST_REVIEW",
      "PROVIDER_EVALUATION",
      "URGENT_EMERGENCY",
    ]);

    const pharmacist = await pharmacistWithCookie(a, "report-scenario");
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${q2.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${q2.id}/respond`,
      headers: { cookie: pharmacist.cookie },
      payload: { responseText: "Take it as soon as you remember." },
    });
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${q3.id}/claim`,
      headers: { cookie: pharmacist.cookie },
    });
    await a.inject({
      method: "POST",
      url: `/pharmacist/questions/${q3.id}/escalate`,
      headers: { cookie: pharmacist.cookie },
      payload: { escalationReasonCategory: "WORSENING_OR_SEVERE_SYMPTOM", escalationReason: "Worsening rash." },
    });

    // Adherence: 2 taken + 1 missed on medA -> 67%.
    for (const status of ["TAKEN", "TAKEN", "MISSED"]) {
      await a.inject({
        method: "POST",
        url: `/medications/${medA.id}/adherence-events`,
        headers: { cookie: patientA.cookie },
        payload: { status },
      });
    }
    // Check-ins: one per patient.
    await a.inject({
      method: "POST",
      url: `/medications/${medA.id}/check-ins`,
      headers: { cookie: patientA.cookie },
      payload: { response: "DOING_WELL" },
    });
    await a.inject({
      method: "POST",
      url: `/medications/${medB.id}/check-ins`,
      headers: { cookie: patientB.cookie },
      payload: { response: "HAVING_SOME_ISSUES" },
    });

    const rangeEnd = new Date();
    const report = await buildAnalyticsReport({ from: rangeStart, to: rangeEnd });

    // Patient engagement
    expect(report.patientEngagement.patientsActivated).toBe(2);
    expect(report.patientEngagement.activePatients).toBe(2);
    expect(report.patientEngagement.medicationRecordsAdded).toBe(2);
    expect(report.patientEngagement.questionsSubmitted).toBe(4);
    expect(report.patientEngagement.repeatPatients).toBe(2); // both patients asked 2 questions each
    expect(report.patientEngagement.adherenceEventsRecorded).toBe(3);
    expect(report.patientEngagement.checkInsCompleted).toBe(2);
    expect(report.patientEngagement.totalPatients).toBe(totalPatientsBefore + 2);
    expect(report.patientEngagement.totalMedicationRecords).toBe(totalMedicationRecordsBefore + 2);

    // Question funnel
    expect(report.questionFunnel.totalQuestions).toBe(4);
    expect(report.questionFunnel.byDisposition.GENERAL_EDUCATION).toBe(1);
    expect(report.questionFunnel.byDisposition.PHARMACIST_REVIEW).toBe(1);
    expect(report.questionFunnel.byDisposition.PROVIDER_EVALUATION).toBe(1);
    expect(report.questionFunnel.byDisposition.URGENT_EMERGENCY).toBe(1);
    expect(report.questionFunnel.byCategory.GENERAL_INFO).toBe(1);
    expect(report.questionFunnel.byCategory.MISSED_DOSE).toBe(1);
    expect(report.questionFunnel.byCategory.SIDE_EFFECT).toBe(2);

    // AI
    expect(report.ai.resolvedByAiWithoutPharmacist).toBe(1); // q1
    expect(report.ai.routedToPharmacistInstead).toBe(2); // q2 + q3
    expect(report.ai.skipped).toBe(1); // q4, URGENT_EMERGENCY

    // Pharmacist
    expect(report.pharmacist.enteredQueue).toBe(2); // q2 + q3
    expect(report.pharmacist.claimed).toBe(2);
    expect(report.pharmacist.responded).toBe(1);
    expect(report.pharmacist.escalated).toBe(1);

    // Provider escalation — the critical metric, OR-deduplicated.
    expect(report.providerEscalation.reachedPharmacist).toBe(2);
    expect(report.providerEscalation.automaticRoutingCount).toBe(1); // q3 at creation
    expect(report.providerEscalation.pharmacistInitiatedCount).toBe(1); // q3 escalated too
    expect(report.providerEscalation.totalEscalatedToProvider).toBe(1); // deduped, still just q3
    expect(report.providerEscalation.escalationRate).toBe(25); // 1/4
    expect(report.providerEscalation.resolvedWithoutProviderEscalation).toBe(3);
    expect(report.providerEscalation.resolvedWithoutProviderEscalationRate).toBe(75);
    expect(report.providerEscalation.urgentEmergencyCount).toBe(1);
    expect(report.providerEscalation.escalationReasonBreakdown.WORSENING_OR_SEVERE_SYMPTOM).toBe(1);

    // Adherence / check-in
    expect(report.adherenceCheckIn.takenCount).toBe(2);
    expect(report.adherenceCheckIn.missedCount).toBe(1);
    expect(report.adherenceCheckIn.adherenceRatePercent).toBe(67);
    expect(report.adherenceCheckIn.checkInResponseBreakdown.DOING_WELL).toBe(1);
    expect(report.adherenceCheckIn.checkInResponseBreakdown.HAVING_SOME_ISSUES).toBe(1);

    // ROI operational metrics — no dollar figures, just the labeled ratios.
    expect(report.roiOperationalMetrics.percentResolvedWithoutProviderEscalation).toBe(75);
    // The note deliberately *mentions* "time saved" only to disclaim it
    // ("No dollar figure or 'time saved' claim is made here") — assert
    // the disclaimer is present, not that the phrase never appears.
    expect(report.roiOperationalMetrics.note).toMatch(/not a financial estimate/);
    expect(report.roiOperationalMetrics.note).toMatch(/no dollar figure/i);
    expect(report.roiOperationalMetrics.note).not.toMatch(/\$\d/);

    await a.close();
  });

  it("excludes activity outside the requested date range", async () => {
    const a = app();
    const { cookie } = await patientWithCookie(a, "report-range-exclude");
    const medication = await createMedicationForPatient(a, cookie);
    await askQuestion(a, cookie, medication.id, "GENERAL_INFO", "What is this medication generally prescribed for?");

    // A range entirely before this test's activity should show 0 questions.
    const farPast = await buildAnalyticsReport({
      from: new Date("2000-01-01"),
      to: new Date("2000-01-02"),
    });
    expect(farPast.questionFunnel.totalQuestions).toBe(0);
    expect(farPast.patientEngagement.patientsActivated).toBe(0);

    await a.close();
  });
});

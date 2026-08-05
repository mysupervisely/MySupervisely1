import {
  prisma,
  Role,
  QuestionCategory,
  QuestionDisposition,
  QuestionStatus,
  EscalationReasonCategory,
  CheckInResponse,
  AnalyticsEventType,
  OrganizationRole,
  type Prisma,
} from "@doseprepped/db";
import { computeAdherenceSummary } from "./adherence.js";

export interface AnalyticsReportOptions {
  from: Date;
  to: Date;
  // M5.4 — when present, every metric in the returned report is scoped to
  // this organization's patients only (see `resolveOrgPatientIds` and
  // `patientRelationFilter` below). This field was reserved-but-unused in
  // M5.3; M5.4 makes it load-bearing without changing the function's
  // signature or its behavior when omitted. Omitting it reproduces the
  // exact M5.3 global-report behavior byte-for-byte. See
  // docs/doseprepped/ARCHITECTURE.md "M5.4 — Analytics — tenant
  // strategy".
  organizationId?: string;
}

/**
 * M5.4 — the user ids of every ORG_PATIENT member of `organizationId`.
 * AnalyticsEvent has no foreign keys (see
 * docs/doseprepped/ARCHITECTURE.md "M5.3 — What analytics must never
 * store" for why), so it cannot be filtered with a nested relation filter
 * like every other table below — its patientId is pre-resolved to a
 * plain id array and filtered with `{ in: [...] }` instead. This is the
 * one exception to the nested-relation-filter approach used everywhere
 * else in this file.
 */
async function resolveOrgPatientIds(organizationId: string): Promise<string[]> {
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId, role: OrganizationRole.ORG_PATIENT },
    select: { userId: true },
  });
  return memberships.map((m) => m.userId);
}

/** Filter for queries against User itself (role = PATIENT rows). */
function userOrgFilter(organizationId: string | undefined): Prisma.UserWhereInput {
  if (!organizationId) return {};
  return { memberships: { some: { organizationId, role: OrganizationRole.ORG_PATIENT } } };
}

/**
 * Filter for queries against any table with a `patient` relation to User
 * (PatientMedication, MedicationQuestion, MedicationAdherenceEvent,
 * MedicationCheckIn). Derived live through OrganizationMembership, same
 * as the pharmacist queue's tenant boundary — never a stamped
 * organizationId column. See docs/doseprepped/ARCHITECTURE.md "M5.4 —
 * Tenant boundaries".
 */
function patientRelationFilter(organizationId: string | undefined): { patient?: Prisma.UserWhereInput } {
  if (!organizationId) return {};
  return { patient: userOrgFilter(organizationId) };
}

function zeroRecord<T extends string>(values: readonly T[]): Record<T, number> {
  const record = {} as Record<T, number>;
  for (const value of values) record[value] = 0;
  return record;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function ratePercent(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 10000) / 100; // 2 decimal places
}

function perThousand(count: number, patients: number): number | null {
  if (patients === 0) return null;
  return Math.round((count / patients) * 1000 * 100) / 100;
}

export interface AnalyticsReport {
  range: { from: string; to: string };

  patientEngagement: {
    /** New patient signups within [from, to]. */
    patientsActivated: number;
    /** Distinct patients with >=1 tracked action within [from, to]
     * (question submitted, adherence recorded, check-in completed, or
     * medication viewed). */
    activePatients: number;
    /** All patients ever, as of `to`. */
    totalPatients: number;
    /** PatientMedication rows created within [from, to]. */
    medicationRecordsAdded: number;
    /** All medication records ever, as of `to`. */
    totalMedicationRecords: number;
    medicationViews: number;
    adherenceEventsRecorded: number;
    checkInsCompleted: number;
    questionsSubmitted: number;
    /** Patients with more than one question submitted within [from, to]. */
    repeatPatients: number;
  };

  questionFunnel: {
    totalQuestions: number;
    byCategory: Record<QuestionCategory, number>;
    byDisposition: Record<QuestionDisposition, number>;
  };

  ai: {
    /** Provider actually called (SUCCESS + FAILED — never SKIPPED). */
    invoked: number;
    succeeded: number;
    failed: number;
    /** Never invoked — always URGENT_EMERGENCY questions. */
    skipped: number;
    /** Restated for clarity — identical to `succeeded`. */
    educationGenerated: number;
    clarifyingQuestionsIssued: number;
    /** GENERAL_EDUCATION disposition with a successful AI response —
     * fully answered without ever reaching a pharmacist. */
    resolvedByAiWithoutPharmacist: number;
    /** PHARMACIST_REVIEW or PROVIDER_EVALUATION disposition — routed to
     * a pharmacist regardless of what the AI step did. */
    routedToPharmacistInstead: number;
    tokenUsage: { inputTokens: number; outputTokens: number };
  };

  pharmacist: {
    /** Questions that entered the shared queue within [from, to]
     * (createdAt-bound, since queueing happens at creation). */
    enteredQueue: number;
    /** Claim actions within [from, to] (pharmacistClaimedAt-bound —
     * independent of when the underlying question was created). */
    claimed: number;
    /** Response actions within [from, to] (pharmacistRespondedAt-bound). */
    responded: number;
    /** Escalate actions within [from, to] (escalatedAt-bound). */
    escalated: number;
    /** Live snapshot — see docs/doseprepped/ARCHITECTURE.md "M5.3 —
     * Reporting service": not reconstructable for a historical `to`. */
    unclaimedQueueVolume: number;
    /** pharmacistClaimedAt - pharmacistRequestedAt, averaged across
     * claims within [from, to]. */
    averageWaitToClaimMs: number | null;
    averageResponseTimeMs: number | null;
    averageQueueAgingMs: number | null;
  };

  providerEscalation: {
    /** PHARMACIST_REVIEW or PROVIDER_EVALUATION disposition, among
     * questions created within [from, to]. */
    reachedPharmacist: number;
    /** disposition = PROVIDER_EVALUATION at creation, within [from, to]. */
    automaticRoutingCount: number;
    /** status = ESCALATED (as of `to`), among questions created within
     * [from, to] — pharmacist-initiated, may have happened after
     * creation but is still attributed to the cohort it was created in. */
    pharmacistInitiatedCount: number;
    /** Deduplicated: automaticRoutingCount OR pharmacistInitiatedCount,
     * counted once per question. See docs/doseprepped/ARCHITECTURE.md
     * "M5.3 — Provider escalation — the critical metric, defined
     * precisely". */
    totalEscalatedToProvider: number;
    escalationRate: number | null;
    resolvedWithoutProviderEscalation: number;
    resolvedWithoutProviderEscalationRate: number | null;
    escalationReasonBreakdown: Record<EscalationReasonCategory, number>;
    /** Tracked separately — never folded into "escalated to provider".
     * See docs/doseprepped/ARCHITECTURE.md §3. */
    urgentEmergencyCount: number;
  };

  adherenceCheckIn: {
    adherenceEventsRecorded: number;
    takenCount: number;
    missedCount: number;
    skippedCount: number;
    adherenceRatePercent: number | null;
    checkInsCompleted: number;
    checkInResponseBreakdown: Record<CheckInResponse, number>;
  };

  /** Operational volume/rate metrics only — never a financial estimate.
   * See docs/doseprepped/ARCHITECTURE.md "M5.3 — ROI-supporting
   * operational metrics (not a savings claim)". */
  roiOperationalMetrics: {
    questionsPerThousandPatients: number | null;
    pharmacistCasesPerThousandPatients: number | null;
    providerEscalationsPerThousandPatients: number | null;
    percentResolvedWithoutProviderEscalation: number | null;
    averagePharmacistResponseTimeMs: number | null;
    note: string;
  };
}

const ROI_NOTE =
  "These are operational volume/rate metrics computed from real, already-measured DosePrepped activity — not a financial estimate. " +
  "Combining them with a specific customer's actual labor costs and pre-DosePrepped baseline workflow volume is a future, pilot-specific " +
  "exercise, not something this report calculates. No dollar figure or 'time saved' claim is made here.";

/**
 * Builds the M5.3 aggregate analytics report for a date range. See
 * docs/doseprepped/ARCHITECTURE.md "M5.3 — Reporting service" for the
 * full computation strategy (range-bound activity from source-of-truth
 * tables, snapshot metrics as of `to` or live, activePatients from the
 * event log). Global only today — see "Multi-tenant / organization
 * compatibility (not built)".
 */
export async function buildAnalyticsReport(options: AnalyticsReportOptions): Promise<AnalyticsReport> {
  const { from, to, organizationId } = options;
  const range = { gte: from, lte: to };
  const now = new Date();

  // Pre-resolved once, reused by every AnalyticsEvent query below (see
  // `resolveOrgPatientIds` doc comment for why AnalyticsEvent needs this
  // instead of a nested relation filter). Undefined (not []) when the
  // report is global, so every filter below collapses to the exact M5.3
  // behavior.
  const orgPatientIds = organizationId ? await resolveOrgPatientIds(organizationId) : undefined;
  const analyticsEventPatientWhere: Prisma.AnalyticsEventWhereInput = orgPatientIds
    ? { patientId: { in: orgPatientIds } }
    : {};
  const patientFilter = patientRelationFilter(organizationId);

  const [
    totalPatients,
    patientsActivated,
    totalMedicationRecords,
    medicationRecordsAdded,
    medicationViews,
    questionsCreatedInRange,
    adherenceEventsInRange,
    checkInsInRange,
    claimedInRange,
    respondedInRange,
    escalatedInRange,
    unclaimedQueue,
    activeQuestionPatientIds,
    activeAdherencePatientIds,
    activeCheckInPatientIds,
    activeViewPatientIds,
  ] = await Promise.all([
    prisma.user.count({ where: { role: Role.PATIENT, createdAt: { lte: to }, ...userOrgFilter(organizationId) } }),
    prisma.user.count({ where: { role: Role.PATIENT, createdAt: range, ...userOrgFilter(organizationId) } }),
    prisma.patientMedication.count({ where: { createdAt: { lte: to }, ...patientFilter } }),
    prisma.patientMedication.count({ where: { createdAt: range, ...patientFilter } }),
    prisma.analyticsEvent.count({
      where: { eventType: AnalyticsEventType.PATIENT_MEDICATION_VIEWED, createdAt: range, ...analyticsEventPatientWhere },
    }),
    prisma.medicationQuestion.findMany({
      where: { createdAt: range, ...patientFilter },
      select: {
        id: true,
        patientId: true,
        category: true,
        disposition: true,
        aiResponseStatus: true,
        clarifyingExchange: true,
        aiUsage: true,
        status: true,
        escalationReasonCategory: true,
      },
    }),
    prisma.medicationAdherenceEvent.findMany({
      where: { recordedAt: range, ...patientFilter },
      select: { status: true },
    }),
    prisma.medicationCheckIn.findMany({
      where: { createdAt: range, ...patientFilter },
      select: { response: true },
    }),
    prisma.medicationQuestion.findMany({
      where: { pharmacistClaimedAt: range, ...patientFilter },
      select: { pharmacistRequestedAt: true, pharmacistClaimedAt: true },
    }),
    prisma.medicationQuestion.findMany({
      where: { pharmacistRespondedAt: range, ...patientFilter },
      select: { pharmacistClaimedAt: true, pharmacistRespondedAt: true },
    }),
    prisma.medicationQuestion.findMany({
      where: { escalatedAt: range, ...patientFilter },
      select: { escalationReasonCategory: true },
    }),
    prisma.medicationQuestion.findMany({
      where: { status: QuestionStatus.PHARMACIST_REQUESTED, pharmacistId: null, ...patientFilter },
      select: { pharmacistRequestedAt: true },
    }),
    prisma.medicationQuestion.findMany({
      where: { createdAt: range, ...patientFilter },
      select: { patientId: true },
      distinct: ["patientId"],
    }),
    prisma.medicationAdherenceEvent.findMany({
      where: { recordedAt: range, ...patientFilter },
      select: { patientId: true },
      distinct: ["patientId"],
    }),
    prisma.medicationCheckIn.findMany({
      where: { createdAt: range, ...patientFilter },
      select: { patientId: true },
      distinct: ["patientId"],
    }),
    prisma.analyticsEvent.findMany({
      where: {
        eventType: AnalyticsEventType.PATIENT_MEDICATION_VIEWED,
        createdAt: range,
        patientId: orgPatientIds ? { in: orgPatientIds } : { not: null },
      },
      select: { patientId: true },
      distinct: ["patientId"],
    }),
  ]);

  // --- patientEngagement -----------------------------------------------
  const activePatientIds = new Set<string>();
  for (const row of activeQuestionPatientIds) activePatientIds.add(row.patientId);
  for (const row of activeAdherencePatientIds) activePatientIds.add(row.patientId);
  for (const row of activeCheckInPatientIds) activePatientIds.add(row.patientId);
  for (const row of activeViewPatientIds) if (row.patientId) activePatientIds.add(row.patientId);

  const questionCountByPatient = new Map<string, number>();
  for (const q of questionsCreatedInRange) {
    questionCountByPatient.set(q.patientId, (questionCountByPatient.get(q.patientId) ?? 0) + 1);
  }
  const repeatPatients = [...questionCountByPatient.values()].filter((count) => count > 1).length;

  // --- questionFunnel + ai + providerEscalation (single pass) ----------
  const byCategory = zeroRecord(Object.values(QuestionCategory));
  const byDisposition = zeroRecord(Object.values(QuestionDisposition));
  let aiSucceeded = 0;
  let aiFailed = 0;
  let aiSkipped = 0;
  let clarifyingQuestionsIssued = 0;
  let resolvedByAiWithoutPharmacist = 0;
  let routedToPharmacistInstead = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let automaticRoutingCount = 0;
  let pharmacistInitiatedCount = 0;
  let urgentEmergencyCount = 0;
  const escalationReasonBreakdown = zeroRecord(Object.values(EscalationReasonCategory));

  for (const q of questionsCreatedInRange) {
    byCategory[q.category] = (byCategory[q.category] ?? 0) + 1;
    if (q.disposition) byDisposition[q.disposition] = (byDisposition[q.disposition] ?? 0) + 1;

    if (q.aiResponseStatus === "SUCCESS") aiSucceeded++;
    else if (q.aiResponseStatus === "FAILED") aiFailed++;
    else if (q.aiResponseStatus === "SKIPPED") aiSkipped++;

    if (q.clarifyingExchange) clarifyingQuestionsIssued++;

    if (q.disposition === QuestionDisposition.GENERAL_EDUCATION && q.aiResponseStatus === "SUCCESS") {
      resolvedByAiWithoutPharmacist++;
    }
    if (
      q.disposition === QuestionDisposition.PHARMACIST_REVIEW ||
      q.disposition === QuestionDisposition.PROVIDER_EVALUATION
    ) {
      routedToPharmacistInstead++;
    }

    const usage = q.aiUsage as unknown as { inputTokens?: number; outputTokens?: number } | null;
    if (usage) {
      inputTokens += usage.inputTokens ?? 0;
      outputTokens += usage.outputTokens ?? 0;
    }

    if (q.disposition === QuestionDisposition.PROVIDER_EVALUATION) automaticRoutingCount++;
    if (q.status === QuestionStatus.ESCALATED) {
      pharmacistInitiatedCount++;
      if (q.escalationReasonCategory) {
        escalationReasonBreakdown[q.escalationReasonCategory] =
          (escalationReasonBreakdown[q.escalationReasonCategory] ?? 0) + 1;
      }
    }
    if (q.disposition === QuestionDisposition.URGENT_EMERGENCY) urgentEmergencyCount++;
  }

  const totalQuestions = questionsCreatedInRange.length;
  const reachedPharmacist =
    (byDisposition[QuestionDisposition.PHARMACIST_REVIEW] ?? 0) +
    (byDisposition[QuestionDisposition.PROVIDER_EVALUATION] ?? 0);
  // Deduplicated per question — see the AnalyticsReport.providerEscalation
  // doc comment above and docs/doseprepped/ARCHITECTURE.md §3.
  const totalEscalatedToProvider = questionsCreatedInRange.filter(
    (q) => q.disposition === QuestionDisposition.PROVIDER_EVALUATION || q.status === QuestionStatus.ESCALATED,
  ).length;
  const resolvedWithoutProviderEscalation = totalQuestions - totalEscalatedToProvider;

  // --- adherence / check-in ---------------------------------------------
  const adherenceSummary = computeAdherenceSummary(adherenceEventsInRange);
  const checkInResponseBreakdown = zeroRecord(Object.values(CheckInResponse));
  for (const c of checkInsInRange) {
    checkInResponseBreakdown[c.response] = (checkInResponseBreakdown[c.response] ?? 0) + 1;
  }

  // --- pharmacist ---------------------------------------------------------
  const waitTimes = claimedInRange
    .filter((q) => q.pharmacistRequestedAt && q.pharmacistClaimedAt)
    .map((q) => q.pharmacistClaimedAt!.getTime() - q.pharmacistRequestedAt!.getTime());
  const responseTimes = respondedInRange
    .filter((q) => q.pharmacistClaimedAt && q.pharmacistRespondedAt)
    .map((q) => q.pharmacistRespondedAt!.getTime() - q.pharmacistClaimedAt!.getTime());
  const queueAgingMs = unclaimedQueue
    .filter((q) => q.pharmacistRequestedAt)
    .map((q) => now.getTime() - q.pharmacistRequestedAt!.getTime());

  const averageResponseTimeMs = average(responseTimes);

  const report: AnalyticsReport = {
    range: { from: from.toISOString(), to: to.toISOString() },

    patientEngagement: {
      patientsActivated,
      activePatients: activePatientIds.size,
      totalPatients,
      medicationRecordsAdded,
      totalMedicationRecords,
      medicationViews,
      adherenceEventsRecorded: adherenceEventsInRange.length,
      checkInsCompleted: checkInsInRange.length,
      questionsSubmitted: totalQuestions,
      repeatPatients,
    },

    questionFunnel: {
      totalQuestions,
      byCategory,
      byDisposition,
    },

    ai: {
      invoked: aiSucceeded + aiFailed,
      succeeded: aiSucceeded,
      failed: aiFailed,
      skipped: aiSkipped,
      educationGenerated: aiSucceeded,
      clarifyingQuestionsIssued,
      resolvedByAiWithoutPharmacist,
      routedToPharmacistInstead,
      tokenUsage: { inputTokens, outputTokens },
    },

    pharmacist: {
      enteredQueue: reachedPharmacist,
      claimed: claimedInRange.length,
      responded: respondedInRange.length,
      escalated: escalatedInRange.length,
      unclaimedQueueVolume: unclaimedQueue.length,
      averageWaitToClaimMs: average(waitTimes),
      averageResponseTimeMs,
      averageQueueAgingMs: average(queueAgingMs),
    },

    providerEscalation: {
      reachedPharmacist,
      automaticRoutingCount,
      pharmacistInitiatedCount,
      totalEscalatedToProvider,
      escalationRate: ratePercent(totalEscalatedToProvider, totalQuestions),
      resolvedWithoutProviderEscalation,
      resolvedWithoutProviderEscalationRate: ratePercent(resolvedWithoutProviderEscalation, totalQuestions),
      escalationReasonBreakdown,
      urgentEmergencyCount,
    },

    adherenceCheckIn: {
      adherenceEventsRecorded: adherenceEventsInRange.length,
      takenCount: adherenceSummary.takenCount,
      missedCount: adherenceSummary.missedCount,
      skippedCount: adherenceSummary.skippedCount,
      adherenceRatePercent: adherenceSummary.adherencePercentage,
      checkInsCompleted: checkInsInRange.length,
      checkInResponseBreakdown,
    },

    roiOperationalMetrics: {
      questionsPerThousandPatients: perThousand(totalQuestions, totalPatients),
      pharmacistCasesPerThousandPatients: perThousand(reachedPharmacist, totalPatients),
      providerEscalationsPerThousandPatients: perThousand(totalEscalatedToProvider, totalPatients),
      percentResolvedWithoutProviderEscalation: ratePercent(resolvedWithoutProviderEscalation, totalQuestions),
      averagePharmacistResponseTimeMs: averageResponseTimeMs,
      note: ROI_NOTE,
    },
  };

  return report;
}

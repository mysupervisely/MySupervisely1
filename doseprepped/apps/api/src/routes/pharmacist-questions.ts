import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  prisma,
  Role,
  QuestionDisposition,
  QuestionStatus,
  EscalationReasonCategory,
  AnalyticsEventType,
  OrganizationRole,
  type MedicationQuestion,
  type Prisma,
} from "@doseprepped/db";
import { requireRole } from "../lib/auth.js";
import { computeAdherenceSummary } from "../lib/adherence.js";
import { emitAnalyticsEvent } from "../lib/analytics.js";

const ESCALATION_REASON_CATEGORIES = Object.values(EscalationReasonCategory) as [
  EscalationReasonCategory,
  ...EscalationReasonCategory[],
];

const respondSchema = z.object({
  responseText: z.string().trim().min(1, "A response is required.").max(4000),
});

const escalateSchema = z.object({
  escalationReasonCategory: z.enum(ESCALATION_REASON_CATEGORIES, "An escalation reason category is required."),
  escalationReason: z.string().trim().min(1, "Please explain why this is being escalated.").max(2000),
});

const QUEUE_TABS = ["NEW", "IN_REVIEW", "COMPLETED", "ESCALATED"] as const;
export type QueueTab = (typeof QUEUE_TABS)[number];

export const queueQuerySchema = z.object({
  tab: z.enum(QUEUE_TABS).optional(),
});

// Sort priority for the queue list — presentation-layer ordering only, not
// a filter and not a clinical triage decision. See
// docs/doseprepped/ARCHITECTURE.md "Prioritization (transparent, not
// automatic clinical triage)".
const DISPOSITION_PRIORITY: Record<string, number> = {
  [QuestionDisposition.PROVIDER_EVALUATION]: 0,
  [QuestionDisposition.PHARMACIST_REVIEW]: 1,
};

interface MedicationSnapshot {
  name: string;
  strength: string;
  dosageForm?: string;
  directions: string;
  frequency: string;
  route: string;
}

interface OtherMedicationSnapshot {
  name: string;
  strength: string;
}

interface AiPharmacistSummary {
  summaryText: string;
  isAiGenerated: true;
}

/**
 * Every field a pharmacist may see for a question — deliberately excludes
 * the patient's identity (name/email/DOB) and any data outside this one
 * question's own record. See docs/doseprepped/ARCHITECTURE.md "Pharmacist
 * question view".
 */
function serializeForPharmacist(question: MedicationQuestion) {
  const aiPharmacistSummary = question.aiPharmacistSummary as unknown as AiPharmacistSummary | null;

  return {
    id: question.id,
    medicationSnapshot: question.medicationSnapshot as unknown as MedicationSnapshot,
    otherMedicationsSnapshot: question.otherMedicationsSnapshot as unknown as OtherMedicationSnapshot[] | null,
    category: question.category,
    aiSuggestedCategory: question.aiSuggestedCategory,
    questionText: question.questionText,
    disposition: question.disposition,
    safetyRuleSetVersion: question.safetyRuleSetVersion,
    aiPharmacistSummary: aiPharmacistSummary?.summaryText ?? null,
    status: question.status,
    pharmacistId: question.pharmacistId,
    submittedAt: question.createdAt.toISOString(),
    claimedAt: question.pharmacistClaimedAt ? question.pharmacistClaimedAt.toISOString() : null,
    pharmacistResponse: question.pharmacistResponse,
    respondedAt: question.pharmacistRespondedAt ? question.pharmacistRespondedAt.toISOString() : null,
    escalatedAt: question.escalatedAt ? question.escalatedAt.toISOString() : null,
    escalationReasonCategory: question.escalationReasonCategory,
    escalationReason: question.escalationReason,
    resolvedAt: question.resolvedAt ? question.resolvedAt.toISOString() : null,
  };
}

/**
 * M5.2 — bounded, clearly-labeled medication-journey context for the
 * single question the pharmacist is already authorized to view. See
 * docs/doseprepped/ARCHITECTURE.md "M5.2 — Pharmacist context" for the
 * full authorization rationale: this reads only the same patient's data
 * for the same medication the current question is about (both already
 * known server-side from `question`), never `patientId`/`medicationId`
 * themselves are added to the response, and only the single most recent
 * check-in and most recent *other* question are included — never a full
 * history. Deliberately computed only for the single-question detail
 * route below, not the queue list, to avoid an N+1 context computation
 * across every queued question.
 */
async function buildMedicationContext(question: MedicationQuestion) {
  const [medication, adherenceEvents, recentCheckIn, recentQuestion] = await Promise.all([
    prisma.patientMedication.findUnique({
      where: { id: question.medicationId },
      select: { startDate: true },
    }),
    prisma.medicationAdherenceEvent.findMany({
      where: { medicationId: question.medicationId, patientId: question.patientId },
      select: { status: true },
    }),
    prisma.medicationCheckIn.findFirst({
      where: { medicationId: question.medicationId, patientId: question.patientId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.medicationQuestion.findFirst({
      where: {
        medicationId: question.medicationId,
        patientId: question.patientId,
        id: { not: question.id },
      },
      orderBy: { createdAt: "desc" },
      select: { category: true, questionText: true, createdAt: true, status: true },
    }),
  ]);

  return {
    startedAt: medication ? medication.startDate.toISOString() : null,
    // System-calculated — see apps/api/src/lib/adherence.ts for the exact
    // formula. Null (not 0%) when there are no recorded events yet.
    adherence: adherenceEvents.length > 0 ? computeAdherenceSummary(adherenceEvents) : null,
    // Patient-reported, unedited.
    recentCheckIn: recentCheckIn
      ? {
          response: recentCheckIn.response,
          notes: recentCheckIn.notes,
          occurredAt: recentCheckIn.createdAt.toISOString(),
        }
      : null,
    // Patient-reported, unedited — never this other question's
    // pharmacistResponse, which may belong to a different pharmacist.
    recentQuestion: recentQuestion
      ? {
          category: recentQuestion.category,
          questionText: recentQuestion.questionText,
          occurredAt: recentQuestion.createdAt.toISOString(),
          status: recentQuestion.status,
        }
      : null,
  };
}

/**
 * M5.4 — the organization ids (if any) this pharmacist holds an
 * ORG_PHARMACIST membership in. See docs/doseprepped/ARCHITECTURE.md
 * "M5.4 — Pharmacist / organization relationship". A user is expected to
 * hold at most one such membership under the current milestone, but this
 * makes no such assumption in code.
 */
async function resolvePharmacistOrgIds(pharmacistId: string): Promise<string[]> {
  const memberships = await prisma.organizationMembership.findMany({
    where: { userId: pharmacistId, role: OrganizationRole.ORG_PHARMACIST },
    select: { organizationId: true },
  });
  return memberships.map((m) => m.organizationId);
}

/**
 * M5.4 — the tenant boundary for the pharmacist queue. Strict and
 * symmetric, no hybrid/bonus-access model: an org-affiliated pharmacist
 * sees ONLY patients who are ORG_PATIENT members of one of their
 * organizations; an org-less ("DosePrepped Direct") pharmacist sees ONLY
 * patients with zero organization memberships. See
 * docs/doseprepped/ARCHITECTURE.md "M5.4 — Pharmacist / organization
 * relationship & tenant-isolated queue".
 */
function patientPoolWhere(orgIds: string[]): Prisma.MedicationQuestionWhereInput {
  if (orgIds.length === 0) {
    return { patient: { memberships: { none: {} } } };
  }
  return {
    patient: {
      memberships: { some: { organizationId: { in: orgIds }, role: OrganizationRole.ORG_PATIENT } },
    },
  };
}

/**
 * The one authorization boundary every pharmacist route uses — see
 * docs/doseprepped/ARCHITECTURE.md "Pharmacist queue architecture". A
 * question is visible to a pharmacist only if it's unclaimed and in the
 * shared queue, or if they are the pharmacist who claimed it (regardless
 * of its current status) — AND, as of M5.4, only if the patient is within
 * this pharmacist's tenant pool (see `patientPoolWhere`).
 */
async function visibilityWhere(pharmacistId: string): Promise<Prisma.MedicationQuestionWhereInput> {
  const orgIds = await resolvePharmacistOrgIds(pharmacistId);
  return {
    AND: [
      { OR: [{ status: QuestionStatus.PHARMACIST_REQUESTED, pharmacistId: null }, { pharmacistId }] },
      patientPoolWhere(orgIds),
    ],
  };
}

function tabWhere(tab: QueueTab, pharmacistId: string): Prisma.MedicationQuestionWhereInput {
  switch (tab) {
    case "NEW":
      return { status: QuestionStatus.PHARMACIST_REQUESTED, pharmacistId: null };
    case "IN_REVIEW":
      return { status: QuestionStatus.PHARMACIST_IN_PROGRESS, pharmacistId };
    case "COMPLETED":
      return { status: QuestionStatus.PHARMACIST_RESOLVED, pharmacistId };
    case "ESCALATED":
      return { status: QuestionStatus.ESCALATED, pharmacistId };
  }
}

/**
 * M5.4 — extracted so both the global `/pharmacist/queue` route and the
 * tenant-scoped `/organizations/:organizationId/pharmacist/queue` route
 * (see routes/organizations.ts) share exactly one query/count/sort
 * implementation. `visibilityWhere` already tenant-scopes the result —
 * the caller doesn't need to know whether `pharmacistId` is org-affiliated
 * or not.
 */
export async function buildPharmacistQueueResponse(pharmacistId: string, tab?: QueueTab) {
  const visible = await prisma.medicationQuestion.findMany({
    where: await visibilityWhere(pharmacistId),
  });

  const counts = {
    new: visible.filter((q) => q.status === QuestionStatus.PHARMACIST_REQUESTED && q.pharmacistId === null).length,
    inReview: visible.filter(
      (q) => q.status === QuestionStatus.PHARMACIST_IN_PROGRESS && q.pharmacistId === pharmacistId,
    ).length,
    completed: visible.filter(
      (q) => q.status === QuestionStatus.PHARMACIST_RESOLVED && q.pharmacistId === pharmacistId,
    ).length,
    escalated: visible.filter((q) => q.status === QuestionStatus.ESCALATED && q.pharmacistId === pharmacistId)
      .length,
  };

  const filtered = tab
    ? visible.filter((q) => {
        const where = tabWhere(tab, pharmacistId);
        return q.status === where.status && q.pharmacistId === where.pharmacistId;
      })
    : visible;

  const sorted = [...filtered].sort((a, b) => {
    const priorityDiff =
      (DISPOSITION_PRIORITY[a.disposition ?? ""] ?? 2) - (DISPOSITION_PRIORITY[b.disposition ?? ""] ?? 2);
    if (priorityDiff !== 0) return priorityDiff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return { counts, questions: sorted.map(serializeForPharmacist) };
}

export async function pharmacistQuestionRoutes(app: FastifyInstance) {
  app.get(
    "/pharmacist/queue",
    { preHandler: requireRole(Role.PHARMACIST) },
    async (request, reply) => {
      const parsed = queueQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid query.", details: parsed.error.flatten() });
      }

      const result = await buildPharmacistQueueResponse(request.user!.id, parsed.data.tab);
      return reply.send(result);
    },
  );

  app.get(
    "/pharmacist/questions/:id",
    { preHandler: requireRole(Role.PHARMACIST) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const pharmacistId = request.user!.id;

      const question = await prisma.medicationQuestion.findFirst({
        where: { id, ...(await visibilityWhere(pharmacistId)) },
      });

      if (!question) {
        return reply.code(404).send({ error: "Question not found." });
      }

      const medicationContext = await buildMedicationContext(question);
      return reply.send({ question: { ...serializeForPharmacist(question), medicationContext } });
    },
  );

  app.post(
    "/pharmacist/questions/:id/claim",
    { preHandler: requireRole(Role.PHARMACIST) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const pharmacistId = request.user!.id;
      const orgIds = await resolvePharmacistOrgIds(pharmacistId);

      // Single atomic conditional update — see
      // docs/doseprepped/ARCHITECTURE.md "Claim concurrency". No
      // read-then-write race window: PostgreSQL evaluates WHERE and
      // applies SET as one row-locked operation, so if two pharmacists
      // race, exactly one UPDATE matches. M5.4 adds `patientPoolWhere` to
      // this same atomic WHERE so a pharmacist can never claim a
      // question outside their tenant pool, even under a race.
      const result = await prisma.medicationQuestion.updateMany({
        where: {
          id,
          status: QuestionStatus.PHARMACIST_REQUESTED,
          pharmacistId: null,
          ...patientPoolWhere(orgIds),
        },
        data: {
          pharmacistId,
          pharmacistClaimedAt: new Date(),
          status: QuestionStatus.PHARMACIST_IN_PROGRESS,
        },
      });

      if (result.count === 0) {
        // Distinguish "never existed / never queue-eligible / belongs to
        // another organization's tenant pool" (404, same as
        // every other out-of-scope pharmacist access) from "genuinely
        // exists and was in the shared queue, but someone already claimed
        // it" (409 — the race-loser case required by
        // docs/doseprepped/ARCHITECTURE.md "Claim concurrency"). This
        // check is intentionally NOT scoped to this pharmacist's own
        // claims: the question was visible in the shared unclaimed queue
        // to any pharmacist before the race, so confirming "someone else
        // got it first" reveals nothing this pharmacist didn't already
        // have visibility into.
        // Re-checked with the same patientPoolWhere filter as the update
        // above: a question that genuinely exists but belongs to another
        // organization's tenant pool comes back null here, exactly like a
        // question that never existed — see docs/doseprepped/ARCHITECTURE.md
        // "M5.4 — Pharmacist / organization relationship" for why this is
        // folded into 404 rather than a separate case.
        const existing = await prisma.medicationQuestion.findFirst({
          where: { id, ...patientPoolWhere(orgIds) },
        });
        const wasQueueEligible =
          existing?.disposition === QuestionDisposition.PHARMACIST_REVIEW ||
          existing?.disposition === QuestionDisposition.PROVIDER_EVALUATION;
        if (!existing || !wasQueueEligible) {
          return reply.code(404).send({ error: "Question not found." });
        }
        return reply.code(409).send({ error: "This question is no longer available to claim." });
      }

      const question = await prisma.medicationQuestion.findUniqueOrThrow({ where: { id } });

      await emitAnalyticsEvent(
        {
          eventType: AnalyticsEventType.PHARMACIST_CLAIMED,
          pharmacistId,
          patientId: question.patientId,
          questionId: question.id,
          metadata: {
            disposition: question.disposition,
            waitTimeMs:
              question.pharmacistRequestedAt && question.pharmacistClaimedAt
                ? question.pharmacistClaimedAt.getTime() - question.pharmacistRequestedAt.getTime()
                : null,
          },
        },
        request.log,
      );

      return reply.send({ question: serializeForPharmacist(question) });
    },
  );

  app.post(
    "/pharmacist/questions/:id/release",
    { preHandler: requireRole(Role.PHARMACIST) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const pharmacistId = request.user!.id;

      const owned = await prisma.medicationQuestion.findFirst({ where: { id, pharmacistId } });
      if (!owned) {
        return reply.code(404).send({ error: "Question not found." });
      }
      if (owned.status !== QuestionStatus.PHARMACIST_IN_PROGRESS) {
        return reply.code(409).send({ error: "This question cannot be released in its current state." });
      }

      const result = await prisma.medicationQuestion.updateMany({
        where: { id, pharmacistId, status: QuestionStatus.PHARMACIST_IN_PROGRESS },
        data: { pharmacistId: null, pharmacistClaimedAt: null, status: QuestionStatus.PHARMACIST_REQUESTED },
      });
      if (result.count === 0) {
        return reply.code(409).send({ error: "This question cannot be released in its current state." });
      }

      const question = await prisma.medicationQuestion.findUniqueOrThrow({ where: { id } });
      return reply.send({ question: serializeForPharmacist(question) });
    },
  );

  app.post(
    "/pharmacist/questions/:id/respond",
    { preHandler: requireRole(Role.PHARMACIST) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const pharmacistId = request.user!.id;

      const parsed = respondSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
      }

      const owned = await prisma.medicationQuestion.findFirst({ where: { id, pharmacistId } });
      if (!owned) {
        return reply.code(404).send({ error: "Question not found." });
      }
      if (owned.status !== QuestionStatus.PHARMACIST_IN_PROGRESS) {
        return reply.code(409).send({ error: "This question cannot be responded to in its current state." });
      }

      // No AI/LLM call anywhere in this handler — the response is written
      // verbatim from the authenticated pharmacist's own request body. See
      // docs/doseprepped/ARCHITECTURE.md "Patient/pharmacist response
      // separation" and "AI's role in the pharmacist workflow".
      const result = await prisma.medicationQuestion.updateMany({
        where: { id, pharmacistId, status: QuestionStatus.PHARMACIST_IN_PROGRESS },
        data: {
          pharmacistResponse: parsed.data.responseText,
          pharmacistRespondedAt: new Date(),
          status: QuestionStatus.PHARMACIST_RESOLVED,
          resolvedAt: new Date(),
        },
      });
      if (result.count === 0) {
        return reply.code(409).send({ error: "This question cannot be responded to in its current state." });
      }

      const question = await prisma.medicationQuestion.findUniqueOrThrow({ where: { id } });

      // metadata carries only the computed handling-time delta — never
      // `responseText`. See docs/doseprepped/ARCHITECTURE.md "M5.3 — What
      // analytics must never store".
      await emitAnalyticsEvent(
        {
          eventType: AnalyticsEventType.PHARMACIST_RESPONDED,
          pharmacistId,
          patientId: question.patientId,
          questionId: question.id,
          metadata: {
            handlingTimeMs:
              question.pharmacistClaimedAt && question.pharmacistRespondedAt
                ? question.pharmacistRespondedAt.getTime() - question.pharmacistClaimedAt.getTime()
                : null,
          },
        },
        request.log,
      );

      return reply.send({ question: serializeForPharmacist(question) });
    },
  );

  app.post(
    "/pharmacist/questions/:id/escalate",
    { preHandler: requireRole(Role.PHARMACIST) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const pharmacistId = request.user!.id;

      const parsed = escalateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
      }

      const owned = await prisma.medicationQuestion.findFirst({ where: { id, pharmacistId } });
      if (!owned) {
        return reply.code(404).send({ error: "Question not found." });
      }
      if (owned.status !== QuestionStatus.PHARMACIST_IN_PROGRESS) {
        return reply.code(409).send({ error: "This question cannot be escalated in its current state." });
      }

      const result = await prisma.medicationQuestion.updateMany({
        where: { id, pharmacistId, status: QuestionStatus.PHARMACIST_IN_PROGRESS },
        data: {
          escalationReasonCategory: parsed.data.escalationReasonCategory,
          escalationReason: parsed.data.escalationReason,
          escalatedAt: new Date(),
          status: QuestionStatus.ESCALATED,
        },
      });
      if (result.count === 0) {
        return reply.code(409).send({ error: "This question cannot be escalated in its current state." });
      }

      const question = await prisma.medicationQuestion.findUniqueOrThrow({ where: { id } });

      // metadata carries only the closed-taxonomy reason category — never
      // the pharmacist's free-text `escalationReason`. See
      // docs/doseprepped/ARCHITECTURE.md "M5.3 — What analytics must
      // never store".
      await emitAnalyticsEvent(
        {
          eventType: AnalyticsEventType.PHARMACIST_ESCALATED,
          pharmacistId,
          patientId: question.patientId,
          questionId: question.id,
          metadata: { escalationReasonCategory: question.escalationReasonCategory },
        },
        request.log,
      );
      await emitAnalyticsEvent(
        {
          eventType: AnalyticsEventType.PROVIDER_ESCALATION_CREATED,
          pharmacistId,
          patientId: question.patientId,
          questionId: question.id,
          metadata: {
            source: "pharmacist_initiated",
            escalationReasonCategory: question.escalationReasonCategory,
          },
        },
        request.log,
      );

      return reply.send({ question: serializeForPharmacist(question) });
    },
  );
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  prisma,
  Role,
  QuestionDisposition,
  QuestionStatus,
  EscalationReasonCategory,
  type MedicationQuestion,
  type Prisma,
} from "@doseprepped/db";
import { requireRole } from "../lib/auth.js";

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
type QueueTab = (typeof QUEUE_TABS)[number];

const queueQuerySchema = z.object({
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
 * The one authorization boundary every pharmacist route uses — see
 * docs/doseprepped/ARCHITECTURE.md "Pharmacist queue architecture". A
 * question is visible to a pharmacist only if it's unclaimed and in the
 * shared queue, or if they are the pharmacist who claimed it (regardless
 * of its current status).
 */
function visibilityWhere(pharmacistId: string): Prisma.MedicationQuestionWhereInput {
  return {
    OR: [
      { status: QuestionStatus.PHARMACIST_REQUESTED, pharmacistId: null },
      { pharmacistId },
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

export async function pharmacistQuestionRoutes(app: FastifyInstance) {
  app.get(
    "/pharmacist/queue",
    { preHandler: requireRole(Role.PHARMACIST) },
    async (request, reply) => {
      const parsed = queueQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid query.", details: parsed.error.flatten() });
      }
      const pharmacistId = request.user!.id;

      const visible = await prisma.medicationQuestion.findMany({
        where: visibilityWhere(pharmacistId),
      });

      const counts = {
        new: visible.filter((q) => q.status === QuestionStatus.PHARMACIST_REQUESTED && q.pharmacistId === null)
          .length,
        inReview: visible.filter(
          (q) => q.status === QuestionStatus.PHARMACIST_IN_PROGRESS && q.pharmacistId === pharmacistId,
        ).length,
        completed: visible.filter(
          (q) => q.status === QuestionStatus.PHARMACIST_RESOLVED && q.pharmacistId === pharmacistId,
        ).length,
        escalated: visible.filter(
          (q) => q.status === QuestionStatus.ESCALATED && q.pharmacistId === pharmacistId,
        ).length,
      };

      const filtered = parsed.data.tab
        ? visible.filter((q) => {
            const where = tabWhere(parsed.data.tab!, pharmacistId);
            return q.status === where.status && q.pharmacistId === where.pharmacistId;
          })
        : visible;

      const sorted = [...filtered].sort((a, b) => {
        const priorityDiff = (DISPOSITION_PRIORITY[a.disposition ?? ""] ?? 2) - (DISPOSITION_PRIORITY[b.disposition ?? ""] ?? 2);
        if (priorityDiff !== 0) return priorityDiff;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      return reply.send({ counts, questions: sorted.map(serializeForPharmacist) });
    },
  );

  app.get(
    "/pharmacist/questions/:id",
    { preHandler: requireRole(Role.PHARMACIST) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const pharmacistId = request.user!.id;

      const question = await prisma.medicationQuestion.findFirst({
        where: { id, ...visibilityWhere(pharmacistId) },
      });

      if (!question) {
        return reply.code(404).send({ error: "Question not found." });
      }

      return reply.send({ question: serializeForPharmacist(question) });
    },
  );

  app.post(
    "/pharmacist/questions/:id/claim",
    { preHandler: requireRole(Role.PHARMACIST) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const pharmacistId = request.user!.id;

      // Single atomic conditional update — see
      // docs/doseprepped/ARCHITECTURE.md "Claim concurrency". No
      // read-then-write race window: PostgreSQL evaluates WHERE and
      // applies SET as one row-locked operation, so if two pharmacists
      // race, exactly one UPDATE matches.
      const result = await prisma.medicationQuestion.updateMany({
        where: { id, status: QuestionStatus.PHARMACIST_REQUESTED, pharmacistId: null },
        data: {
          pharmacistId,
          pharmacistClaimedAt: new Date(),
          status: QuestionStatus.PHARMACIST_IN_PROGRESS,
        },
      });

      if (result.count === 0) {
        // Distinguish "never existed / never queue-eligible" (404, same as
        // every other out-of-scope pharmacist access) from "genuinely
        // exists and was in the shared queue, but someone already claimed
        // it" (409 — the race-loser case required by
        // docs/doseprepped/ARCHITECTURE.md "Claim concurrency"). This
        // check is intentionally NOT scoped to this pharmacist's own
        // claims: the question was visible in the shared unclaimed queue
        // to any pharmacist before the race, so confirming "someone else
        // got it first" reveals nothing this pharmacist didn't already
        // have visibility into.
        const existing = await prisma.medicationQuestion.findUnique({ where: { id } });
        const wasQueueEligible =
          existing?.disposition === QuestionDisposition.PHARMACIST_REVIEW ||
          existing?.disposition === QuestionDisposition.PROVIDER_EVALUATION;
        if (!wasQueueEligible) {
          return reply.code(404).send({ error: "Question not found." });
        }
        return reply.code(409).send({ error: "This question is no longer available to claim." });
      }

      const question = await prisma.medicationQuestion.findUniqueOrThrow({ where: { id } });
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
      return reply.send({ question: serializeForPharmacist(question) });
    },
  );
}

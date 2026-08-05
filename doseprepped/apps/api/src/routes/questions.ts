import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  prisma,
  Role,
  QuestionCategory,
  QuestionStatus,
  QuestionDisposition,
  DispositionSource,
  AiResponseStatus,
  AnalyticsEventType,
  type MedicationQuestion,
} from "@doseprepped/db";
import { evaluateDisposition } from "@doseprepped/safety-rules";
import type { MedicationEducationProvider } from "@doseprepped/ai-service";
import { requireRole } from "../lib/auth.js";
import { runEducationPipeline } from "../lib/ai-education.js";
import { emitAnalyticsEvent } from "../lib/analytics.js";

const QUESTION_CATEGORIES = Object.values(QuestionCategory) as [QuestionCategory, ...QuestionCategory[]];

// Categories where cross-medication context is actually relevant — see
// docs/doseprepped/ARCHITECTURE.md §3. Every other category collects no
// other-medications data at all.
const CATEGORIES_NEEDING_OTHER_MEDICATIONS = new Set<QuestionCategory>([
  QuestionCategory.DRUG_INTERACTION,
  QuestionCategory.SIDE_EFFECT,
]);

const createQuestionSchema = z.object({
  medicationId: z.string().trim().min(1, "A medication is required."),
  category: z.enum(QUESTION_CATEGORIES, "A category is required."),
  questionText: z.string().trim().min(1, "Please describe your question.").max(2000),
});

const listQuerySchema = z.object({
  medicationId: z.string().trim().min(1).optional(),
});

// Index signatures make these assignable to Prisma's InputJsonValue when
// writing to the Json columns below.
interface MedicationSnapshot {
  name: string;
  strength: string;
  dosageForm: string;
  directions: string;
  frequency: string;
  route: string;
  [key: string]: string;
}

interface OtherMedicationSnapshot {
  name: string;
  strength: string;
  [key: string]: string;
}

interface ClarifyingExchangeJson {
  question: string;
  answer: null;
  [key: string]: string | null;
}

interface AiUsageJson {
  inputTokens: number;
  outputTokens: number;
  [key: string]: number;
}

interface AiPharmacistSummaryJson {
  summaryText: string;
  isAiGenerated: true;
  [key: string]: string | boolean;
}

function serializeQuestion(question: MedicationQuestion) {
  const clarifyingExchange = question.clarifyingExchange as unknown as { question: string } | null;

  return {
    id: question.id,
    medicationId: question.medicationId,
    medicationSnapshot: question.medicationSnapshot as unknown as MedicationSnapshot,
    otherMedicationsSnapshot: question.otherMedicationsSnapshot as unknown as OtherMedicationSnapshot[] | null,
    category: question.category,
    aiSuggestedCategory: question.aiSuggestedCategory,
    questionText: question.questionText,
    disposition: question.disposition,
    dispositionSource: question.dispositionSource,
    dispositionRuleIds: question.dispositionRuleIds,
    safetyRuleSetVersion: question.safetyRuleSetVersion,
    dispositionAssignedAt: question.dispositionAssignedAt
      ? question.dispositionAssignedAt.toISOString()
      : null,
    // AI-generated education/context (Phase 3). aiProvider, aiModelVersion,
    // aiPromptVersion, and aiUsage are audit-only fields, deliberately not
    // returned here — see docs/doseprepped/ARCHITECTURE.md "Audit
    // metadata". aiPharmacistSummary is likewise withheld — it's prepared
    // for a future pharmacist queue, not for the patient.
    aiEducationResponse: question.aiEducationResponse,
    aiEducationGeneratedAt: question.aiEducationGeneratedAt
      ? question.aiEducationGeneratedAt.toISOString()
      : null,
    aiResponseStatus: question.aiResponseStatus,
    clarifyingQuestion: clarifyingExchange?.question ?? null,
    status: question.status,
    pharmacistResponse: question.pharmacistResponse,
    pharmacistRespondedAt: question.pharmacistRespondedAt
      ? question.pharmacistRespondedAt.toISOString()
      : null,
    escalatedAt: question.escalatedAt ? question.escalatedAt.toISOString() : null,
    escalationReason: question.escalationReason,
    resolvedAt: question.resolvedAt ? question.resolvedAt.toISOString() : null,
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString(),
  };
}

export interface QuestionRoutesOptions {
  aiProvider: MedicationEducationProvider;
  aiTimeoutMs: number;
}

export async function questionRoutes(app: FastifyInstance, opts: QuestionRoutesOptions) {
  app.get(
    "/questions",
    { preHandler: requireRole(Role.PATIENT) },
    async (request, reply) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid query.", details: parsed.error.flatten() });
      }

      const questions = await prisma.medicationQuestion.findMany({
        where: {
          patientId: request.user!.id,
          ...(parsed.data.medicationId ? { medicationId: parsed.data.medicationId } : {}),
        },
        orderBy: { createdAt: "desc" },
      });

      return reply.send({ questions: questions.map(serializeQuestion) });
    },
  );

  app.post(
    "/questions",
    { preHandler: requireRole(Role.PATIENT) },
    async (request, reply) => {
      const parsed = createQuestionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
      }

      const { medicationId, category, questionText } = parsed.data;

      // Ownership check on the medication being asked about — never trust
      // a client-supplied medicationId without confirming it belongs to
      // the requesting patient. A medication that exists but belongs to
      // another patient is indistinguishable from one that doesn't exist.
      const medication = await prisma.patientMedication.findFirst({
        where: { id: medicationId, patientId: request.user!.id },
      });
      if (!medication) {
        return reply.code(404).send({ error: "Medication not found." });
      }

      const medicationSnapshot: MedicationSnapshot = {
        name: medication.name,
        strength: medication.strength,
        dosageForm: medication.dosageForm,
        directions: medication.directions,
        frequency: medication.frequency,
        route: medication.route,
      };

      let otherMedicationsSnapshot: OtherMedicationSnapshot[] | null = null;
      if (CATEGORIES_NEEDING_OTHER_MEDICATIONS.has(category)) {
        const others = await prisma.patientMedication.findMany({
          where: {
            patientId: request.user!.id,
            status: "ACTIVE",
            id: { not: medication.id },
          },
          select: { name: true, strength: true },
          take: 20,
        });
        otherMedicationsSnapshot = others;
      }

      // Deterministic safety/disposition gate (M3 Phase 2) — a pure,
      // synchronous rule evaluation with no AI/LLM involved. See
      // docs/doseprepped/ARCHITECTURE.md "Deterministic Safety &
      // Disposition Rule Engine". This is the only thing that decides
      // disposition, ever; it always runs first and never depends on any
      // external service being available. Nothing below can change its
      // result.
      const safetyResult = evaluateDisposition(questionText, category);
      const disposition = safetyResult.disposition;

      // M3 Phase 3 — AI-assisted education, gated behind the disposition
      // above. URGENT_EMERGENCY never invokes the provider at all: no
      // normal educational content should ever precede emergency
      // guidance, and there's no cost/latency reason to call it. See
      // docs/doseprepped/ARCHITECTURE.md "Disposition-gated behavior".
      const aiOutcome =
        disposition === "URGENT_EMERGENCY"
          ? ({ status: "SKIPPED", reason: "urgent_emergency_disposition" } as const)
          : await runEducationPipeline(opts.aiProvider, opts.aiTimeoutMs, {
              medicationSnapshot,
              otherMedicationsSnapshot,
              category,
              questionText,
              disposition,
            });

      let aiEducationResponse: string | undefined;
      let aiEducationGeneratedAt: Date | undefined;
      let aiModelVersion: string | undefined;
      let aiProvider: string | undefined;
      let aiPromptVersion: string | undefined;
      let aiUsage: AiUsageJson | undefined;
      let aiSuggestedCategory: QuestionCategory | undefined;
      let clarifyingExchange: ClarifyingExchangeJson | undefined;
      let aiPharmacistSummary: AiPharmacistSummaryJson | undefined;
      let status: QuestionStatus | undefined;

      if (aiOutcome.status === "SUCCESS") {
        aiEducationResponse = aiOutcome.responseText;
        aiEducationGeneratedAt = new Date();
        aiModelVersion = aiOutcome.model;
        aiProvider = aiOutcome.provider;
        aiPromptVersion = aiOutcome.promptVersion;
        aiUsage = { inputTokens: aiOutcome.usage.inputTokens, outputTokens: aiOutcome.usage.outputTokens };
        if (aiOutcome.suggestedCategory) {
          aiSuggestedCategory = aiOutcome.suggestedCategory as QuestionCategory;
        }
        if (aiOutcome.clarifyingQuestion) {
          clarifyingExchange = { question: aiOutcome.clarifyingQuestion, answer: null };
        }
        if (aiOutcome.pharmacistSummary) {
          aiPharmacistSummary = { summaryText: aiOutcome.pharmacistSummary, isAiGenerated: true };
        }
        if (disposition === "GENERAL_EDUCATION") {
          status = QuestionStatus.AI_ANSWERED;
        }
      }

      const aiResponseStatus =
        aiOutcome.status === "SUCCESS"
          ? AiResponseStatus.SUCCESS
          : aiOutcome.status === "FAILED"
            ? AiResponseStatus.FAILED
            : AiResponseStatus.SKIPPED;

      // M4 — automatic pharmacist queueing. A question whose deterministic
      // disposition needs human review enters the shared pharmacist queue
      // immediately, in this same request, regardless of whether the AI
      // step above succeeded or failed — the pharmacist still needs to see
      // it either way. See docs/doseprepped/ARCHITECTURE.md "Why queue
      // entry is automatic, not patient-initiated". GENERAL_EDUCATION
      // (already fully AI-answered) and URGENT_EMERGENCY (never handled by
      // AI or pharmacist) are never queued.
      let pharmacistRequestedAt: Date | undefined;
      if (disposition === "PHARMACIST_REVIEW" || disposition === "PROVIDER_EVALUATION") {
        status = QuestionStatus.PHARMACIST_REQUESTED;
        pharmacistRequestedAt = new Date();
      }

      const question = await prisma.medicationQuestion.create({
        data: {
          patientId: request.user!.id,
          medicationId: medication.id,
          medicationSnapshot,
          otherMedicationsSnapshot: otherMedicationsSnapshot ?? undefined,
          category,
          questionText,
          disposition: safetyResult.disposition,
          dispositionSource: DispositionSource.DETERMINISTIC,
          dispositionRuleIds: safetyResult.matchedRuleIds,
          safetyRuleSetVersion: safetyResult.ruleSetVersion,
          dispositionAssignedAt: new Date(),
          aiEducationResponse,
          aiEducationGeneratedAt,
          aiModelVersion,
          aiProvider,
          aiPromptVersion,
          aiUsage,
          aiSuggestedCategory,
          clarifyingExchange,
          aiPharmacistSummary,
          aiResponseStatus,
          status,
          pharmacistRequestedAt,
        },
      });

      // M5.3 — analytics events. See docs/doseprepped/ARCHITECTURE.md
      // "M5.3 — Analytics event architecture" for exactly what each event
      // means and why; every call here fires after the question row has
      // already been written, and none of it can affect the response
      // below (emitAnalyticsEvent never throws).
      const patientId = request.user!.id;
      await emitAnalyticsEvent(
        {
          eventType: AnalyticsEventType.QUESTION_SUBMITTED,
          patientId,
          questionId: question.id,
          medicationId: medication.id,
          metadata: { category },
        },
        request.log,
      );
      await emitAnalyticsEvent(
        {
          eventType: AnalyticsEventType.QUESTION_DISPOSITION_ASSIGNED,
          patientId,
          questionId: question.id,
          metadata: { disposition, dispositionSource: DispositionSource.DETERMINISTIC },
        },
        request.log,
      );
      if (aiOutcome.status === "SUCCESS") {
        await emitAnalyticsEvent(
          {
            eventType: AnalyticsEventType.AI_EDUCATION_GENERATED,
            patientId,
            questionId: question.id,
            metadata: {
              disposition,
              hasClarifyingQuestion: Boolean(clarifyingExchange),
              hasPharmacistSummary: Boolean(aiPharmacistSummary),
              inputTokens: aiUsage?.inputTokens ?? null,
              outputTokens: aiUsage?.outputTokens ?? null,
            },
          },
          request.log,
        );
      } else if (aiOutcome.status === "FAILED") {
        await emitAnalyticsEvent(
          {
            eventType: AnalyticsEventType.AI_EDUCATION_FAILED,
            patientId,
            questionId: question.id,
            metadata: { disposition },
          },
          request.log,
        );
      }
      if (status === QuestionStatus.PHARMACIST_REQUESTED) {
        await emitAnalyticsEvent(
          {
            eventType: AnalyticsEventType.PHARMACIST_QUEUE_ENTERED,
            patientId,
            questionId: question.id,
            metadata: { disposition },
          },
          request.log,
        );
      }
      if (disposition === QuestionDisposition.PROVIDER_EVALUATION) {
        await emitAnalyticsEvent(
          {
            eventType: AnalyticsEventType.PROVIDER_ESCALATION_CREATED,
            patientId,
            questionId: question.id,
            metadata: { source: "automatic_routing" },
          },
          request.log,
        );
      }

      return reply.code(201).send({ question: serializeQuestion(question) });
    },
  );

  app.get(
    "/questions/:id",
    { preHandler: requireRole(Role.PATIENT) },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const question = await prisma.medicationQuestion.findFirst({
        where: { id, patientId: request.user!.id },
      });

      if (!question) {
        return reply.code(404).send({ error: "Question not found." });
      }

      return reply.send({ question: serializeQuestion(question) });
    },
  );
}

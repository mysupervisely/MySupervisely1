import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, Role, QuestionCategory, type MedicationQuestion } from "@doseprepped/db";
import { requireRole } from "../lib/auth.js";

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

function serializeQuestion(question: MedicationQuestion) {
  return {
    id: question.id,
    medicationId: question.medicationId,
    medicationSnapshot: question.medicationSnapshot as unknown as MedicationSnapshot,
    otherMedicationsSnapshot: question.otherMedicationsSnapshot as unknown as OtherMedicationSnapshot[] | null,
    category: question.category,
    aiSuggestedCategory: question.aiSuggestedCategory,
    questionText: question.questionText,
    disposition: question.disposition,
    aiEducationResponse: question.aiEducationResponse,
    status: question.status,
    pharmacistResponse: question.pharmacistResponse,
    escalatedAt: question.escalatedAt ? question.escalatedAt.toISOString() : null,
    escalationReason: question.escalationReason,
    resolvedAt: question.resolvedAt ? question.resolvedAt.toISOString() : null,
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString(),
  };
}

export async function questionRoutes(app: FastifyInstance) {
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

      const question = await prisma.medicationQuestion.create({
        data: {
          patientId: request.user!.id,
          medicationId: medication.id,
          medicationSnapshot,
          otherMedicationsSnapshot: otherMedicationsSnapshot ?? undefined,
          category,
          questionText,
        },
      });

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

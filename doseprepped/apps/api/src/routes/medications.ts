import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, Role, MedicationStatus, type PatientMedication } from "@doseprepped/db";
import { medicationReferenceProvider } from "@doseprepped/db/medication-reference";
import { requireRole } from "../lib/auth.js";

const textField = (max: number) => z.string().trim().min(1, "This field is required.").max(max);

const medicationInputSchema = z.object({
  name: textField(200),
  strength: textField(100),
  dosageForm: textField(100),
  directions: textField(2000),
  frequency: textField(200),
  route: textField(100),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const medicationUpdateSchema = z.object({
  name: textField(200).optional(),
  strength: textField(100).optional(),
  dosageForm: textField(100).optional(),
  directions: textField(2000).optional(),
  frequency: textField(200).optional(),
  route: textField(100).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const listQuerySchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const referenceQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
});

function serializeMedication(medication: PatientMedication) {
  return {
    id: medication.id,
    name: medication.name,
    strength: medication.strength,
    dosageForm: medication.dosageForm,
    directions: medication.directions,
    frequency: medication.frequency,
    route: medication.route,
    startDate: medication.startDate.toISOString(),
    endDate: medication.endDate ? medication.endDate.toISOString() : null,
    notes: medication.notes,
    status: medication.status,
    createdAt: medication.createdAt.toISOString(),
    updatedAt: medication.updatedAt.toISOString(),
    archivedAt: medication.archivedAt ? medication.archivedAt.toISOString() : null,
  };
}

export async function medicationRoutes(app: FastifyInstance) {
  app.get(
    "/medications",
    { preHandler: requireRole(Role.PATIENT) },
    async (request, reply) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid query.", details: parsed.error.flatten() });
      }

      const medications = await prisma.patientMedication.findMany({
        where: {
          patientId: request.user!.id,
          ...(parsed.data.status ? { status: parsed.data.status as MedicationStatus } : {}),
        },
        orderBy: { createdAt: "desc" },
      });

      return reply.send({ medications: medications.map(serializeMedication) });
    },
  );

  app.post(
    "/medications",
    { preHandler: requireRole(Role.PATIENT) },
    async (request, reply) => {
      const parsed = medicationInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
      }

      const { endDate, startDate } = parsed.data;
      if (endDate && endDate < startDate) {
        return reply.code(400).send({
          error: "Invalid input.",
          details: { fieldErrors: { endDate: ["End date must be on or after the start date."] } },
        });
      }

      const medication = await prisma.patientMedication.create({
        data: { ...parsed.data, patientId: request.user!.id },
      });

      return reply.code(201).send({ medication: serializeMedication(medication) });
    },
  );

  // Fixed path registered before the "/:id" param route so it isn't shadowed.
  app.get(
    "/medications/reference",
    { preHandler: requireRole(Role.PATIENT) },
    async (request, reply) => {
      const parsed = referenceQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid query.", details: parsed.error.flatten() });
      }

      const results = await medicationReferenceProvider.search(parsed.data.q);
      return reply.send({ results, isSynthetic: true });
    },
  );

  app.get(
    "/medications/:id",
    { preHandler: requireRole(Role.PATIENT) },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Scoping the lookup to patientId (never findUnique by id alone) is
      // the ownership check — a medication that exists but belongs to
      // another patient looks identical to one that doesn't exist.
      const medication = await prisma.patientMedication.findFirst({
        where: { id, patientId: request.user!.id },
      });

      if (!medication) {
        return reply.code(404).send({ error: "Medication not found." });
      }

      return reply.send({ medication: serializeMedication(medication) });
    },
  );

  app.patch(
    "/medications/:id",
    { preHandler: requireRole(Role.PATIENT) },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.patientMedication.findFirst({
        where: { id, patientId: request.user!.id },
      });
      if (!existing) {
        return reply.code(404).send({ error: "Medication not found." });
      }

      const parsed = medicationUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
      }

      const nextStartDate = parsed.data.startDate ?? existing.startDate;
      const nextEndDate = parsed.data.endDate === undefined ? existing.endDate : parsed.data.endDate;
      if (nextEndDate && nextEndDate < nextStartDate) {
        return reply.code(400).send({
          error: "Invalid input.",
          details: { fieldErrors: { endDate: ["End date must be on or after the start date."] } },
        });
      }

      const medication = await prisma.patientMedication.update({
        where: { id: existing.id },
        data: parsed.data,
      });

      return reply.send({ medication: serializeMedication(medication) });
    },
  );

  app.post(
    "/medications/:id/archive",
    { preHandler: requireRole(Role.PATIENT) },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.patientMedication.findFirst({
        where: { id, patientId: request.user!.id },
      });
      if (!existing) {
        return reply.code(404).send({ error: "Medication not found." });
      }

      const medication = await prisma.patientMedication.update({
        where: { id: existing.id },
        data: { status: MedicationStatus.INACTIVE, archivedAt: new Date() },
      });

      return reply.send({ medication: serializeMedication(medication) });
    },
  );
}

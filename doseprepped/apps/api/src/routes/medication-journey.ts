import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  prisma,
  Role,
  MedicationStatus,
  AdherenceStatus,
  CheckInResponse,
  AnalyticsEventType,
  type MedicationAdherenceEvent,
  type MedicationCheckIn,
} from "@doseprepped/db";
import { requireRole } from "../lib/auth.js";
import { computeAdherenceSummary } from "../lib/adherence.js";
import { buildMedicationTimeline } from "../lib/timeline.js";
import { emitAnalyticsEvent } from "../lib/analytics.js";

const ADHERENCE_STATUSES = Object.values(AdherenceStatus) as [AdherenceStatus, ...AdherenceStatus[]];
const CHECK_IN_RESPONSES = Object.values(CheckInResponse) as [CheckInResponse, ...CheckInResponse[]];

const createAdherenceEventSchema = z.object({
  status: z.enum(ADHERENCE_STATUSES, "A status is required."),
  scheduledAt: z.coerce.date().default(() => new Date()),
});

const createCheckInSchema = z.object({
  response: z.enum(CHECK_IN_RESPONSES, "A response is required."),
  notes: z.string().trim().max(2000).optional(),
});

function serializeAdherenceEvent(event: MedicationAdherenceEvent) {
  return {
    id: event.id,
    medicationId: event.medicationId,
    scheduledAt: event.scheduledAt.toISOString(),
    recordedAt: event.recordedAt.toISOString(),
    status: event.status,
  };
}

function serializeCheckIn(checkIn: MedicationCheckIn) {
  return {
    id: checkIn.id,
    medicationId: checkIn.medicationId,
    response: checkIn.response,
    notes: checkIn.notes,
    createdAt: checkIn.createdAt.toISOString(),
  };
}

/**
 * M5.2 — medication schedule/adherence/check-in/timeline foundation. See
 * docs/doseprepped/ARCHITECTURE.md "M5.2 — Medication Journey & Adherence
 * Foundation". Every route here follows the exact ownership-scoping
 * pattern already used by apps/api/src/routes/medications.ts: a medication
 * that exists but belongs to another patient is 404, identical to
 * GET /medications/:id — there is no route here, or anywhere, that
 * resolves a medication/event/check-in without the authenticated
 * patient's own id in the WHERE clause.
 */
export async function medicationJourneyRoutes(app: FastifyInstance) {
  app.post(
    "/medications/:id/adherence-events",
    { preHandler: requireRole(Role.PATIENT) },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const medication = await prisma.patientMedication.findFirst({
        where: { id, patientId: request.user!.id },
      });
      if (!medication) {
        return reply.code(404).send({ error: "Medication not found." });
      }
      // Recording a *new* dose only makes sense for a medication the
      // patient is currently taking — reading history is unaffected by
      // archive status (see the GET route below).
      if (medication.status !== MedicationStatus.ACTIVE) {
        return reply.code(409).send({ error: "This medication is inactive and can't record new doses." });
      }

      const parsed = createAdherenceEventSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
      }

      const event = await prisma.medicationAdherenceEvent.create({
        data: {
          patientId: request.user!.id,
          medicationId: medication.id,
          scheduledAt: parsed.data.scheduledAt,
          status: parsed.data.status,
        },
      });

      await emitAnalyticsEvent(
        {
          eventType: AnalyticsEventType.MEDICATION_ADHERENCE_RECORDED,
          patientId: request.user!.id,
          medicationId: medication.id,
          metadata: { status: event.status },
        },
        request.log,
      );

      return reply.code(201).send({ event: serializeAdherenceEvent(event) });
    },
  );

  app.get(
    "/medications/:id/adherence-events",
    { preHandler: requireRole(Role.PATIENT) },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const medication = await prisma.patientMedication.findFirst({
        where: { id, patientId: request.user!.id },
      });
      if (!medication) {
        return reply.code(404).send({ error: "Medication not found." });
      }

      const events = await prisma.medicationAdherenceEvent.findMany({
        where: { medicationId: medication.id, patientId: request.user!.id },
        orderBy: { scheduledAt: "desc" },
      });

      return reply.send({
        events: events.map(serializeAdherenceEvent),
        summary: computeAdherenceSummary(events),
      });
    },
  );

  app.post(
    "/medications/:id/check-ins",
    { preHandler: requireRole(Role.PATIENT) },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const medication = await prisma.patientMedication.findFirst({
        where: { id, patientId: request.user!.id },
      });
      if (!medication) {
        return reply.code(404).send({ error: "Medication not found." });
      }

      const parsed = createCheckInSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
      }

      const checkIn = await prisma.medicationCheckIn.create({
        data: {
          patientId: request.user!.id,
          medicationId: medication.id,
          response: parsed.data.response,
          notes: parsed.data.notes,
        },
      });

      // metadata carries the closed-taxonomy `response` only — never
      // `notes`. See docs/doseprepped/ARCHITECTURE.md "M5.3 — What
      // analytics must never store".
      await emitAnalyticsEvent(
        {
          eventType: AnalyticsEventType.MEDICATION_CHECKIN_COMPLETED,
          patientId: request.user!.id,
          medicationId: medication.id,
          metadata: { response: checkIn.response },
        },
        request.log,
      );

      return reply.code(201).send({ checkIn: serializeCheckIn(checkIn) });
    },
  );

  app.get(
    "/medications/:id/check-ins",
    { preHandler: requireRole(Role.PATIENT) },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const medication = await prisma.patientMedication.findFirst({
        where: { id, patientId: request.user!.id },
      });
      if (!medication) {
        return reply.code(404).send({ error: "Medication not found." });
      }

      const checkIns = await prisma.medicationCheckIn.findMany({
        where: { medicationId: medication.id, patientId: request.user!.id },
        orderBy: { createdAt: "desc" },
      });

      return reply.send({ checkIns: checkIns.map(serializeCheckIn) });
    },
  );

  app.get(
    "/medications/:id/timeline",
    { preHandler: requireRole(Role.PATIENT) },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const medication = await prisma.patientMedication.findFirst({
        where: { id, patientId: request.user!.id },
      });
      if (!medication) {
        return reply.code(404).send({ error: "Medication not found." });
      }

      const [adherenceEvents, checkIns, questions] = await Promise.all([
        prisma.medicationAdherenceEvent.findMany({
          where: { medicationId: medication.id, patientId: request.user!.id },
        }),
        prisma.medicationCheckIn.findMany({
          where: { medicationId: medication.id, patientId: request.user!.id },
        }),
        prisma.medicationQuestion.findMany({
          where: { medicationId: medication.id, patientId: request.user!.id },
          select: { id: true, createdAt: true, pharmacistRespondedAt: true, escalatedAt: true },
        }),
      ]);

      const timeline = buildMedicationTimeline({
        medication: {
          name: medication.name,
          startDate: medication.startDate,
          archivedAt: medication.archivedAt,
        },
        adherenceEvents,
        checkIns,
        questions,
      });

      return reply.send({
        timeline: timeline.map((entry) => ({ ...entry, occurredAt: entry.occurredAt.toISOString() })),
      });
    },
  );
}

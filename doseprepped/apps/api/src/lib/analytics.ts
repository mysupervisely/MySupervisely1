import type { FastifyBaseLogger } from "fastify";
import { prisma, AnalyticsEventType } from "@doseprepped/db";

/**
 * Narrow, non-free-text metadata only — see
 * docs/doseprepped/ARCHITECTURE.md "M5.3 — What analytics must never
 * store". Never question text, AI response text, pharmacist response
 * text, check-in notes, passwords, or tokens.
 */
export type AnalyticsMetadata = Record<string, string | number | boolean | null>;

export interface EmitAnalyticsEventInput {
  eventType: AnalyticsEventType;
  patientId?: string;
  pharmacistId?: string;
  questionId?: string;
  medicationId?: string;
  metadata?: AnalyticsMetadata;
}

/**
 * The one function every analytics event in this codebase is emitted
 * through — see docs/doseprepped/ARCHITECTURE.md "M5.3 — Analytics event
 * architecture". `eventType` is a closed Prisma enum
 * (`AnalyticsEventType`), so emitting an event type that isn't part of
 * the documented taxonomy is a compile-time error, not something a
 * report can silently miss.
 *
 * Fire-and-forget by design: a failure here is logged and swallowed,
 * never thrown. Analytics must never turn a successful patient/pharmacist
 * action into a failed HTTP response, and a transient analytics-write
 * failure must never surface to the user. This is also why
 * apps/api/src/lib/analytics-report.ts computes headline funnel numbers
 * from the source-of-truth domain tables wherever one exists, rather than
 * solely from this event log.
 */
export async function emitAnalyticsEvent(
  input: EmitAnalyticsEventInput,
  logger?: FastifyBaseLogger,
): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: {
        eventType: input.eventType,
        patientId: input.patientId,
        pharmacistId: input.pharmacistId,
        questionId: input.questionId,
        medicationId: input.medicationId,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (err) {
    if (logger) {
      logger.error({ err, eventType: input.eventType }, "Failed to record analytics event");
    } else {
      // No request-scoped logger available at this call site.
      console.error("Failed to record analytics event", input.eventType, err);
    }
  }
}

export { AnalyticsEventType };

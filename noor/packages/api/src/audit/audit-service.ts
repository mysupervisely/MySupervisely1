// Audit logging foundation — docs/noor/ARCHITECTURE.md §J and the M1
// implementation requirement: "Audit all access to sensitive clinical
// resources, not merely mutations." Every route that reads or writes a
// sensitive resource (auth events, a clinician viewing a patient, any
// admin action on users/care-relationships/the audit log itself) calls
// recordAuditEvent — see routes/*.ts for call sites.

import type { FastifyRequest } from "fastify";
import { prisma } from "@noor/db";
import type { Prisma } from "@noor/db";
import type { AuditActionValue } from "./actions.js";

// Best-effort, defense-in-depth guard: reject metadata that looks like it
// might carry free-text clinical content rather than structured, non-PHI
// facts (ids, counts, statuses). This is NOT a substitute for callers
// choosing safe metadata deliberately — see docs/noor/ARCHITECTURE.md §F —
// but it turns an accidental `metadata: { note: patientText }` into a
// loud failure in dev/test instead of a silent PHI leak into the audit
// table.
const SUSPICIOUS_METADATA_KEYS = new Set([
  "text",
  "body",
  "note",
  "notes",
  "response",
  "responses",
  "answer",
  "answers",
  "message",
  "content",
  "reason",
  "diagnosis",
  "symptom",
  "symptoms",
]);

export function assertSafeMetadata(metadata: Record<string, unknown>) {
  for (const key of Object.keys(metadata)) {
    if (SUSPICIOUS_METADATA_KEYS.has(key.toLowerCase())) {
      throw new Error(
        `Refusing to write audit metadata key "${key}" — it looks like it may carry free-text/clinical ` +
          "content. Audit events must record that a resource was accessed, never what it said. See " +
          "docs/noor/ARCHITECTURE.md §F.",
      );
    }
  }
}

export interface RecordAuditEventParams {
  request: FastifyRequest;
  /** Explicit actor override for cases with no session (e.g. a failed
   * login attempt has no authenticated user yet). Defaults to
   * request.sessionUser. */
  actorUserId?: string | null;
  actorRole?: string | null;
  action: AuditActionValue;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export async function recordAuditEvent(params: RecordAuditEventParams): Promise<void> {
  const metadata = params.metadata ?? {};
  assertSafeMetadata(metadata);

  const actorUserId = params.actorUserId !== undefined ? params.actorUserId : (params.request.sessionUser?.id ?? null);
  const actorRole =
    params.actorRole !== undefined ? params.actorRole : (params.request.sessionUser?.roles.join(",") ?? null);

  await prisma.auditEvent.create({
    data: {
      actorUserId,
      actorRole,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: metadata as Prisma.InputJsonValue,
      ipAddress: params.request.ip ?? null,
      userAgent: params.request.headers["user-agent"] ?? null,
    },
  });
}

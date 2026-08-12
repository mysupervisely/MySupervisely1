import type { FastifyInstance } from "fastify";
import { prisma, CheckInStatus, CheckInSafetyStatus } from "@noor/db";
import type { CheckInQuestion } from "@noor/db";
import { checkInAnswersSchema } from "@noor/types";
import { requireRole } from "../rbac/policy.js";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { recordAuditEvent } from "../audit/audit-service.js";
import { AuditAction } from "../audit/actions.js";
import { createSafetyPolicyProvider } from "@noor/safety-policy";
import { env } from "../config/env.js";
import { serializeQuestion, serializeDetail, serializeSummary, toSafetyInput } from "../checkins/serialize.js";

const safetyPolicy = createSafetyPolicyProvider(env.SAFETY_POLICY_PROVIDER);

const HISTORY_STATUSES = [CheckInStatus.SUBMITTED, CheckInStatus.REVIEWED];

async function getOwnCheckInOrThrow(patientId: string, checkInId: string) {
  // Ownership: 404 (not 403) for a check-in that exists but isn't this
  // patient's — never confirms another patient's check-in even exists
  // (brief §5: "a patient must NOT be able to access another patient's
  // check-in").
  const checkIn = await prisma.checkIn.findFirst({ where: { id: checkInId, patientId } });
  if (!checkIn) throw new NotFoundError("Check-in not found.");
  return checkIn;
}

interface ValidatedAnswer {
  question: CheckInQuestion;
  valueNumeric: number | null;
  valueOptionKey: string | null;
  valueOptionLabelSnapshot: string | null;
  valueText: string | null;
}

/** Validates one answer value against the LIVE CheckInQuestion definition
 * — this is what makes validation data-driven rather than a hardcoded
 * per-question zod schema: adding an 8th question doesn't require a code
 * change here, only a new seeded row (brief §3). Throws ValidationError on
 * any mismatch. */
function validateAnswer(question: CheckInQuestion, value: number | string): ValidatedAnswer {
  if (question.responseType === "SCALE_1_10") {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10) {
      throw new ValidationError(`"${question.key}" requires an integer response from 1 to 10.`);
    }
    return { question, valueNumeric: value, valueOptionKey: null, valueOptionLabelSnapshot: null, valueText: null };
  }

  if (question.responseType === "SINGLE_SELECT") {
    if (typeof value !== "string") {
      throw new ValidationError(`"${question.key}" requires selecting one of its defined options.`);
    }
    const options = (question.options as { key: string; label: string }[] | null) ?? [];
    const match = options.find((o) => o.key === value);
    if (!match) {
      throw new ValidationError(`"${value}" is not a valid option for "${question.key}".`);
    }
    return {
      question,
      valueNumeric: null,
      valueOptionKey: match.key,
      valueOptionLabelSnapshot: match.label,
      valueText: null,
    };
  }

  // FREE_TEXT
  if (typeof value !== "string") {
    throw new ValidationError(`"${question.key}" requires a text response.`);
  }
  return { question, valueNumeric: null, valueOptionKey: null, valueOptionLabelSnapshot: null, valueText: value };
}

export async function checkInRoutes(app: FastifyInstance) {
  // Data-driven: the frontend wizard renders whatever this returns, with
  // no per-question JSX — see brief §3 "Questions should be data-driven
  // rather than hard-coded into frontend components."
  app.get("/check-ins/questions", async (request) => {
    requireRole(request, "PATIENT");
    const questions = await prisma.checkInQuestion.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
    });
    return questions.map(serializeQuestion);
  });

  // Get-or-create the active draft (brief §7: "Prefer one active draft per
  // patient"). Idempotent — calling this repeatedly never creates a
  // second draft while one is already in progress. (A small, documented
  // race-condition risk under true concurrent double-submission remains —
  // see docs/noor/M3-IMPLEMENTATION.md "Known limitations.")
  app.post("/check-ins", async (request, reply) => {
    const user = requireRole(request, "PATIENT");
    if (!user.patientId) throw new NotFoundError("No patient record for this account.");

    const existing = await prisma.checkIn.findFirst({
      where: { patientId: user.patientId, status: CheckInStatus.DRAFT },
      include: { responses: true },
    });
    if (existing) {
      reply.code(200);
      return serializeDetail(existing, existing.responses);
    }

    const careRelationship = await prisma.careRelationship.findFirst({
      where: { patientId: user.patientId, status: "ACTIVE" },
    });

    const created = await prisma.checkIn.create({
      data: {
        patientId: user.patientId,
        careRelationshipId: careRelationship?.id ?? null,
        status: CheckInStatus.DRAFT,
      },
    });

    await recordAuditEvent({
      request,
      action: AuditAction.CHECK_IN_CREATED,
      entityType: "check_in",
      entityId: created.id,
    });

    reply.code(201);
    return serializeDetail(created, []);
  });

  app.get("/check-ins/active-draft", async (request) => {
    const user = requireRole(request, "PATIENT");
    if (!user.patientId) throw new NotFoundError("No patient record for this account.");

    const draft = await prisma.checkIn.findFirst({
      where: { patientId: user.patientId, status: CheckInStatus.DRAFT },
      include: { responses: true },
    });
    if (!draft) throw new NotFoundError("No check-in in progress.");
    // Not audited — an in-progress draft is the patient actively editing
    // their own scratch data, not a "read" of finished clinical content;
    // this endpoint is polled on every wizard screen load and auditing it
    // would just be noise. Submitted/reviewed reads ARE audited below.
    return serializeDetail(draft, draft.responses);
  });

  app.patch<{ Params: { id: string } }>("/check-ins/:id/responses", async (request) => {
    const user = requireRole(request, "PATIENT");
    if (!user.patientId) throw new NotFoundError("No patient record for this account.");
    const checkIn = await getOwnCheckInOrThrow(user.patientId, request.params.id);

    if (checkIn.status !== CheckInStatus.DRAFT) {
      throw new ConflictError("This check-in has already been submitted and can no longer be edited.");
    }

    const parsed = checkInAnswersSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid check-in response.");

    const keys = Object.keys(parsed.data);
    const questions = await prisma.checkInQuestion.findMany({ where: { key: { in: keys }, isActive: true } });
    const questionByKey = new Map(questions.map((q) => [q.key, q]));

    // Validate every answer up front — nothing is written until every key
    // in this request is known-good, so a request that's invalid on its
    // last key doesn't partially save the earlier ones.
    const validated: ValidatedAnswer[] = keys.map((key) => {
      const question = questionByKey.get(key);
      if (!question) throw new ValidationError(`"${key}" is not a recognized check-in question.`);
      return validateAnswer(question, parsed.data[key]!);
    });

    await prisma.$transaction(
      validated.map((answer) =>
        prisma.checkInResponse.upsert({
          where: { checkInId_questionId: { checkInId: checkIn.id, questionId: answer.question.id } },
          create: {
            checkInId: checkIn.id,
            questionId: answer.question.id,
            questionKeySnapshot: answer.question.key,
            questionPromptSnapshot: answer.question.promptText,
            responseTypeSnapshot: answer.question.responseType,
            valueNumeric: answer.valueNumeric,
            valueOptionKey: answer.valueOptionKey,
            valueOptionLabelSnapshot: answer.valueOptionLabelSnapshot,
            valueText: answer.valueText,
          },
          update: {
            questionPromptSnapshot: answer.question.promptText,
            responseTypeSnapshot: answer.question.responseType,
            valueNumeric: answer.valueNumeric,
            valueOptionKey: answer.valueOptionKey,
            valueOptionLabelSnapshot: answer.valueOptionLabelSnapshot,
            valueText: answer.valueText,
          },
        }),
      ),
    );

    await recordAuditEvent({
      request,
      action: AuditAction.CHECK_IN_RESPONSES_SAVED,
      entityType: "check_in",
      entityId: checkIn.id,
      metadata: { fields: keys },
    });

    const updated = await prisma.checkIn.findUniqueOrThrow({
      where: { id: checkIn.id },
      include: { responses: true },
    });
    return serializeDetail(updated, updated.responses);
  });

  app.post<{ Params: { id: string } }>("/check-ins/:id/submit", async (request) => {
    const user = requireRole(request, "PATIENT");
    if (!user.patientId) throw new NotFoundError("No patient record for this account.");
    const checkIn = await getOwnCheckInOrThrow(user.patientId, request.params.id);

    if (checkIn.status !== CheckInStatus.DRAFT) {
      throw new ConflictError("This check-in has already been submitted.");
    }

    const [responses, requiredQuestions] = await Promise.all([
      prisma.checkInResponse.findMany({ where: { checkInId: checkIn.id } }),
      prisma.checkInQuestion.findMany({ where: { isActive: true, isRequired: true } }),
    ]);

    const answeredKeys = new Set(responses.map((r) => r.questionKeySnapshot));
    const missing = requiredQuestions.filter((q) => !answeredKeys.has(q.key)).map((q) => q.key);
    if (missing.length > 0) {
      throw new ValidationError(`This check-in is incomplete. Missing: ${missing.join(", ")}.`);
    }

    const safetyResult = safetyPolicy.evaluate(toSafetyInput(responses));

    const submitted = await prisma.checkIn.update({
      where: { id: checkIn.id },
      data: {
        status: CheckInStatus.SUBMITTED,
        submittedAt: new Date(),
        safetyStatus: safetyResult.flagged ? CheckInSafetyStatus.FLAGGED : CheckInSafetyStatus.NONE,
      },
      include: { responses: true },
    });

    await recordAuditEvent({
      request,
      action: AuditAction.CHECK_IN_SUBMITTED,
      entityType: "check_in",
      entityId: submitted.id,
    });

    if (safetyResult.flagged) {
      // Internal classification only — never returned to the patient (the
      // response below is identical regardless of safetyResult). See
      // packages/safety-policy for why this is a placeholder, not a
      // clinical protocol.
      await recordAuditEvent({
        request,
        action: AuditAction.SAFETY_WORKFLOW_TRIGGERED,
        entityType: "check_in",
        entityId: submitted.id,
        metadata: { signalIds: safetyResult.signals.map((s) => s.id) },
      });
    }

    return serializeDetail(submitted, submitted.responses);
  });

  app.post<{ Params: { id: string } }>("/check-ins/:id/abandon", async (request) => {
    const user = requireRole(request, "PATIENT");
    if (!user.patientId) throw new NotFoundError("No patient record for this account.");
    const checkIn = await getOwnCheckInOrThrow(user.patientId, request.params.id);

    if (checkIn.status !== CheckInStatus.DRAFT) {
      throw new ConflictError("Only a draft check-in can be abandoned.");
    }

    const archived = await prisma.checkIn.update({
      where: { id: checkIn.id },
      data: { status: CheckInStatus.ARCHIVED, archivedAt: new Date() },
    });

    await recordAuditEvent({
      request,
      action: AuditAction.CHECK_IN_ABANDONED,
      entityType: "check_in",
      entityId: archived.id,
    });

    return { id: archived.id, status: archived.status };
  });

  app.get("/check-ins", async (request) => {
    const user = requireRole(request, "PATIENT");
    if (!user.patientId) throw new NotFoundError("No patient record for this account.");

    const checkIns = await prisma.checkIn.findMany({
      where: { patientId: user.patientId, status: { in: HISTORY_STATUSES } },
      include: { responses: true },
      orderBy: { submittedAt: "desc" },
    });

    await recordAuditEvent({
      request,
      action: AuditAction.CHECK_IN_HISTORY_LIST_READ,
      entityType: "check_in",
      entityId: "list",
      metadata: { count: checkIns.length },
    });

    return checkIns.map((c) => serializeSummary(c, c.responses));
  });

  app.get<{ Params: { id: string } }>("/check-ins/:id", async (request) => {
    const user = requireRole(request, "PATIENT");
    if (!user.patientId) throw new NotFoundError("No patient record for this account.");
    const checkIn = await getOwnCheckInOrThrow(user.patientId, request.params.id);

    const responses = await prisma.checkInResponse.findMany({ where: { checkInId: checkIn.id } });

    if (checkIn.status !== CheckInStatus.DRAFT) {
      await recordAuditEvent({
        request,
        action: AuditAction.CHECK_IN_SELF_READ,
        entityType: "check_in",
        entityId: checkIn.id,
      });
    }

    return serializeDetail(checkIn, responses);
  });
}

// Idempotent, environment-agnostic setup that must run in every
// environment including production — distinct from
// packages/db/prisma/seed.ts, which creates synthetic dev/test accounts
// and must NEVER run against a production database. The four roles here
// are fixed application configuration (docs/noor/ARCHITECTURE.md §E), not
// patient/clinician data, so seeding them on every boot is safe.

import { prisma, RoleName } from "@noor/db";
import type { Prisma } from "@noor/db";
import { CHECK_IN_QUESTION_SEEDS } from "../checkins/question-definitions.js";

export async function ensureRolesSeeded(): Promise<void> {
  await Promise.all(
    ([RoleName.PATIENT, RoleName.CLINICIAN, RoleName.ADMIN, RoleName.SUPER_ADMIN] as const).map((name) =>
      prisma.role.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );
}

/// The Noor Check-In's 7 questions (docs/noor/M3-IMPLEMENTATION.md §2) are
/// fixed application configuration, exactly like Role — not synthetic
/// patient data — so they're seeded here (run in every environment,
/// including production, at API boot) rather than in
/// packages/db/prisma/seed.ts, which is dev/test-only. Upserting by `key`
/// keeps this idempotent and lets a question's prompt/options/order be
/// updated in code and re-applied without touching historical
/// CheckInResponse rows (which snapshot their own copy of the wording).
export async function ensureCheckInQuestionsSeeded(): Promise<void> {
  await Promise.all(
    CHECK_IN_QUESTION_SEEDS.map((question) =>
      prisma.checkInQuestion.upsert({
        where: { key: question.key },
        update: {
          promptText: question.promptText,
          responseType: question.responseType,
          options: (question.options as unknown as Prisma.InputJsonValue | undefined) ?? undefined,
          isRequired: question.isRequired,
          displayOrder: question.displayOrder,
          isActive: true,
        },
        create: {
          key: question.key,
          promptText: question.promptText,
          responseType: question.responseType,
          options: (question.options as unknown as Prisma.InputJsonValue | undefined) ?? undefined,
          isRequired: question.isRequired,
          displayOrder: question.displayOrder,
        },
      }),
    ),
  );
}

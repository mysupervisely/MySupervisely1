// Idempotent, environment-agnostic setup that must run in every
// environment including production — distinct from
// packages/db/prisma/seed.ts, which creates synthetic dev/test accounts
// and must NEVER run against a production database. The four roles here
// are fixed application configuration (docs/noor/ARCHITECTURE.md §E), not
// patient/clinician data, so seeding them on every boot is safe.

import { prisma, RoleName } from "@noor/db";

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

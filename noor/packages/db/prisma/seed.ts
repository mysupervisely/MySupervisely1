// Development/test seed data ONLY. Every value below is synthetic and
// invented for local development — never real patient, clinician, or
// account information. Per the project's dev rules ("never use real
// patient information during development," "keep development/test data
// separate from production"), this script must never be pointed at a
// database that could plausibly hold real data.

import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  PrismaClient,
  RoleName,
  ClinicianStatus,
  CareRelationshipStatus,
  CareType,
  CareFormatPreference,
} from "../generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Obviously-synthetic shared dev password for every seeded account.
// Never used outside local development/test environments.
const DEV_PASSWORD = "NoorDevSeed!2026";

async function main() {
  console.log("Seeding Noor dev database with synthetic data only...");

  const roles = await Promise.all(
    ([RoleName.PATIENT, RoleName.CLINICIAN, RoleName.ADMIN, RoleName.SUPER_ADMIN] as const).map((name) =>
      prisma.role.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );
  const roleByName = new Map(roles.map((r) => [r.name, r]));

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);

  // --- Patient -------------------------------------------------------
  const patientUser = await prisma.user.upsert({
    where: { email: "patient.dev@example.test" },
    update: {},
    create: {
      email: "patient.dev@example.test",
      passwordHash,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      roles: { create: { roleId: roleByName.get(RoleName.PATIENT)!.id } },
      patient: {
        create: {
          profile: {
            create: {
              firstName: "Sam",
              lastName: "Testpatient",
              state: "CA",
              city: "San Francisco",
            },
          },
        },
      },
    },
    include: { patient: true },
  });

  // Onboarding fields are synced here (not inside the upsert's `create`
  // block above) so this is idempotent even if patient.dev@example.test
  // already existed from an earlier seed run — the `create` block only
  // runs on first creation, but a developer re-running `pnpm db:seed`
  // should always see a fully onboarded seed account.
  if (patientUser.patient) {
    await prisma.patientProfile.update({
      where: { patientId: patientUser.patient.id },
      data: {
        reasonForSeekingCare: "Feeling stressed about work and looking for someone to talk to.",
        careType: CareType.INDIVIDUAL_THERAPY,
        careFormatPreference: CareFormatPreference.VIDEO,
        onboardingCompletedAt: new Date(),
      },
    });
  }

  // --- Clinician -------------------------------------------------------
  const clinicianUser = await prisma.user.upsert({
    where: { email: "clinician.dev@example.test" },
    update: {},
    create: {
      email: "clinician.dev@example.test",
      passwordHash,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      mfaEnabled: true,
      roles: { create: { roleId: roleByName.get(RoleName.CLINICIAN)!.id } },
      clinician: {
        create: {
          status: ClinicianStatus.ACTIVE,
          acceptingNewPatients: true,
          profile: {
            create: {
              displayName: "Dr. Jordan Testclinician",
              credentialsDisplay: "LCSW (synthetic/dev credential)",
              bio: "Seed-only clinician account for local development.",
            },
          },
        },
      },
    },
    include: { clinician: true },
  });

  // --- Admin -------------------------------------------------------
  await prisma.user.upsert({
    where: { email: "admin.dev@example.test" },
    update: {},
    create: {
      email: "admin.dev@example.test",
      passwordHash,
      displayName: "Dev Admin",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      mfaEnabled: true,
      roles: { create: { roleId: roleByName.get(RoleName.ADMIN)!.id } },
    },
  });

  // --- Super Admin -------------------------------------------------------
  await prisma.user.upsert({
    where: { email: "superadmin.dev@example.test" },
    update: {},
    create: {
      email: "superadmin.dev@example.test",
      passwordHash,
      displayName: "Dev Super Admin",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      mfaEnabled: true,
      roles: { create: { roleId: roleByName.get(RoleName.SUPER_ADMIN)!.id } },
    },
  });

  // --- Care relationship linking the seed patient and clinician -----------
  const patientId = patientUser.patient?.id;
  const clinicianId = clinicianUser.clinician?.id;
  if (patientId && clinicianId) {
    const existing = await prisma.careRelationship.findFirst({
      where: { patientId, clinicianId },
    });
    if (!existing) {
      await prisma.careRelationship.create({
        data: {
          patientId,
          clinicianId,
          status: CareRelationshipStatus.ACTIVE,
          startedAt: new Date(),
        },
      });
    }
  }

  console.log("Seed complete.");
  console.log(`  All seeded accounts share the dev-only password: ${DEV_PASSWORD}`);
  console.log("  patient.dev@example.test / clinician.dev@example.test / admin.dev@example.test / superadmin.dev@example.test");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

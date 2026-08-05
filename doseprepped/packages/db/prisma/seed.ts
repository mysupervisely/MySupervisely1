import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  PrismaClient,
  Role,
  PharmacistCredentialStatus,
  AdherenceStatus,
  CheckInResponse,
  QuestionCategory,
  QuestionDisposition,
  DispositionSource,
  QuestionStatus,
  OrganizationRole,
} from "../generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

// Synthetic/demo data only — see docs/doseprepped/ARCHITECTURE.md
// "Prototype Data". These are not real patients, and this is not a secret:
// it's a publicly-documented local-dev-only demo password (see README).
const DEMO_PASSWORD = "DosepreppedDemo!1";
const DEMO_START_DATE = new Date("2026-01-15");

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"]! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const patientA = await prisma.user.upsert({
    where: { email: "patient-a@demo.doseprepped.dev" },
    update: {},
    include: { medications: true },
    create: {
      email: "patient-a@demo.doseprepped.dev",
      firstName: "Demo",
      lastName: "Patient A",
      passwordHash,
      role: Role.PATIENT,
      medications: {
        create: [
          {
            name: "Lisinopril",
            strength: "10 mg",
            dosageForm: "Tablet",
            directions: "Take one tablet by mouth once daily.",
            frequency: "Once daily",
            route: "Oral",
            startDate: DEMO_START_DATE,
          },
          {
            name: "Metformin",
            strength: "500 mg",
            dosageForm: "Tablet",
            directions: "Take one tablet by mouth twice daily with food.",
            frequency: "Twice daily",
            route: "Oral",
            startDate: DEMO_START_DATE,
          },
        ],
      },
    },
  });

  const patientB = await prisma.user.upsert({
    where: { email: "patient-b@demo.doseprepped.dev" },
    update: {},
    include: { medications: true },
    create: {
      email: "patient-b@demo.doseprepped.dev",
      firstName: "Demo",
      lastName: "Patient B",
      passwordHash,
      role: Role.PATIENT,
      medications: {
        create: [
          {
            name: "Semaglutide",
            strength: "0.25 mg",
            dosageForm: "Injection",
            directions: "Inject subcutaneously once weekly.",
            frequency: "Once weekly",
            route: "Subcutaneous",
            startDate: DEMO_START_DATE,
          },
          {
            name: "Ondansetron",
            strength: "4 mg",
            dosageForm: "Tablet",
            directions: "Take one tablet by mouth as needed for nausea.",
            frequency: "As needed",
            route: "Oral",
            startDate: DEMO_START_DATE,
          },
        ],
      },
    },
  });

  const pharmacist = await prisma.user.upsert({
    where: { email: "pharmacist@demo.doseprepped.dev" },
    update: {},
    create: {
      email: "pharmacist@demo.doseprepped.dev",
      firstName: "Demo",
      lastName: "Pharmacist",
      passwordHash,
      role: Role.PHARMACIST,
    },
  });

  // A second pharmacist account so the shared queue (M4) has more than one
  // demo reviewer to claim from — synthetic only, no real licensure.
  const pharmacistB = await prisma.user.upsert({
    where: { email: "pharmacist-b@demo.doseprepped.dev" },
    update: {},
    create: {
      email: "pharmacist-b@demo.doseprepped.dev",
      firstName: "Demo",
      lastName: "Pharmacist B",
      passwordHash,
      role: Role.PHARMACIST,
    },
  });

  // Minimal, obviously-synthetic pharmacist profiles (M5.1) — storage only,
  // no verification has actually occurred. See
  // docs/doseprepped/ARCHITECTURE.md "M5.1 — Pharmacist profile foundation".
  await prisma.pharmacistProfile.upsert({
    where: { pharmacistId: pharmacist.id },
    update: {},
    create: {
      pharmacistId: pharmacist.id,
      licenseState: "CA",
      licenseNumber: "DEMO-PH-0001",
      credentialStatus: PharmacistCredentialStatus.UNVERIFIED,
    },
  });
  await prisma.pharmacistProfile.upsert({
    where: { pharmacistId: pharmacistB.id },
    update: {},
    create: {
      pharmacistId: pharmacistB.id,
      licenseState: "NY",
      licenseNumber: "DEMO-PH-0002",
      credentialStatus: PharmacistCredentialStatus.UNVERIFIED,
    },
  });

  // M5.2 demo data — medication journey/adherence foundation. See
  // docs/doseprepped/ARCHITECTURE.md "M5.2 — Medication Journey &
  // Adherence Foundation". All synthetic; kept idempotent (like
  // medicationReference above) by clearing and re-inserting each seed run,
  // since adherence events/check-ins have no natural unique key to upsert
  // against.
  const lisinopril = patientA.medications.find((m) => m.name === "Lisinopril")!;
  const semaglutide = patientB.medications.find((m) => m.name === "Semaglutide")!;

  await prisma.medicationAdherenceEvent.deleteMany({
    where: { patientId: { in: [patientA.id, patientB.id] } },
  });
  await prisma.medicationCheckIn.deleteMany({
    where: { patientId: { in: [patientA.id, patientB.id] } },
  });
  await prisma.medicationQuestion.deleteMany({
    where: { patientId: patientB.id, medicationId: semaglutide.id },
  });

  // Patient A / Lisinopril: a partial history (6 taken, 1 missed → 86%) —
  // demonstrates the ordinary in-progress adherence state.
  await prisma.medicationAdherenceEvent.createMany({
    data: Array.from({ length: 7 }, (_, i) => {
      const scheduledAt = new Date(DEMO_START_DATE.getTime() + i * 24 * 60 * 60 * 1000);
      return {
        patientId: patientA.id,
        medicationId: lisinopril.id,
        scheduledAt,
        recordedAt: scheduledAt,
        status: i === 3 ? AdherenceStatus.MISSED : AdherenceStatus.TAKEN,
      };
    }),
  });
  await prisma.medicationCheckIn.create({
    data: {
      patientId: patientA.id,
      medicationId: lisinopril.id,
      response: CheckInResponse.DOING_WELL,
    },
  });
  // Patient A / Metformin is deliberately left with zero adherence events
  // and no check-in — demonstrates the "no adherence history yet" /
  // "check-in available" empty states.

  // Patient B / Semaglutide: 11 weekly doses, 10 taken + 1 missed →
  // 10/11 = 90.9%, rounds to 91% — the exact figure used as the worked
  // example in the M5.2 milestone brief and in ARCHITECTURE.md.
  await prisma.medicationAdherenceEvent.createMany({
    data: Array.from({ length: 11 }, (_, i) => {
      const scheduledAt = new Date(DEMO_START_DATE.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      return {
        patientId: patientB.id,
        medicationId: semaglutide.id,
        scheduledAt,
        recordedAt: scheduledAt,
        status: i === 5 ? AdherenceStatus.MISSED : AdherenceStatus.TAKEN,
      };
    }),
  });
  await prisma.medicationCheckIn.create({
    data: {
      patientId: patientB.id,
      medicationId: semaglutide.id,
      response: CheckInResponse.HAVING_SOME_ISSUES,
      notes: "Feeling nauseous after my last couple of doses.",
    },
  });

  const semaglutideSnapshot = {
    name: semaglutide.name,
    strength: semaglutide.strength,
    dosageForm: semaglutide.dosageForm,
    directions: semaglutide.directions,
    frequency: semaglutide.frequency,
    route: semaglutide.route,
  };

  // An already-resolved earlier question about the same medication, so a
  // pharmacist claiming the newer question below sees a populated
  // "recent question" in their medication context (M5.2 §5).
  const resolvedAt = new Date(DEMO_START_DATE.getTime() + 35 * 24 * 60 * 60 * 1000);
  await prisma.medicationQuestion.create({
    data: {
      patientId: patientB.id,
      medicationId: semaglutide.id,
      medicationSnapshot: semaglutideSnapshot,
      category: QuestionCategory.SIDE_EFFECT,
      questionText: "I've been having some nausea after my recent Semaglutide doses, is this normal?",
      disposition: QuestionDisposition.PHARMACIST_REVIEW,
      dispositionSource: DispositionSource.DETERMINISTIC,
      dispositionRuleIds: [],
      safetyRuleSetVersion: "seed-synthetic",
      dispositionAssignedAt: resolvedAt,
      status: QuestionStatus.PHARMACIST_RESOLVED,
      pharmacistId: pharmacist.id,
      pharmacistRequestedAt: resolvedAt,
      pharmacistClaimedAt: resolvedAt,
      pharmacistResponse:
        "Mild nausea is common when starting or increasing a GLP-1 medication dose and often improves over a few weeks. Taking your dose with food may help. Let us know if it becomes severe or you can't keep fluids down.",
      pharmacistRespondedAt: resolvedAt,
      resolvedAt,
      createdAt: resolvedAt,
    },
  });

  // A newer, still-unclaimed question about the same medication — visible
  // in the shared pharmacist queue.
  const requestedAt = new Date();
  await prisma.medicationQuestion.create({
    data: {
      patientId: patientB.id,
      medicationId: semaglutide.id,
      medicationSnapshot: semaglutideSnapshot,
      category: QuestionCategory.MISSED_DOSE,
      questionText: "I missed my dose this week — should I take it now or wait for my next scheduled day?",
      disposition: QuestionDisposition.PHARMACIST_REVIEW,
      dispositionSource: DispositionSource.DETERMINISTIC,
      dispositionRuleIds: [],
      safetyRuleSetVersion: "seed-synthetic",
      dispositionAssignedAt: requestedAt,
      status: QuestionStatus.PHARMACIST_REQUESTED,
      pharmacistRequestedAt: requestedAt,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.doseprepped.dev" },
    update: {},
    create: {
      email: "admin@demo.doseprepped.dev",
      firstName: "Demo",
      lastName: "Admin",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  // M5.4 demo data — organization/tenant fixtures. See
  // docs/doseprepped/ARCHITECTURE.md "M5.4 — Organization / Tenant
  // Infrastructure". Two synthetic, non-Wasef-branded organizations, each
  // with an org admin, an org pharmacist, and an org patient, so tenant
  // isolation has something real to demonstrate/test against. `admin`
  // above (Role.ADMIN, zero memberships) remains the one DosePrepped
  // platform admin — no separate platform-admin account is needed.
  //
  // Deliberately: org admins get global Role.PATIENT (inert) rather than
  // Role.ADMIN, because their admin capability comes entirely from
  // OrganizationMembership.role = ORG_ADMIN, not from the platform Role.
  // This is what makes "organization admin ≠ platform admin" a fact of
  // the data model rather than merely of the authorization code.
  //
  // patientA/patientB/pharmacist/pharmacistB/admin above are left
  // completely untouched with zero OrganizationMembership rows — they
  // remain the "DosePrepped Direct" (org-less) pool exactly as in M0–M5.3.
  const orgA = await prisma.organization.upsert({
    where: { slug: "meridian-telehealth-demo" },
    update: {},
    create: { name: "Meridian Telehealth (Demo)", slug: "meridian-telehealth-demo" },
  });
  const orgB = await prisma.organization.upsert({
    where: { slug: "northstar-digital-pharmacy-demo" },
    update: {},
    create: { name: "Northstar Digital Pharmacy (Demo)", slug: "northstar-digital-pharmacy-demo" },
  });

  const orgAAdmin = await prisma.user.upsert({
    where: { email: "orga-admin@demo.doseprepped.dev" },
    update: {},
    create: {
      email: "orga-admin@demo.doseprepped.dev",
      firstName: "Meridian",
      lastName: "Admin",
      passwordHash,
      role: Role.PATIENT,
    },
  });
  const orgAPharmacist = await prisma.user.upsert({
    where: { email: "orga-pharmacist@demo.doseprepped.dev" },
    update: {},
    create: {
      email: "orga-pharmacist@demo.doseprepped.dev",
      firstName: "Meridian",
      lastName: "Pharmacist",
      passwordHash,
      role: Role.PHARMACIST,
    },
  });
  const orgAPatient = await prisma.user.upsert({
    where: { email: "orga-patient@demo.doseprepped.dev" },
    update: {},
    include: { medications: true },
    create: {
      email: "orga-patient@demo.doseprepped.dev",
      firstName: "Meridian",
      lastName: "Patient",
      passwordHash,
      role: Role.PATIENT,
      medications: {
        create: [
          {
            name: "Atorvastatin",
            strength: "20 mg",
            dosageForm: "Tablet",
            directions: "Take one tablet by mouth once daily in the evening.",
            frequency: "Once daily",
            route: "Oral",
            startDate: DEMO_START_DATE,
          },
        ],
      },
    },
  });

  const orgBAdmin = await prisma.user.upsert({
    where: { email: "orgb-admin@demo.doseprepped.dev" },
    update: {},
    create: {
      email: "orgb-admin@demo.doseprepped.dev",
      firstName: "Northstar",
      lastName: "Admin",
      passwordHash,
      role: Role.PATIENT,
    },
  });
  const orgBPharmacist = await prisma.user.upsert({
    where: { email: "orgb-pharmacist@demo.doseprepped.dev" },
    update: {},
    create: {
      email: "orgb-pharmacist@demo.doseprepped.dev",
      firstName: "Northstar",
      lastName: "Pharmacist",
      passwordHash,
      role: Role.PHARMACIST,
    },
  });
  const orgBPatient = await prisma.user.upsert({
    where: { email: "orgb-patient@demo.doseprepped.dev" },
    update: {},
    include: { medications: true },
    create: {
      email: "orgb-patient@demo.doseprepped.dev",
      firstName: "Northstar",
      lastName: "Patient",
      passwordHash,
      role: Role.PATIENT,
      medications: {
        create: [
          {
            name: "Levothyroxine",
            strength: "50 mcg",
            dosageForm: "Tablet",
            directions: "Take one tablet by mouth once daily on an empty stomach.",
            frequency: "Once daily",
            route: "Oral",
            startDate: DEMO_START_DATE,
          },
        ],
      },
    },
  });

  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: orgA.id, userId: orgAAdmin.id } },
    update: {},
    create: { organizationId: orgA.id, userId: orgAAdmin.id, role: OrganizationRole.ORG_ADMIN },
  });
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: orgA.id, userId: orgAPharmacist.id } },
    update: {},
    create: { organizationId: orgA.id, userId: orgAPharmacist.id, role: OrganizationRole.ORG_PHARMACIST },
  });
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: orgA.id, userId: orgAPatient.id } },
    update: {},
    create: { organizationId: orgA.id, userId: orgAPatient.id, role: OrganizationRole.ORG_PATIENT },
  });

  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: orgB.id, userId: orgBAdmin.id } },
    update: {},
    create: { organizationId: orgB.id, userId: orgBAdmin.id, role: OrganizationRole.ORG_ADMIN },
  });
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: orgB.id, userId: orgBPharmacist.id } },
    update: {},
    create: { organizationId: orgB.id, userId: orgBPharmacist.id, role: OrganizationRole.ORG_PHARMACIST },
  });
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: orgB.id, userId: orgBPatient.id } },
    update: {},
    create: { organizationId: orgB.id, userId: orgBPatient.id, role: OrganizationRole.ORG_PATIENT },
  });

  // Synthetic pharmacist profiles for the org pharmacists, matching the
  // pattern used for the org-less pharmacist/pharmacistB above.
  await prisma.pharmacistProfile.upsert({
    where: { pharmacistId: orgAPharmacist.id },
    update: {},
    create: {
      pharmacistId: orgAPharmacist.id,
      licenseState: "TX",
      licenseNumber: "DEMO-PH-1001",
      credentialStatus: PharmacistCredentialStatus.UNVERIFIED,
    },
  });
  await prisma.pharmacistProfile.upsert({
    where: { pharmacistId: orgBPharmacist.id },
    update: {},
    create: {
      pharmacistId: orgBPharmacist.id,
      licenseState: "WA",
      licenseNumber: "DEMO-PH-1002",
      credentialStatus: PharmacistCredentialStatus.UNVERIFIED,
    },
  });

  const orgAAtorvastatin = orgAPatient.medications.find((m) => m.name === "Atorvastatin")!;
  const orgBLevothyroxine = orgBPatient.medications.find((m) => m.name === "Levothyroxine")!;

  // M5.5 demo data — a small amount of adherence/check-in activity per
  // org patient (same shape as the M5.2 patientA/patientB worked example
  // above) so the M5.5 organization dashboard/analytics screens have
  // real, non-zero "Adherence events"/"Check-ins" numbers to render, not
  // just the bare single-question minimum M5.4 seeded. Idempotent via
  // delete+recreate, same pattern as the M5.2 block above.
  await prisma.medicationAdherenceEvent.deleteMany({
    where: { patientId: { in: [orgAPatient.id, orgBPatient.id] } },
  });
  await prisma.medicationCheckIn.deleteMany({
    where: { patientId: { in: [orgAPatient.id, orgBPatient.id] } },
  });

  await prisma.medicationAdherenceEvent.createMany({
    data: Array.from({ length: 5 }, (_, i) => {
      const scheduledAt = new Date(DEMO_START_DATE.getTime() + i * 24 * 60 * 60 * 1000);
      return {
        patientId: orgAPatient.id,
        medicationId: orgAAtorvastatin.id,
        scheduledAt,
        recordedAt: scheduledAt,
        status: i === 2 ? AdherenceStatus.MISSED : AdherenceStatus.TAKEN,
      };
    }),
  });
  await prisma.medicationCheckIn.create({
    data: { patientId: orgAPatient.id, medicationId: orgAAtorvastatin.id, response: CheckInResponse.DOING_WELL },
  });

  await prisma.medicationAdherenceEvent.createMany({
    data: Array.from({ length: 5 }, (_, i) => {
      const scheduledAt = new Date(DEMO_START_DATE.getTime() + i * 24 * 60 * 60 * 1000);
      return {
        patientId: orgBPatient.id,
        medicationId: orgBLevothyroxine.id,
        scheduledAt,
        recordedAt: scheduledAt,
        status: AdherenceStatus.TAKEN,
      };
    }),
  });
  await prisma.medicationCheckIn.create({
    data: {
      patientId: orgBPatient.id,
      medicationId: orgBLevothyroxine.id,
      response: CheckInResponse.HAVING_SOME_ISSUES,
      notes: "Occasionally forget my morning dose.",
    },
  });

  // One unclaimed pharmacist-review question per org patient, so the
  // tenant-isolated pharmacist queue and org-scoped analytics report both
  // have real, distinguishable per-organization data to show. Idempotent
  // via delete+recreate, matching the M5.2 pattern above.
  await prisma.medicationQuestion.deleteMany({
    where: { patientId: { in: [orgAPatient.id, orgBPatient.id] } },
  });

  const orgRequestedAt = new Date();
  await prisma.medicationQuestion.create({
    data: {
      patientId: orgAPatient.id,
      medicationId: orgAAtorvastatin.id,
      medicationSnapshot: {
        name: orgAAtorvastatin.name,
        strength: orgAAtorvastatin.strength,
        dosageForm: orgAAtorvastatin.dosageForm,
        directions: orgAAtorvastatin.directions,
        frequency: orgAAtorvastatin.frequency,
        route: orgAAtorvastatin.route,
      },
      category: QuestionCategory.SIDE_EFFECT,
      questionText: "I've had some muscle soreness since starting Atorvastatin — is that expected?",
      disposition: QuestionDisposition.PHARMACIST_REVIEW,
      dispositionSource: DispositionSource.DETERMINISTIC,
      dispositionRuleIds: [],
      safetyRuleSetVersion: "seed-synthetic",
      dispositionAssignedAt: orgRequestedAt,
      status: QuestionStatus.PHARMACIST_REQUESTED,
      pharmacistRequestedAt: orgRequestedAt,
    },
  });
  await prisma.medicationQuestion.create({
    data: {
      patientId: orgBPatient.id,
      medicationId: orgBLevothyroxine.id,
      medicationSnapshot: {
        name: orgBLevothyroxine.name,
        strength: orgBLevothyroxine.strength,
        dosageForm: orgBLevothyroxine.dosageForm,
        directions: orgBLevothyroxine.directions,
        frequency: orgBLevothyroxine.frequency,
        route: orgBLevothyroxine.route,
      },
      category: QuestionCategory.GENERAL_INFO,
      questionText: "Should I take my Levothyroxine at the same time as my morning coffee?",
      disposition: QuestionDisposition.PHARMACIST_REVIEW,
      dispositionSource: DispositionSource.DETERMINISTIC,
      dispositionRuleIds: [],
      safetyRuleSetVersion: "seed-synthetic",
      dispositionAssignedAt: orgRequestedAt,
      status: QuestionStatus.PHARMACIST_REQUESTED,
      pharmacistRequestedAt: orgRequestedAt,
    },
  });

  // Synthetic medication reference catalog powering the "Add Medication"
  // name autocomplete only — not an authoritative medication database. Kept
  // idempotent by clearing and re-inserting the synthetic set each seed run.
  await prisma.medicationReference.deleteMany({ where: { source: "synthetic_demo" } });
  await prisma.medicationReference.createMany({
    data: [
      { name: "Lisinopril", strength: "10 mg", dosageForm: "Tablet" },
      { name: "Metformin", strength: "500 mg", dosageForm: "Tablet" },
      { name: "Semaglutide", strength: "0.25 mg", dosageForm: "Injection" },
      { name: "Ondansetron", strength: "4 mg", dosageForm: "Tablet" },
      { name: "Atorvastatin", strength: "20 mg", dosageForm: "Tablet" },
      { name: "Amlodipine", strength: "5 mg", dosageForm: "Tablet" },
      { name: "Levothyroxine", strength: "50 mcg", dosageForm: "Tablet" },
      { name: "Metoprolol", strength: "25 mg", dosageForm: "Tablet" },
      { name: "Omeprazole", strength: "20 mg", dosageForm: "Capsule" },
      { name: "Sertraline", strength: "50 mg", dosageForm: "Tablet" },
      { name: "Albuterol", strength: "90 mcg", dosageForm: "Inhaler" },
      { name: "Hydrochlorothiazide", strength: "25 mg", dosageForm: "Tablet" },
    ],
  });

  console.log("Seeded synthetic demo users (password for all: see README):", {
    patientA: patientA.email,
    patientB: patientB.email,
    pharmacist: pharmacist.email,
    pharmacistB: pharmacistB.email,
    admin: admin.email,
    orgA: { name: orgA.name, admin: orgAAdmin.email, pharmacist: orgAPharmacist.email, patient: orgAPatient.email },
    orgB: { name: orgB.name, admin: orgBAdmin.email, pharmacist: orgBPharmacist.email, patient: orgBPatient.email },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

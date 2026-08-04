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

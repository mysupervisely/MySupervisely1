import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "../generated/client/client.js";
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

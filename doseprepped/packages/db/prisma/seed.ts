import "dotenv/config";
import { PrismaClient, Role } from "../generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

// Synthetic/demo data only — see docs/doseprepped/ARCHITECTURE.md
// "Prototype Data". These are not real patients.
const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"]! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const patientA = await prisma.user.upsert({
    where: { email: "patient-a@demo.doseprepped.dev" },
    update: {},
    create: {
      email: "patient-a@demo.doseprepped.dev",
      name: "Demo Patient A",
      role: Role.PATIENT,
      medications: {
        create: [
          {
            name: "Lisinopril",
            strength: "10 mg",
            dosageForm: "Tablet",
            directions: "Take one tablet by mouth once daily.",
          },
          {
            name: "Metformin",
            strength: "500 mg",
            dosageForm: "Tablet",
            directions: "Take one tablet by mouth twice daily with food.",
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
      name: "Demo Patient B",
      role: Role.PATIENT,
      medications: {
        create: [
          {
            name: "Semaglutide",
            strength: "0.25 mg",
            dosageForm: "Injection",
            directions: "Inject subcutaneously once weekly.",
          },
          {
            name: "Ondansetron",
            strength: "4 mg",
            dosageForm: "Tablet",
            directions: "Take one tablet by mouth as needed for nausea.",
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
      name: "Demo Pharmacist",
      role: Role.PHARMACIST,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.doseprepped.dev" },
    update: {},
    create: {
      email: "admin@demo.doseprepped.dev",
      name: "Demo Admin",
      role: Role.ADMIN,
    },
  });

  console.log("Seeded synthetic demo users:", {
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

import { PrismaClient } from "../generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}

export {
  RoleName,
  UserStatus,
  ClinicianStatus,
  CareRelationshipType,
  CareRelationshipStatus,
  CareType,
  CareFormatPreference,
} from "../generated/client/client.js";
export type {
  User,
  Role,
  UserRole,
  Session,
  Patient,
  PatientProfile,
  Clinician,
  ClinicianProfile,
  CareRelationship,
  AuditEvent,
  Prisma,
} from "../generated/client/client.js";

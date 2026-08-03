-- Hand-edited from the Prisma-generated version: adds the new required
-- columns as nullable, backfills the 4 existing synthetic seed rows with
-- reasonable defaults, then enforces NOT NULL — instead of requiring a
-- destructive reset. This preserves the existing medication rows, which is
-- also the behavior M2 wants going forward (archive, don't delete).

-- CreateEnum
CREATE TYPE "MedicationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable (nullable first)
ALTER TABLE "patient_medications" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "frequency" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "route" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "status" "MedicationStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- Backfill existing synthetic seed rows with reasonable defaults.
UPDATE "patient_medications"
SET "frequency" = 'Once daily',
    "route" = 'Oral',
    "startDate" = "createdAt",
    "updatedAt" = "createdAt"
WHERE "frequency" IS NULL;

-- Now that every row has a value, enforce NOT NULL going forward.
ALTER TABLE "patient_medications"
  ALTER COLUMN "frequency" SET NOT NULL,
  ALTER COLUMN "route" SET NOT NULL,
  ALTER COLUMN "startDate" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "medication_reference" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strength" TEXT,
    "dosageForm" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'synthetic_demo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_reference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medication_reference_name_idx" ON "medication_reference"("name");

-- CreateIndex
CREATE INDEX "patient_medications_patientId_idx" ON "patient_medications"("patientId");

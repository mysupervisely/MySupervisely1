-- CreateEnum
CREATE TYPE "CheckInResponseType" AS ENUM ('SCALE_1_10', 'SINGLE_SELECT', 'FREE_TEXT');

-- CreateEnum
CREATE TYPE "CheckInStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CheckInSafetyStatus" AS ENUM ('NONE', 'FLAGGED');

-- CreateTable
CREATE TABLE "check_in_questions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "responseType" "CheckInResponseType" NOT NULL,
    "options" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "check_in_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "careRelationshipId" TEXT,
    "status" "CheckInStatus" NOT NULL DEFAULT 'DRAFT',
    "safetyStatus" "CheckInSafetyStatus" NOT NULL DEFAULT 'NONE',
    "cadenceKey" TEXT NOT NULL DEFAULT 'weekly',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByClinicianId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_responses" (
    "id" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionKeySnapshot" TEXT NOT NULL,
    "questionPromptSnapshot" TEXT NOT NULL,
    "responseTypeSnapshot" "CheckInResponseType" NOT NULL,
    "valueNumeric" INTEGER,
    "valueOptionKey" TEXT,
    "valueOptionLabelSnapshot" TEXT,
    "valueText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "check_in_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "check_in_questions_key_key" ON "check_in_questions"("key");

-- CreateIndex
CREATE INDEX "check_ins_patientId_status_idx" ON "check_ins"("patientId", "status");

-- CreateIndex
CREATE INDEX "check_ins_careRelationshipId_idx" ON "check_ins"("careRelationshipId");

-- CreateIndex
CREATE INDEX "check_ins_status_idx" ON "check_ins"("status");

-- CreateIndex
CREATE INDEX "check_ins_submittedAt_idx" ON "check_ins"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_responses_checkInId_questionId_key" ON "check_in_responses"("checkInId", "questionId");

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_careRelationshipId_fkey" FOREIGN KEY ("careRelationshipId") REFERENCES "care_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_reviewedByClinicianId_fkey" FOREIGN KEY ("reviewedByClinicianId") REFERENCES "clinicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_responses" ADD CONSTRAINT "check_in_responses_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "check_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_responses" ADD CONSTRAINT "check_in_responses_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "check_in_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

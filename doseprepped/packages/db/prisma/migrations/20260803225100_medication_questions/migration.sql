-- CreateEnum
CREATE TYPE "QuestionCategory" AS ENUM ('GENERAL_INFO', 'ADMINISTRATION', 'MISSED_DOSE', 'SIDE_EFFECT', 'DRUG_INTERACTION', 'STORAGE', 'ADHERENCE', 'COST_ACCESS', 'OTHER');

-- CreateEnum
CREATE TYPE "QuestionDisposition" AS ENUM ('ROUTINE', 'PHARMACIST_RECOMMENDED', 'URGENT_CARE_GUIDANCE');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('RECEIVED', 'AI_PROCESSING', 'AI_ANSWERED', 'PHARMACIST_REQUESTED', 'PHARMACIST_IN_PROGRESS', 'WAITING_FOR_PATIENT', 'PHARMACIST_RESOLVED', 'ESCALATED', 'CLOSED');

-- CreateTable
CREATE TABLE "medication_questions" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "medicationSnapshot" JSONB NOT NULL,
    "otherMedicationsSnapshot" JSONB,
    "category" "QuestionCategory" NOT NULL,
    "aiSuggestedCategory" "QuestionCategory",
    "questionText" TEXT NOT NULL,
    "clarifyingExchange" JSONB,
    "disposition" "QuestionDisposition",
    "aiEducationResponse" TEXT,
    "aiEducationGeneratedAt" TIMESTAMP(3),
    "aiModelVersion" TEXT,
    "status" "QuestionStatus" NOT NULL DEFAULT 'RECEIVED',
    "pharmacistId" TEXT,
    "pharmacistRequestedAt" TIMESTAMP(3),
    "pharmacistClaimedAt" TIMESTAMP(3),
    "pharmacistResponse" TEXT,
    "pharmacistRespondedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "escalationReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medication_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medication_questions_patientId_idx" ON "medication_questions"("patientId");

-- CreateIndex
CREATE INDEX "medication_questions_status_idx" ON "medication_questions"("status");

-- CreateIndex
CREATE INDEX "medication_questions_medicationId_idx" ON "medication_questions"("medicationId");

-- AddForeignKey
ALTER TABLE "medication_questions" ADD CONSTRAINT "medication_questions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_questions" ADD CONSTRAINT "medication_questions_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "patient_medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_questions" ADD CONSTRAINT "medication_questions_pharmacistId_fkey" FOREIGN KEY ("pharmacistId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

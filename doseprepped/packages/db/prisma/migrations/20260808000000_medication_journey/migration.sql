-- CreateEnum
CREATE TYPE "AdherenceStatus" AS ENUM ('TAKEN', 'MISSED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CheckInResponse" AS ENUM ('DOING_WELL', 'HAVING_SOME_ISSUES', 'HAVING_SIGNIFICANT_ISSUES', 'HAS_A_QUESTION');

-- CreateTable
CREATE TABLE "medication_adherence_events" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AdherenceStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_adherence_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_check_ins" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "response" "CheckInResponse" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medication_adherence_events_patientId_idx" ON "medication_adherence_events"("patientId");

-- CreateIndex
CREATE INDEX "medication_adherence_events_medicationId_idx" ON "medication_adherence_events"("medicationId");

-- CreateIndex
CREATE INDEX "medication_check_ins_patientId_idx" ON "medication_check_ins"("patientId");

-- CreateIndex
CREATE INDEX "medication_check_ins_medicationId_idx" ON "medication_check_ins"("medicationId");

-- AddForeignKey
ALTER TABLE "medication_adherence_events" ADD CONSTRAINT "medication_adherence_events_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_adherence_events" ADD CONSTRAINT "medication_adherence_events_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "patient_medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_check_ins" ADD CONSTRAINT "medication_check_ins_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_check_ins" ADD CONSTRAINT "medication_check_ins_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "patient_medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;


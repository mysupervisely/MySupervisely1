-- CreateEnum
CREATE TYPE "AnalyticsEventType" AS ENUM ('PATIENT_MEDICATION_VIEWED', 'MEDICATION_ADHERENCE_RECORDED', 'MEDICATION_CHECKIN_COMPLETED', 'QUESTION_SUBMITTED', 'QUESTION_DISPOSITION_ASSIGNED', 'AI_EDUCATION_GENERATED', 'AI_EDUCATION_FAILED', 'PHARMACIST_QUEUE_ENTERED', 'PHARMACIST_CLAIMED', 'PHARMACIST_RESPONDED', 'PHARMACIST_ESCALATED', 'PROVIDER_ESCALATION_CREATED');

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "eventType" "AnalyticsEventType" NOT NULL,
    "patientId" TEXT,
    "pharmacistId" TEXT,
    "questionId" TEXT,
    "medicationId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_events_eventType_createdAt_idx" ON "analytics_events"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_patientId_idx" ON "analytics_events"("patientId");

-- CreateIndex
CREATE INDEX "analytics_events_questionId_idx" ON "analytics_events"("questionId");


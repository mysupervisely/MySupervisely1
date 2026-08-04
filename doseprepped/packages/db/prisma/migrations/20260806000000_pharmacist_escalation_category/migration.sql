-- CreateEnum
CREATE TYPE "EscalationReasonCategory" AS ENUM ('WORSENING_OR_SEVERE_SYMPTOM', 'POSSIBLE_ADVERSE_REACTION', 'MEDICATION_ERROR', 'BEYOND_PHARMACIST_SCOPE', 'PATIENT_REQUESTED_PROVIDER', 'OTHER');

-- AlterTable
ALTER TABLE "medication_questions" ADD COLUMN     "escalationReasonCategory" "EscalationReasonCategory";


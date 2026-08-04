-- CreateEnum
CREATE TYPE "AiResponseStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "medication_questions" ADD COLUMN     "aiPharmacistSummary" JSONB,
ADD COLUMN     "aiPromptVersion" TEXT,
ADD COLUMN     "aiProvider" TEXT,
ADD COLUMN     "aiResponseStatus" "AiResponseStatus",
ADD COLUMN     "aiUsage" JSONB;


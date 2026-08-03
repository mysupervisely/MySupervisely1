-- CreateEnum
CREATE TYPE "DispositionSource" AS ENUM ('DETERMINISTIC', 'AI_ASSISTED');

-- AlterEnum
-- Safe: QuestionDisposition was never populated before this migration
-- (Phase 1 always left it null), so there is no data to lose.
BEGIN;
CREATE TYPE "QuestionDisposition_new" AS ENUM ('GENERAL_EDUCATION', 'PHARMACIST_REVIEW', 'PROVIDER_EVALUATION', 'URGENT_EMERGENCY');
ALTER TABLE "medication_questions" ALTER COLUMN "disposition" TYPE "QuestionDisposition_new" USING ("disposition"::text::"QuestionDisposition_new");
ALTER TYPE "QuestionDisposition" RENAME TO "QuestionDisposition_old";
ALTER TYPE "QuestionDisposition_new" RENAME TO "QuestionDisposition";
DROP TYPE "public"."QuestionDisposition_old";
COMMIT;

-- AlterTable
ALTER TABLE "medication_questions" ADD COLUMN     "dispositionAssignedAt" TIMESTAMP(3),
ADD COLUMN     "dispositionRuleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "dispositionSource" "DispositionSource",
ADD COLUMN     "safetyRuleSetVersion" TEXT;

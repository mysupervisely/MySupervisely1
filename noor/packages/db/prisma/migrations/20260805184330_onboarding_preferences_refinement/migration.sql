/*
  Warnings:

  - You are about to drop the column `reasonForSeekingCare` on the `patient_profiles` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "NoorInterest" AS ENUM ('LOOKING_FOR_THERAPIST', 'ONGOING_SUPPORT', 'ASYNC_SUPPORT_INTEREST', 'EXPLORING_OPTIONS', 'NOT_SURE');

-- AlterEnum
ALTER TYPE "CareFormatPreference" ADD VALUE 'BOTH';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CareType" ADD VALUE 'PSYCHIATRY';
ALTER TYPE "CareType" ADD VALUE 'ASYNC_SUPPORT';

-- AlterTable
ALTER TABLE "patient_profiles" DROP COLUMN "reasonForSeekingCare",
ADD COLUMN     "whatBringsYouToNoor" "NoorInterest";

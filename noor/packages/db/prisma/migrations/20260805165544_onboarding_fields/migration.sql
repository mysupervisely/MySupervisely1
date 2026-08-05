-- CreateEnum
CREATE TYPE "CareType" AS ENUM ('INDIVIDUAL_THERAPY', 'COUPLES_THERAPY', 'FAMILY_THERAPY', 'NOT_SURE');

-- CreateEnum
CREATE TYPE "CareFormatPreference" AS ENUM ('VIDEO', 'ASYNC', 'NOT_SURE');

-- AlterTable
ALTER TABLE "patient_profiles" ADD COLUMN     "careFormatPreference" "CareFormatPreference",
ADD COLUMN     "careType" "CareType",
ADD COLUMN     "reasonForSeekingCare" TEXT;

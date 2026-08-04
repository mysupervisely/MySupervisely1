-- CreateEnum
CREATE TYPE "PharmacistCredentialStatus" AS ENUM ('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "pharmacist_profiles" (
    "id" TEXT NOT NULL,
    "pharmacistId" TEXT NOT NULL,
    "licenseState" TEXT,
    "licenseNumber" TEXT,
    "credentialStatus" "PharmacistCredentialStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacist_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pharmacist_profiles_pharmacistId_key" ON "pharmacist_profiles"("pharmacistId");

-- AddForeignKey
ALTER TABLE "pharmacist_profiles" ADD CONSTRAINT "pharmacist_profiles_pharmacistId_fkey" FOREIGN KEY ("pharmacistId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


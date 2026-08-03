-- DropForeignKey
ALTER TABLE "patient_medications" DROP CONSTRAINT "patient_medications_patientId_fkey";

-- AddForeignKey
ALTER TABLE "patient_medications" ADD CONSTRAINT "patient_medications_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

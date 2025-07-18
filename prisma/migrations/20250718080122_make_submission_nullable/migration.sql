-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_submissionId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "submissionId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

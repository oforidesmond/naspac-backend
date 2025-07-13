-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sigHeight" INTEGER,
ADD COLUMN     "sigWidth" INTEGER,
ADD COLUMN     "signage" TEXT,
ADD COLUMN     "stamp" TEXT,
ADD COLUMN     "stampHeight" INTEGER,
ADD COLUMN     "stampWidth" INTEGER;

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "adminId" INTEGER NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "signedUrl" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

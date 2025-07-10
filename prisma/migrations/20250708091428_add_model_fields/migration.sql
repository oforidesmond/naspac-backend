/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `Submission` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "name" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Submission_userId_key" ON "Submission"("userId");

/*
  Warnings:

  - You are about to drop the column `email` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[staffId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "email",
ADD COLUMN     "staffId" TEXT,
ALTER COLUMN "nssNumber" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_staffId_key" ON "User"("staffId");

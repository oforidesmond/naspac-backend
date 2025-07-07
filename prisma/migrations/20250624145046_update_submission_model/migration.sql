/*
  Warnings:

  - You are about to drop the column `course` on the `Submission` table. All the data in the column will be lost.
  - You are about to drop the column `endorsedLetterUrl` on the `Submission` table. All the data in the column will be lost.
  - You are about to drop the column `school` on the `Submission` table. All the data in the column will be lost.
  - You are about to drop the column `validatedDocsUrl` on the `Submission` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,nssNumber]` on the table `Submission` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `divisionPostedTo` to the `Submission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `email` to the `Submission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `gender` to the `Submission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nssNumber` to the `Submission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phoneNumber` to the `Submission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `placeOfResidence` to the `Submission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `programStudied` to the `Submission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `regionOfSchool` to the `Submission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `universityAttended` to the `Submission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `yearOfNss` to the `Submission` table without a default value. This is not possible if the table is not empty.
  - Made the column `postingLetterUrl` on table `Submission` required. This step will fail if there are existing NULL values in that column.
  - Made the column `appointmentLetterUrl` on table `Submission` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "OnboardingToken" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PasswordResetToken" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Submission" DROP COLUMN "course",
DROP COLUMN "endorsedLetterUrl",
DROP COLUMN "school",
DROP COLUMN "validatedDocsUrl",
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "divisionPostedTo" TEXT NOT NULL,
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "gender" "Gender" NOT NULL,
ADD COLUMN     "nssNumber" TEXT NOT NULL,
ADD COLUMN     "phoneNumber" TEXT NOT NULL,
ADD COLUMN     "placeOfResidence" TEXT NOT NULL,
ADD COLUMN     "programStudied" TEXT NOT NULL,
ADD COLUMN     "regionOfSchool" TEXT NOT NULL,
ADD COLUMN     "universityAttended" TEXT NOT NULL,
ADD COLUMN     "yearOfNss" INTEGER NOT NULL,
ALTER COLUMN "postingLetterUrl" SET NOT NULL,
ALTER COLUMN "appointmentLetterUrl" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Submission_userId_nssNumber_key" ON "Submission"("userId", "nssNumber");

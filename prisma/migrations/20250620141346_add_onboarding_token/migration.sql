-- CreateTable
CREATE TABLE "OnboardingToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "nssNumber" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingToken_token_key" ON "OnboardingToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingToken_nssNumber_key" ON "OnboardingToken"("nssNumber");

-- AddForeignKey
ALTER TABLE "OnboardingToken" ADD CONSTRAINT "OnboardingToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

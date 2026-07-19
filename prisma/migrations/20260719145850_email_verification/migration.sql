-- Email verification + password-reset token slots (SIGNUP.MD §1).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" TIMESTAMP(3),
ADD COLUMN     "resetTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "resetTokenHash" TEXT,
ADD COLUMN     "resetTokenSentAt" TIMESTAMP(3),
ADD COLUMN     "verificationTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "verificationTokenHash" TEXT,
ADD COLUMN     "verificationTokenSentAt" TIMESTAMP(3);

-- Backfill: mark every pre-existing account as verified (SIGNUP.MD §1.3).
-- Without this, the hard gate (§5) would lock out every seeded, imported, and
-- club-registered user the moment it ships. Existing rows predate signup, so
-- their address was already vouched for; stamp verification at account creation.
UPDATE "User" SET "emailVerified" = "createdAt" WHERE "emailVerified" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_verificationTokenHash_key" ON "User"("verificationTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetTokenHash_key" ON "User"("resetTokenHash");

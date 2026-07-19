-- Member invite token slot for bulk-import onboarding (BULKUPLOAD.MD §1).
-- A third never-shared slot alongside verification and reset: an invite sits
-- unopened in an inbox for days, so it lives 7d (TTL enforced in app code), and
-- a separate slot means a real password-reset request and a pending invite can
-- never clobber each other.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "inviteTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "inviteTokenHash" TEXT,
ADD COLUMN     "inviteTokenSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteTokenHash_key" ON "User"("inviteTokenHash");

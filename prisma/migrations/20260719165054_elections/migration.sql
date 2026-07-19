-- CreateEnum
CREATE TYPE "ElectionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CandidacyStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "Election" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ElectionStatus" NOT NULL DEFAULT 'DRAFT',
    "applicationsStartAt" TIMESTAMP(3) NOT NULL,
    "applicationsEndAt" TIMESTAMP(3) NOT NULL,
    "votingStartAt" TIMESTAMP(3) NOT NULL,
    "votingEndAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Election_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidacy" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "status" "CandidacyStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "candidacyId" TEXT NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteReceipt" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Election_clubId_status_idx" ON "Election"("clubId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Position_electionId_title_key" ON "Position"("electionId", "title");

-- CreateIndex
CREATE INDEX "Candidacy_positionId_status_idx" ON "Candidacy"("positionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Candidacy_positionId_membershipId_key" ON "Candidacy"("positionId", "membershipId");

-- CreateIndex
CREATE INDEX "Vote_positionId_candidacyId_idx" ON "Vote"("positionId", "candidacyId");

-- CreateIndex
CREATE INDEX "VoteReceipt_electionId_membershipId_idx" ON "VoteReceipt"("electionId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "VoteReceipt_positionId_membershipId_key" ON "VoteReceipt"("positionId", "membershipId");

-- AddForeignKey
ALTER TABLE "Election" ADD CONSTRAINT "Election_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidacy" ADD CONSTRAINT "Candidacy_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidacy" ADD CONSTRAINT "Candidacy_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_candidacyId_fkey" FOREIGN KEY ("candidacyId") REFERENCES "Candidacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteReceipt" ADD CONSTRAINT "VoteReceipt_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteReceipt" ADD CONSTRAINT "VoteReceipt_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

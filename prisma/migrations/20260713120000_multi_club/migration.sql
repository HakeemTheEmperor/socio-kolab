-- Multi-club support: club slugs, club lifecycle status, platform admins.

-- CreateEnum
CREATE TYPE "ClubStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable. "slug" starts nullable so existing rows can be backfilled below;
-- it is made NOT NULL + UNIQUE once every club has one.
ALTER TABLE "Club"
    ADD COLUMN "slug" TEXT,
    ADD COLUMN "status" "ClubStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "description" TEXT,
    ADD COLUMN "requestedById" TEXT,
    ADD COLUMN "approvedAt" TIMESTAMP(3);

-- Backfill: any club that already exists predates the approval flow, so it is
-- live by definition. Derive its slug from its name (lowercase, non-alphanumeric
-- runs collapsed to hyphens, trimmed to the 30-char limit).
UPDATE "Club"
SET "slug" = rtrim(
        left(
            trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')),
            30
        ),
        '-'
    ),
    "status" = 'ACTIVE',
    "approvedAt" = COALESCE("approvedAt", "createdAt");

-- Names that collapse to nothing (or to fewer than the 3-char minimum) fall back
-- to an id-derived slug.
UPDATE "Club"
SET "slug" = 'club-' || left("id", 8)
WHERE "slug" IS NULL OR length("slug") < 3;

-- Two clubs could have derived the same slug; the unique index below would then
-- fail. Keep the oldest as-is and suffix the rest.
WITH "dupes" AS (
    SELECT "id",
           "slug",
           row_number() OVER (PARTITION BY "slug" ORDER BY "createdAt", "id") AS "rn"
    FROM "Club"
)
UPDATE "Club" AS c
SET "slug" = left(d."slug", 30 - length(d."rn"::text) - 1) || '-' || d."rn"::text
FROM "dupes" AS d
WHERE c."id" = d."id" AND d."rn" > 1;

ALTER TABLE "Club" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

-- CreateIndex
CREATE INDEX "Club_status_idx" ON "Club"("status");

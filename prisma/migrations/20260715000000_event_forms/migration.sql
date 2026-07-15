-- Custom event registration forms (EVENT-FORMS.md §1): per-event form schema +
-- intake toggle, and guest (non-member) registrations with stored responses.
-- Additive only — existing events and attendance rows are untouched.

-- Event: form configuration + intake toggle.
ALTER TABLE "Event"
    ADD COLUMN "formSchema" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "acceptingResponses" BOOLEAN NOT NULL DEFAULT true;

-- Attendance: the single registration record now supports non-members. A row
-- has EITHER membershipId OR (guestName + guestEmail) — enforced in the server
-- action (Postgres can't express the XOR). Existing rows keep their
-- membershipId; formResponses defaults to '{}'.
ALTER TABLE "Attendance"
    ALTER COLUMN "membershipId" DROP NOT NULL,
    ADD COLUMN "guestName" TEXT,
    ADD COLUMN "guestEmail" TEXT,
    ADD COLUMN "formResponses" JSONB NOT NULL DEFAULT '{}';

-- Postgres treats NULLs as distinct in unique indexes, so this dedups guests by
-- (event, email) while leaving member rows (guestEmail NULL) unconstrained. The
-- existing Attendance_eventId_membershipId_key is the mirror for members.
CREATE UNIQUE INDEX "Attendance_eventId_guestEmail_key" ON "Attendance"("eventId", "guestEmail");

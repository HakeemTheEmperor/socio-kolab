"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireClubAccess } from "@/lib/club-context";
import { can } from "@/lib/permissions";
import { eventSchema, rsvpSchema, type EventInput } from "@/lib/validations/events";
import type { Club } from "@/generated/prisma/client";

export type ActionResult = { ok: boolean; error?: string };
export type CreateResult = ActionResult & { id?: string };

/** An event id is only meaningful inside the club it belongs to. */
async function loadEventInClub(club: Club, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.clubId !== club.id) return null;
  return event;
}

export async function createEvent(
  clubSlug: string,
  input: EventInput,
): Promise<CreateResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "event:manage")) return { ok: false, error: "Not authorized." };

  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const event = await prisma.event.create({
    data: {
      clubId: club.id,
      title: parsed.data.title,
      description: parsed.data.description,
      location: parsed.data.location,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
    },
  });
  revalidatePath(`/${clubSlug}/events`);
  return { ok: true, id: event.id };
}

export async function updateEvent(
  clubSlug: string,
  eventId: string,
  input: EventInput,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "event:manage")) return { ok: false, error: "Not authorized." };

  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const event = await loadEventInClub(club, eventId);
  if (!event) return { ok: false, error: "Event not found." };

  await prisma.event.update({
    where: { id: eventId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      location: parsed.data.location,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
    },
  });
  revalidatePath(`/${clubSlug}/events`);
  revalidatePath(`/${clubSlug}/events/${eventId}`);
  return { ok: true };
}

export async function deleteEvent(
  clubSlug: string,
  eventId: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "event:manage")) return { ok: false, error: "Not authorized." };

  const event = await loadEventInClub(club, eventId);
  if (!event) return { ok: false, error: "Event not found." };

  // No DB cascade configured: remove attendance rows first.
  await prisma.$transaction([
    prisma.attendance.deleteMany({ where: { eventId } }),
    prisma.event.delete({ where: { id: eventId } }),
  ]);
  revalidatePath(`/${clubSlug}/events`);
  return { ok: true };
}

export async function rsvp(
  clubSlug: string,
  eventId: string,
  status: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "event:rsvp")) return { ok: false, error: "Not authorized." };

  const parsed = rsvpSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid RSVP." };

  const event = await loadEventInClub(club, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  if (event.startsAt.getTime() < Date.now()) {
    return { ok: false, error: "This event has already started." };
  }

  await prisma.attendance.upsert({
    where: { eventId_membershipId: { eventId, membershipId: me.id } },
    create: { eventId, membershipId: me.id, rsvp: parsed.data },
    update: { rsvp: parsed.data },
  });
  revalidatePath(`/${clubSlug}/events`);
  revalidatePath(`/${clubSlug}/events/${eventId}`);
  return { ok: true };
}

export async function toggleCheckIn(
  clubSlug: string,
  eventId: string,
  membershipId: string,
  checkedIn: boolean,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "event:checkIn")) return { ok: false, error: "Not authorized." };

  const event = await loadEventInClub(club, eventId);
  if (!event) return { ok: false, error: "Event not found." };

  const target = await prisma.membership.findUnique({ where: { id: membershipId } });
  if (!target || target.clubId !== club.id || target.status !== "ACTIVE") {
    return { ok: false, error: "Member not found." };
  }

  await prisma.attendance.upsert({
    where: { eventId_membershipId: { eventId, membershipId } },
    create: {
      eventId,
      membershipId,
      checkedInAt: checkedIn ? new Date() : null,
      checkedInById: checkedIn ? me.id : null,
    },
    update: {
      checkedInAt: checkedIn ? new Date() : null,
      checkedInById: checkedIn ? me.id : null,
    },
  });
  revalidatePath(`/${clubSlug}/events/${eventId}`);
  revalidatePath(`/${clubSlug}/members/${membershipId}`);
  return { ok: true };
}

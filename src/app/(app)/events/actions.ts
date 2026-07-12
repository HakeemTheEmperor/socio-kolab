"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";
import { getCurrentClub } from "@/lib/club";
import { can } from "@/lib/permissions";
import { eventSchema, rsvpSchema, type EventInput } from "@/lib/validations/events";

export type ActionResult = { ok: boolean; error?: string };
export type CreateResult = ActionResult & { id?: string };

async function loadEventInClub(eventId: string) {
  const club = await getCurrentClub();
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.clubId !== club.id) return null;
  return event;
}

export async function createEvent(input: EventInput): Promise<CreateResult> {
  const me = await requireMembership();
  if (!can(me, "event:manage")) return { ok: false, error: "Not authorized." };

  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const club = await getCurrentClub();
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
  revalidatePath("/events");
  return { ok: true, id: event.id };
}

export async function updateEvent(
  eventId: string,
  input: EventInput,
): Promise<ActionResult> {
  const me = await requireMembership();
  if (!can(me, "event:manage")) return { ok: false, error: "Not authorized." };

  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const event = await loadEventInClub(eventId);
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
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  const me = await requireMembership();
  if (!can(me, "event:manage")) return { ok: false, error: "Not authorized." };

  const event = await loadEventInClub(eventId);
  if (!event) return { ok: false, error: "Event not found." };

  // No DB cascade configured: remove attendance rows first.
  await prisma.$transaction([
    prisma.attendance.deleteMany({ where: { eventId } }),
    prisma.event.delete({ where: { id: eventId } }),
  ]);
  revalidatePath("/events");
  return { ok: true };
}

export async function rsvp(eventId: string, status: string): Promise<ActionResult> {
  const me = await requireMembership();
  if (!can(me, "event:rsvp")) return { ok: false, error: "Not authorized." };

  const parsed = rsvpSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid RSVP." };

  const event = await loadEventInClub(eventId);
  if (!event) return { ok: false, error: "Event not found." };
  if (event.startsAt.getTime() < Date.now()) {
    return { ok: false, error: "This event has already started." };
  }

  await prisma.attendance.upsert({
    where: { eventId_membershipId: { eventId, membershipId: me.id } },
    create: { eventId, membershipId: me.id, rsvp: parsed.data },
    update: { rsvp: parsed.data },
  });
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function toggleCheckIn(
  eventId: string,
  membershipId: string,
  checkedIn: boolean,
): Promise<ActionResult> {
  const me = await requireMembership();
  if (!can(me, "event:checkIn")) return { ok: false, error: "Not authorized." };

  const event = await loadEventInClub(eventId);
  if (!event) return { ok: false, error: "Event not found." };

  const club = await getCurrentClub();
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
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/members/${membershipId}`);
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  requireClubAccess,
  findEventInClub,
  findMemberInClub,
} from "@/lib/club-context";
import { can } from "@/lib/permissions";
import { eventSchema, rsvpSchema, type EventInput } from "@/lib/validations/events";

export type ActionResult = { ok: boolean; error?: string };
export type CreateResult = ActionResult & { id?: string };

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
      formSchema: parsed.data.formSchema,
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

  const event = await findEventInClub(club.id, eventId);
  if (!event) return { ok: false, error: "Event not found." };

  await prisma.event.update({
    where: { id: eventId, clubId: club.id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      location: parsed.data.location,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      formSchema: parsed.data.formSchema,
    },
  });
  revalidatePath(`/${clubSlug}/events`);
  revalidatePath(`/${clubSlug}/events/${eventId}`);
  return { ok: true };
}

/**
 * Open or close a form's intake (EVENT-FORMS.md §2.3). Deliberately separate
 * from `updateEvent`: toggling is instant and never touches `formSchema` or any
 * collected responses. This is also the server-side boundary the public submit
 * action re-checks — the register-page banner is only cosmetic.
 */
export async function setEventFormStatusAction(
  clubSlug: string,
  eventId: string,
  accepting: boolean,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "event:manage")) return { ok: false, error: "Not authorized." };

  const event = await findEventInClub(club.id, eventId);
  if (!event) return { ok: false, error: "Event not found." };

  await prisma.event.update({
    where: { id: eventId, clubId: club.id },
    data: { acceptingResponses: accepting },
  });
  revalidatePath(`/${clubSlug}/events/${eventId}`);
  revalidatePath(`/${clubSlug}/events/${eventId}/register`);
  return { ok: true };
}

export async function deleteEvent(
  clubSlug: string,
  eventId: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "event:manage")) return { ok: false, error: "Not authorized." };

  const event = await findEventInClub(club.id, eventId);
  if (!event) return { ok: false, error: "Event not found." };

  // No DB cascade configured: remove attendance rows first.
  await prisma.$transaction([
    prisma.attendance.deleteMany({ where: { eventId } }),
    prisma.event.delete({ where: { id: eventId, clubId: club.id } }),
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

  const event = await findEventInClub(club.id, eventId);
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

  const event = await findEventInClub(club.id, eventId);
  if (!event) return { ok: false, error: "Event not found." };

  const target = await findMemberInClub(club.id, membershipId);
  if (!target || target.status !== "ACTIVE") {
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

/**
 * Check a guest in/out (EVENT-FORMS.md §5.1). Guests have no membership, so they
 * are addressed by their existing Attendance row — a guest can only be checked in
 * if they registered. The `membershipId: null` filter guarantees this never
 * touches a member row, and `eventId` keeps it scoped to this event.
 */
export async function toggleGuestCheckIn(
  clubSlug: string,
  eventId: string,
  attendanceId: string,
  checkedIn: boolean,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "event:checkIn")) return { ok: false, error: "Not authorized." };

  const event = await findEventInClub(club.id, eventId);
  if (!event) return { ok: false, error: "Event not found." };

  const result = await prisma.attendance.updateMany({
    where: { id: attendanceId, eventId, membershipId: null },
    data: {
      checkedInAt: checkedIn ? new Date() : null,
      checkedInById: checkedIn ? me.id : null,
    },
  });
  if (result.count === 0) return { ok: false, error: "Registration not found." };

  revalidatePath(`/${clubSlug}/events/${eventId}`);
  return { ok: true };
}

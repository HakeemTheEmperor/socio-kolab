import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getCurrentClub } from "@/lib/club";
import { requireMembership } from "@/lib/session";
import { formatDateTime, toDateTimeLocal } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EventFormDialog } from "../event-form-dialog";
import { DeleteEventButton } from "../delete-event-button";
import { RsvpButtons } from "../rsvp-buttons";
import { CheckInList, type CheckInMember } from "./check-in-list";

export const metadata: Metadata = { title: "Event — Club Portal" };

const GROUPS: { key: "GOING" | "MAYBE" | "NOT_GOING"; label: string }[] = [
  { key: "GOING", label: "Going" },
  { key: "MAYBE", label: "Maybe" },
  { key: "NOT_GOING", label: "Not going" },
];

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireMembership();
  const isExec = me.role === "EXEC" || me.role === "PRESIDENT";
  const club = await getCurrentClub();

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      attendance: { include: { membership: { include: { user: true } } } },
    },
  });
  if (!event || event.clubId !== club.id) notFound();

  const now = new Date();
  const upcoming = event.startsAt.getTime() >= now.getTime();
  const myRsvp =
    event.attendance.find((a) => a.membershipId === me.id)?.rsvp ?? null;

  // Check-in view (exec): all ACTIVE members, RSVP'd sorted to top.
  let checkInMembers: CheckInMember[] = [];
  if (isExec) {
    const activeMembers = await prisma.membership.findMany({
      where: { clubId: club.id, status: "ACTIVE" },
      include: { user: true },
    });
    const attByMember = new Map(
      event.attendance.map((a) => [a.membershipId, a]),
    );
    checkInMembers = activeMembers
      .map((m) => {
        const a = attByMember.get(m.id);
        return {
          membershipId: m.id,
          name: m.user.name,
          department: m.department,
          rsvp: a?.rsvp ?? null,
          checkedIn: !!a?.checkedInAt,
        };
      })
      .sort((a, b) => {
        const ar = a.rsvp ? 0 : 1;
        const br = b.rsvp ? 0 : 1;
        if (ar !== br) return ar - br;
        return a.name.localeCompare(b.name);
      });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/events"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Events
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{event.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDateTime(event.startsAt)}
            {event.endsAt ? ` – ${formatDateTime(event.endsAt)}` : ""}
            {event.location ? ` · ${event.location}` : ""}
            {!upcoming ? " · Past event" : ""}
          </p>
        </div>
        {isExec ? (
          <div className="flex gap-2">
            <EventFormDialog
              event={{
                id: event.id,
                title: event.title,
                description: event.description,
                location: event.location,
                startsAtLocal: toDateTimeLocal(event.startsAt),
                endsAtLocal: event.endsAt ? toDateTimeLocal(event.endsAt) : "",
              }}
            />
            <DeleteEventButton eventId={event.id} title={event.title} />
          </div>
        ) : null}
      </div>

      {event.description ? (
        <Card>
          <CardContent className="py-4 text-sm whitespace-pre-wrap">
            {event.description}
          </CardContent>
        </Card>
      ) : null}

      {upcoming ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your RSVP</CardTitle>
          </CardHeader>
          <CardContent>
            <RsvpButtons eventId={event.id} current={myRsvp} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">RSVPs</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {GROUPS.map((g) => {
            const list = event.attendance.filter((a) => a.rsvp === g.key);
            return (
              <div key={g.key}>
                <p className="mb-2 text-sm font-medium">
                  {g.label} ({list.length})
                </p>
                {list.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {list.map((a) => (
                      <li key={a.id} className="flex items-center gap-2">
                        <span>{a.membership.user.name}</span>
                        {a.checkedInAt ? (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                          >
                            in
                          </Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {isExec ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Check-in</CardTitle>
            <CardDescription>
              Mark attendance for active members. RSVP&apos;d members are listed
              first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CheckInList eventId={event.id} members={checkInMembers} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

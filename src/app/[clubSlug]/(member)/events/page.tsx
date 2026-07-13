import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireClubAccess } from "@/lib/club-context";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventFormDialog } from "./event-form-dialog";
import { RsvpButtons } from "./rsvp-buttons";

export const metadata: Metadata = { title: "Events — Club Portal" };

type EventWithRsvp = {
  id: string;
  title: string;
  location: string | null;
  startsAt: Date;
  goingCount: number;
  myRsvp: "GOING" | "MAYBE" | "NOT_GOING" | null;
};

function EventCard({
  clubSlug,
  event,
  upcoming,
}: {
  clubSlug: string;
  event: EventWithRsvp;
  upcoming: boolean;
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/${clubSlug}/events/${event.id}`}
            className="font-medium hover:underline"
          >
            {event.title}
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDateTime(event.startsAt)}
            {event.location ? ` · ${event.location}` : ""}
          </p>
        </div>
        <Badge variant="secondary">{event.goingCount} going</Badge>
      </div>
      {upcoming ? (
        <div className="mt-3">
          <RsvpButtons eventId={event.id} current={event.myRsvp} />
        </div>
      ) : null}
    </div>
  );
}

export default async function EventsPage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  const { club, membership: me } = await requireClubAccess(clubSlug);
  const isExec = me.role === "EXEC" || me.role === "PRESIDENT";
  const now = new Date();

  const events = await prisma.event.findMany({
    where: { clubId: club.id },
    orderBy: { startsAt: "asc" },
    include: { attendance: { select: { rsvp: true, membershipId: true } } },
  });

  const mapped: (EventWithRsvp & { startsAtDate: Date })[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    location: e.location,
    startsAt: e.startsAt,
    startsAtDate: e.startsAt,
    goingCount: e.attendance.filter((a) => a.rsvp === "GOING").length,
    myRsvp: e.attendance.find((a) => a.membershipId === me.id)?.rsvp ?? null,
  }));

  const upcoming = mapped.filter((e) => e.startsAtDate.getTime() >= now.getTime());
  const past = mapped
    .filter((e) => e.startsAtDate.getTime() < now.getTime())
    .reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        {isExec ? <EventFormDialog /> : null}
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-3">
          {upcoming.length === 0 ? (
            <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
              No upcoming events.
            </div>
          ) : (
            upcoming.map((e) => (
              <EventCard key={e.id} clubSlug={clubSlug} event={e} upcoming />
            ))
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-3">
          {past.length === 0 ? (
            <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
              No past events.
            </div>
          ) : (
            past.map((e) => (
              <EventCard
                key={e.id}
                clubSlug={clubSlug}
                event={e}
                upcoming={false}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

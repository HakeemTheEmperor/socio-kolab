import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { prisma } from "@/lib/prisma";
import { requireClubAccess } from "@/lib/club-context";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/page-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventFormDialog } from "./event-form-dialog";
import { TopbarActions } from "@/components/app-shell/topbar-actions";
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

/**
 * The loading skeleton is a Suspense boundary *inside* the page, not a
 * route-level `loading.tsx`. A `loading.tsx` here would also wrap the nested
 * `events/[id]` segment, flushing the shell (and committing a 200) before that
 * segment's layout could 404 a cross-club event id. See `events/[id]/layout.tsx`.
 */
export default async function EventsPage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  return (
    <Suspense fallback={<ListSkeleton />}>
      <EventsList clubSlug={clubSlug} />
    </Suspense>
  );
}

async function EventsList({ clubSlug }: { clubSlug: string }) {
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
      {isExec ? (
        <TopbarActions>
          <EventFormDialog />
        </TopbarActions>
      ) : null}

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

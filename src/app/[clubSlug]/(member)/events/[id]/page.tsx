import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireClubAccess } from "@/lib/club-context";
import { formatDateTime, toDateTimeLocal } from "@/lib/format";
import { parseFormSchema } from "@/lib/event-forms";
import { ArrowLeft } from "lucide-react";
import { Avatar, DateBlock } from "@/components/date-block";
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
import { IntakeToggle } from "../intake-toggle";
import { CopyRegisterLink } from "../copy-register-link";
import { RsvpButtons } from "../rsvp-buttons";
import { CheckInList, type CheckInEntry } from "./check-in-list";
import { ResponsesSection, type ResponseRow } from "./responses-section";

export const metadata: Metadata = { title: "Event — Club Portal" };

const GROUPS: { key: "GOING" | "MAYBE" | "NOT_GOING"; label: string }[] = [
  { key: "GOING", label: "Going" },
  { key: "MAYBE", label: "Maybe" },
  { key: "NOT_GOING", label: "Not going" },
];

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ clubSlug: string; id: string }>;
}) {
  const { clubSlug, id } = await params;
  const { club, membership: me } = await requireClubAccess(clubSlug);
  const isExec = me.role === "EXEC" || me.role === "PRESIDENT";

  // Compound id + clubId: another club's event id must not resolve here.
  const event = await prisma.event.findFirst({
    where: { id, clubId: club.id },
    include: {
      attendance: { include: { membership: { include: { user: true } } } },
    },
  });
  if (!event) notFound();

  const now = new Date();
  const upcoming = event.startsAt.getTime() >= now.getTime();
  const myRsvp =
    event.attendance.find((a) => a.membershipId === me.id)?.rsvp ?? null;

  // Exec views: the check-in list (ACTIVE members + guests, RSVP'd sorted to
  // top) and the responses table (every registration record).
  let checkInEntries: CheckInEntry[] = [];
  let responseRows: ResponseRow[] = [];
  if (isExec) {
    const activeMembers = await prisma.membership.findMany({
      where: { clubId: club.id, status: "ACTIVE" },
      include: { user: true },
    });
    const attByMember = new Map(
      event.attendance
        .filter((a) => a.membershipId !== null)
        .map((a) => [a.membershipId, a]),
    );
    const memberEntries: CheckInEntry[] = activeMembers.map((m) => {
      const a = attByMember.get(m.id);
      return {
        kind: "member",
        targetId: m.id,
        name: m.user.name,
        department: m.department,
        rsvp: a?.rsvp ?? null,
        checkedIn: !!a?.checkedInAt,
      };
    });
    // Guests attend like anyone else, so they belong in check-in too (§5.1).
    const guestEntries: CheckInEntry[] = event.attendance
      .filter((a) => a.membershipId === null)
      .map((a) => ({
        kind: "guest",
        targetId: a.id,
        name: a.guestName ?? "Guest",
        department: null,
        rsvp: a.rsvp,
        checkedIn: !!a.checkedInAt,
      }));
    checkInEntries = [...memberEntries, ...guestEntries].sort((a, b) => {
      const ar = a.rsvp ? 0 : 1;
      const br = b.rsvp ? 0 : 1;
      if (ar !== br) return ar - br;
      return a.name.localeCompare(b.name);
    });

    responseRows = event.attendance
      .map((a) => ({
        id: a.id,
        name: a.membership?.user.name ?? a.guestName ?? "—",
        email: a.membership?.user.email ?? a.guestEmail ?? "—",
        registeredAt: a.createdAt,
        isGuest: a.membershipId === null,
        responses:
          a.formResponses && typeof a.formResponses === "object"
            ? (a.formResponses as Record<string, unknown>)
            : {},
      }))
      .sort((x, y) => x.registeredAt.getTime() - y.registeredAt.getTime());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/${clubSlug}/events`}
            className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden strokeWidth={1.75} className="size-4" />
            Events
          </Link>
          <div className="mt-3 flex items-start gap-4">
            <DateBlock date={event.startsAt} />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold">{event.title}</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {formatDateTime(event.startsAt)}
                {event.endsAt ? ` – ${formatDateTime(event.endsAt)}` : ""}
                {event.location ? ` · ${event.location}` : ""}
                {!upcoming ? " · Past event" : ""}
              </p>
            </div>
          </div>
        </div>
        {isExec ? (
          <div className="flex flex-col items-end gap-2">
            <IntakeToggle
              eventId={event.id}
              accepting={event.acceptingResponses}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <CopyRegisterLink eventId={event.id} />
              <EventFormDialog
                event={{
                  id: event.id,
                  title: event.title,
                  description: event.description,
                  location: event.location,
                  startsAtLocal: toDateTimeLocal(event.startsAt),
                  endsAtLocal: event.endsAt ? toDateTimeLocal(event.endsAt) : "",
                  formSchema: parseFormSchema(event.formSchema),
                  acceptingResponses: event.acceptingResponses,
                }}
              />
              <DeleteEventButton eventId={event.id} title={event.title} />
            </div>
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
        <CardContent className="grid gap-6 sm:grid-cols-3">
          {GROUPS.map((g) => {
            const list = event.attendance.filter((a) => a.rsvp === g.key);
            return (
              <div key={g.key}>
                <p className="mb-3 text-[13px] font-medium text-muted-foreground">
                  {g.label} ({list.length})
                </p>
                {list.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">Nobody yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((a) => {
                      // Guests (no membership) register via the public form and
                      // still RSVP; fall back to their name. Full guest treatment
                      // lands in the Responses/check-in work (EVENT-FORMS.md §5).
                      const name = a.membership?.user.name ?? a.guestName ?? "Guest";
                      return (
                        <li key={a.id} className="flex items-center gap-2">
                          <Avatar name={name} className="size-7 text-[10px]" />
                          <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                          {a.checkedInAt ? (
                            <Badge variant="success">In</Badge>
                          ) : null}
                        </li>
                      );
                    })}
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
            <CardTitle className="text-base">Responses</CardTitle>
            <CardDescription>
              Registrations through the public form, members and guests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsesSection
              clubSlug={clubSlug}
              eventId={event.id}
              formSchema={parseFormSchema(event.formSchema)}
              rows={responseRows}
            />
          </CardContent>
        </Card>
      ) : null}

      {isExec ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Check-in</CardTitle>
            <CardDescription>
              Mark attendance for active members and registered guests.
              RSVP&apos;d attendees are listed first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CheckInList eventId={event.id} entries={checkInEntries} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

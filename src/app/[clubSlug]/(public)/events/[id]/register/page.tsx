import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarOff, CircleCheckBig } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getClubBySlug } from "@/lib/club-context";
import { formatDateTime } from "@/lib/format";
import { parseFormSchema, type FormField } from "@/lib/event-forms";
import { ClubMark } from "@/components/club-mark";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DynamicForm, type Identity } from "./dynamic-form";

export const metadata: Metadata = { title: "Register — Club Portal" };

type ClubIdentity = { name: string; logoUrl: string | null };

/** Club identity above a centered card, in the club's theme (the layout injects it). */
function Shell({
  club,
  children,
}: {
  club: ClubIdentity;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <ClubMark club={club} className="size-14 rounded-xl text-xl" />
          <p className="text-[15px] font-medium">{club.name}</p>
        </div>
        <Card>{children}</Card>
      </div>
    </main>
  );
}

export default async function EventRegisterPage({
  params,
}: {
  params: Promise<{ clubSlug: string; id: string }>;
}) {
  const { clubSlug, id } = await params;

  // 1. Club must be ACTIVE (else an indistinguishable 404).
  const club = await getClubBySlug(clubSlug);

  // 2. Event, compound-scoped: another club's event id must not resolve here.
  const event = await prisma.event.findFirst({ where: { id, clubId: club.id } });
  if (!event) notFound();

  // 3. Intake gate. Comparing instants is timezone-independent; the stored
  //    startsAt already encodes Lagos wall-clock (see validations/events.ts).
  //    `new Date()` into a const, not `Date.now()` inline (React purity rule).
  const now = new Date();
  const past = event.startsAt.getTime() < now.getTime();
  if (!event.acceptingResponses || past) {
    return (
      <Shell club={club}>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-muted">
            <CalendarOff aria-hidden className="size-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-medium">{event.title}</p>
            <p className="text-sm text-muted-foreground">
              {past
                ? "This event has already taken place."
                : "This form is no longer accepting responses."}
            </p>
          </div>
        </CardContent>
      </Shell>
    );
  }

  // 4. Open form. Resolve the viewer server-side (never trusted client-side).
  const formSchema = parseFormSchema(event.formSchema);
  const { identity, existing } = await resolveViewer(club.id, event.id);

  return (
    <Shell club={club}>
      <CardHeader>
        <CardTitle className="text-xl">{event.title}</CardTitle>
        <CardDescription>
          {formatDateTime(event.startsAt)}
          {event.location ? ` · ${event.location}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {existing ? (
          <RegisteredCard
            name={existing.name}
            responses={existing.responses}
            formSchema={formSchema}
          />
        ) : (
          <DynamicForm formSchema={formSchema} identity={identity} />
        )}
      </CardContent>
    </Shell>
  );
}

/**
 * Derive the registrant's identity and any existing registration for this event.
 * Mirrors the §3.2 table — and is re-derived inside the submit action too, so the
 * client can never nominate itself a member.
 */
async function resolveViewer(clubId: string, eventId: string) {
  const session = await auth();
  let identity: Identity = { locked: false, name: "", email: "" };
  let existing: { name: string; responses: Record<string, unknown> } | null = null;

  if (session?.user?.id) {
    const membership = await prisma.membership.findUnique({
      where: { clubId_userId: { clubId, userId: session.user.id } },
      include: { user: true },
    });

    if (membership?.status === "ACTIVE") {
      // ACTIVE member: identity locked, registration links by membershipId.
      identity = { locked: true, name: membership.user.name, email: membership.user.email };
      const row = await prisma.attendance.findUnique({
        where: { eventId_membershipId: { eventId, membershipId: membership.id } },
      });
      if (row) {
        existing = { name: membership.user.name, responses: asResponses(row.formResponses) };
      }
    } else {
      // Signed in, not an ACTIVE member here: guest, prefilled from the account.
      const user = membership?.user ?? (await prisma.user.findUnique({ where: { id: session.user.id } }));
      if (user) {
        identity = { locked: false, name: user.name, email: user.email };
        const row = await prisma.attendance.findUnique({
          where: { eventId_guestEmail: { eventId, guestEmail: user.email.toLowerCase() } },
        });
        if (row) {
          existing = {
            name: row.guestName ?? user.name,
            responses: asResponses(row.formResponses),
          };
        }
      }
    }
  }
  // Anonymous: empty editable identity, no way to know if already registered.

  return { identity, existing };
}

function asResponses(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function displayValue(value: unknown): string {
  if (value === true) return "Yes";
  if (value === false) return "—";
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

/**
 * The "You're registered ✓" card (§3.2): the person's submitted answers. Fields
 * removed from the schema since they registered are retained and labelled
 * "(removed field)" (no-hard-delete).
 */
function RegisteredCard({
  name,
  responses,
  formSchema,
}: {
  name: string;
  responses: Record<string, unknown>;
  formSchema: FormField[];
}) {
  const known = new Set(formSchema.map((f) => f.id));
  const rows: { label: string; value: string }[] = formSchema.map((f) => ({
    label: f.label,
    value: displayValue(responses[f.id]),
  }));
  for (const key of Object.keys(responses)) {
    if (!known.has(key)) {
      rows.push({ label: "(removed field)", value: displayValue(responses[key]) });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <CircleCheckBig aria-hidden className="size-10 text-success" />
        <p className="text-lg font-medium">You&apos;re registered ✓</p>
        <p className="text-sm text-muted-foreground">Registered as {name}.</p>
      </div>
      {rows.length > 0 ? (
        <dl className="divide-y divide-border rounded-lg border border-border">
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-3 gap-3 px-3 py-2 text-sm">
              <dt className="col-span-1 text-muted-foreground">{row.label}</dt>
              <dd className="col-span-2 wrap-break-word">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

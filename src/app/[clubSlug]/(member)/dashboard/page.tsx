import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { getClubSettings } from "@/lib/club";
import { requireClubAccess } from "@/lib/club-context";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RsvpButtons } from "../events/rsvp-buttons";

export const metadata: Metadata = { title: "Dashboard — Club Portal" };

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <Card className={href ? "transition-colors hover:border-foreground/30" : ""}>
      <CardContent className="py-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  const { club, membership: me } = await requireClubAccess(clubSlug);
  const isExec = me.role === "EXEC" || me.role === "PRESIDENT";
  const settings = getClubSettings(club.settings);
  const period = settings.currentPeriod;
  const now = new Date();

  const myDues = await prisma.duesRecord.findFirst({
    where: { membershipId: me.id, period, clubId: club.id },
  });

  const upcomingEvents = await prisma.event.findMany({
    where: { clubId: club.id, startsAt: { gte: now } },
    orderBy: { startsAt: "asc" },
    take: 3,
    include: { attendance: { select: { rsvp: true, membershipId: true } } },
  });
  const events = upcomingEvents.map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.startsAt,
    location: e.location,
    goingCount: e.attendance.filter((a) => a.rsvp === "GOING").length,
    myRsvp: e.attendance.find((a) => a.membershipId === me.id)?.rsvp ?? null,
  }));

  let stats: {
    activeCount: number;
    pendingCount: number;
    pctPaid: number;
    nextEventGoing: number;
  } | null = null;
  if (isExec) {
    const [activeCount, pendingCount, paidActive] = await Promise.all([
      prisma.membership.count({ where: { clubId: club.id, status: "ACTIVE" } }),
      prisma.membership.count({ where: { clubId: club.id, status: "PENDING" } }),
      prisma.duesRecord.count({
        where: { clubId: club.id, period, membership: { status: "ACTIVE" } },
      }),
    ]);
    stats = {
      activeCount,
      pendingCount,
      pctPaid: activeCount ? Math.round((paidActive / activeCount) * 100) : 0,
      nextEventGoing: events[0]?.goingCount ?? 0,
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome, {me.user.name.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground">
          {club.name} · {period}
        </p>
      </div>

      {stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active members" value={String(stats.activeCount)} />
          <StatCard
            label="Pending approvals"
            value={String(stats.pendingCount)}
            href={`/${clubSlug}/members`}
          />
          <StatCard
            label="Dues paid"
            value={`${stats.pctPaid}%`}
            href={`/${clubSlug}/dues`}
          />
          <StatCard
            label="Next event RSVPs"
            value={String(stats.nextEventGoing)}
          />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your dues</CardTitle>
            <CardDescription>{period}</CardDescription>
          </CardHeader>
          <CardContent>
            {myDues ? (
              <div className="space-y-1">
                <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                  Paid
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(myDues.amount, settings.currency)} ·{" "}
                  {formatDate(myDues.paidAt)}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <Badge variant="outline">Unpaid</Badge>
                <p className="text-sm text-muted-foreground">
                  Dues of {formatCurrency(settings.duesAmount, settings.currency)}{" "}
                  are outstanding for this period.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Upcoming events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No upcoming events.
              </p>
            ) : (
              events.map((e) => (
                <div key={e.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/${clubSlug}/events/${e.id}`}
                        className="font-medium hover:underline"
                      >
                        {e.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(e.startsAt)}
                        {e.location ? ` · ${e.location}` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary">{e.goingCount} going</Badge>
                  </div>
                  <div className="mt-3">
                    <RsvpButtons eventId={e.id} current={e.myRsvp} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your profile</CardTitle>
          <CardDescription>
            <Link href={`/${clubSlug}/profile`} className="underline">
              Edit profile
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Department</p>
            <p>{me.department ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Level</p>
            <p>{me.level ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Committee</p>
            <p>{me.committee ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Phone</p>
            <p>{me.phone ?? "—"}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { getClubSettings } from "@/lib/club";
import { requireClubAccess } from "@/lib/club-context";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { DateBlock } from "@/components/date-block";
import {
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";
import { RsvpButtons } from "../events/rsvp-buttons";

export const metadata: Metadata = { title: "Dashboard — Club Portal" };

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
      prisma.membership.count({
        where: { clubId: club.id, status: "PENDING" },
      }),
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
    <div className="space-y-8">
      <div>
        <p className="text-[15px] font-medium">
          Welcome, {me.user.name.split(" ")[0]}
        </p>
        <p className="text-[13px] text-muted-foreground">
          {club.name} · {period}
        </p>
      </div>

      {/* The member's own dues status: one banner, not a card to hunt for (§C2). */}
      {myDues ? (
        <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-tint p-6">
          <CheckCircle2
            aria-hidden
            strokeWidth={1.75}
            className="mt-0.5 size-5 shrink-0 text-success-tint-fg"
          />
          <div className="text-success-tint-fg">
            <p className="text-[15px] font-medium">Paid for {period}</p>
            <p className="text-[13px] opacity-90">
              {formatCurrency(myDues.amount, settings.currency)} ·{" "}
              {formatDate(myDues.paidAt)}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-tint p-6">
          <TriangleAlert
            aria-hidden
            strokeWidth={1.75}
            className="mt-0.5 size-5 shrink-0 text-danger-tint-fg"
          />
          <div className="text-danger-tint-fg">
            <p className="text-[15px] font-medium">Unpaid for {period}</p>
            <p className="text-[13px] opacity-90">
              Dues of {formatCurrency(settings.duesAmount, settings.currency)}{" "}
              are outstanding — see the treasurer to pay.
            </p>
          </div>
        </div>
      )}

      {stats ? (
        <div className="grid grid-cols-1 xs:grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Active members"
            value={String(stats.activeCount)}
            icon={Users}
          />
          <StatCard
            label="Pending approvals"
            value={String(stats.pendingCount)}
            icon={Clock}
            href={`/${clubSlug}/members`}
            tone={stats.pendingCount > 0 ? "warning" : "default"}
          />
          <StatCard
            label="Dues paid"
            value={`${stats.pctPaid}%`}
            icon={Wallet}
            href={`/${clubSlug}/dues`}
          />
          <StatCard
            label="Next event RSVPs"
            value={String(stats.nextEventGoing)}
            icon={CalendarCheck}
          />
        </div>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-medium">Upcoming events</h2>
          <Link
            href={`/${clubSlug}/events`}
            className="text-[13px] text-muted-foreground hover:text-foreground"
          >
            All events
          </Link>
        </div>

        {events.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface">
            <EmptyState
              icon={CalendarDays}
              message="No upcoming events."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((e) => (
              <div
                key={e.id}
                className="flex flex-col sm:flex-row flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-6"
              >
                <DateBlock date={e.startsAt} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/${clubSlug}/events/${e.id}`}
                    className="text-[15px] text-center sm:text-start font-medium hover:underline"
                  >
                    {e.title}
                  </Link>
                  <p className="text-[13px] text-muted-foreground">
                    {formatDateTime(e.startsAt)}
                    {e.location ? ` · ${e.location}` : ""} · {e.goingCount}{" "}
                    going
                  </p>
                </div>
                <RsvpButtons
                  eventId={e.id}
                  current={e.myRsvp}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">Your profile</CardTitle>
          <CardDescription>
            <Link
              href={`/${clubSlug}/profile`}
              className="underline"
            >
              Edit profile
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Department", me.department],
            ["Level", me.level],
            ["Committee", me.committee],
            ["Phone", me.phone],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[13px] text-muted-foreground">{label}</p>
              <p>{value ?? "—"}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

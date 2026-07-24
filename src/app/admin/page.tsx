import Link from "next/link";

import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** All club statuses, so a status with zero clubs still shows a 0. */
const CLUB_STATUSES = ["ACTIVE", "PENDING", "REJECTED", "SUSPENDED"] as const;

export default async function AdminOverviewPage() {
  // The layout already ran requirePlatformAdmin(); these are cheap counts,
  // computed per request — no cached aggregates that could drift.
  const [clubsByStatus, userCount, membershipCount] = await Promise.all([
    prisma.club.groupBy({ by: ["status"], _count: true }),
    prisma.user.count(),
    prisma.membership.count(),
  ]);

  const clubCounts = Object.fromEntries(
    CLUB_STATUSES.map((status) => [status, 0]),
  ) as Record<(typeof CLUB_STATUSES)[number], number>;
  for (const row of clubsByStatus) {
    clubCounts[row.status as (typeof CLUB_STATUSES)[number]] = row._count;
  }
  const clubTotal = CLUB_STATUSES.reduce((sum, s) => sum + clubCounts[s], 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardDescription>Clubs</CardDescription>
          <CardTitle className="text-3xl">{clubTotal}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[13px] text-muted-foreground">
            {clubCounts.ACTIVE} Active · {clubCounts.PENDING} Pending ·{" "}
            {clubCounts.REJECTED} Rejected · {clubCounts.SUSPENDED} Suspended
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Pending requests</CardDescription>
          <CardTitle className="text-3xl">{clubCounts.PENDING}</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href="/admin/clubs"
            className="text-[13px] text-primary hover:underline"
          >
            Review the queue →
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Users</CardDescription>
          <CardTitle className="text-3xl">{userCount}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[13px] text-muted-foreground">
            Accounts across the whole platform.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Memberships</CardDescription>
          <CardTitle className="text-3xl">{membershipCount}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[13px] text-muted-foreground">
            Total across all clubs — a platform-volume number, not one club&apos;s
            roster.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

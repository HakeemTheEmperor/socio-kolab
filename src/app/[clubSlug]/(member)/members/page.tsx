import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { prisma } from "@/lib/prisma";
import { getClubSettings } from "@/lib/club";
import { requireClubAccess } from "@/lib/club-context";
import type { Prisma } from "@/generated/prisma/client";
import { ListSkeleton } from "@/components/page-skeleton";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MembersFilters } from "./members-filters";
import { ApprovalButtons } from "./approval-buttons";

export const metadata: Metadata = { title: "Members — Club Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * The skeleton is an in-page Suspense boundary rather than a route-level
 * `loading.tsx`, which would also wrap `members/[id]` and flush the shell before
 * that segment could 404 a cross-club membership id. See `members/[id]/layout.tsx`.
 */
export default async function MembersPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ clubSlug: string }>;
  searchParams: SearchParams;
}) {
  const { clubSlug } = await routeParams;
  return (
    <Suspense fallback={<ListSkeleton />}>
      <MembersDirectory clubSlug={clubSlug} searchParams={searchParams} />
    </Suspense>
  );
}

async function MembersDirectory({
  clubSlug,
  searchParams,
}: {
  clubSlug: string;
  searchParams: SearchParams;
}) {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  const isExec = me.role === "EXEC" || me.role === "PRESIDENT";

  const settings = getClubSettings(club.settings);
  const params = await searchParams;

  const q = str(params.q);
  const statusFilter = str(params.status);
  const department = str(params.department);
  const committee = str(params.committee);

  const where: Prisma.MembershipWhereInput = { clubId: club.id };
  if (statusFilter && ["ACTIVE", "INACTIVE", "ALUMNI"].includes(statusFilter)) {
    where.status = statusFilter as Prisma.MembershipWhereInput["status"];
  } else {
    // Directory excludes PENDING — those are handled in the approvals section.
    where.status = { not: "PENDING" };
  }
  if (department) where.department = department;
  if (committee) where.committee = committee;
  if (q) where.user = { name: { contains: q, mode: "insensitive" } };

  const members = await prisma.membership.findMany({
    where,
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });

  // Exec-only extras: pending approvals + dues-paid status for current period.
  const pending = isExec
    ? await prisma.membership.findMany({
        where: { clubId: club.id, status: "PENDING" },
        include: { user: true },
        orderBy: { joinedAt: "asc" },
      })
    : [];

  let paidSet = new Set<string>();
  if (isExec) {
    const paid = await prisma.duesRecord.findMany({
      where: { clubId: club.id, period: settings.currentPeriod },
      select: { membershipId: true },
    });
    paidSet = new Set(paid.map((p) => p.membershipId));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="text-muted-foreground">
          {members.length} member{members.length === 1 ? "" : "s"}
          {isExec ? ` · dues period ${settings.currentPeriod}` : ""}
        </p>
      </div>

      {isExec && pending.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Pending approvals ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.map((m) => (
              <div
                key={m.id}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{m.user.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {m.user.email}
                    {m.department ? ` · ${m.department}` : ""}
                    {m.level ? ` · ${m.level}` : ""}
                  </p>
                </div>
                <ApprovalButtons membershipId={m.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <MembersFilters
        departments={settings.departments}
        committees={settings.committees}
      />

      {members.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
          No members match your filters.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Committee</TableHead>
                  <TableHead>Status</TableHead>
                  {isExec ? (
                    <>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Dues</TableHead>
                    </>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/${clubSlug}/members/${m.id}`}
                        className="hover:underline"
                      >
                        {m.user.name}
                      </Link>
                    </TableCell>
                    <TableCell>{m.department ?? "—"}</TableCell>
                    <TableCell>{m.level ?? "—"}</TableCell>
                    <TableCell>{m.committee ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={m.status} />
                    </TableCell>
                    {isExec ? (
                      <>
                        <TableCell>{m.user.email}</TableCell>
                        <TableCell>{m.phone ?? "—"}</TableCell>
                        <TableCell>
                          {paidSet.has(m.id) ? (
                            <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                              Paid
                            </Badge>
                          ) : (
                            <Badge variant="outline">Unpaid</Badge>
                          )}
                        </TableCell>
                      </>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {members.map((m) => (
              <Link
                key={m.id}
                href={`/${clubSlug}/members/${m.id}`}
                className="block rounded-md border p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{m.user.name}</p>
                  <StatusBadge status={m.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {m.department ?? "No department"}
                  {m.level ? ` · Level ${m.level}` : ""}
                  {m.committee ? ` · ${m.committee}` : ""}
                </p>
                {isExec ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {m.user.email}
                    {m.phone ? ` · ${m.phone}` : ""} ·{" "}
                    {paidSet.has(m.id) ? "Dues paid" : "Dues unpaid"}
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

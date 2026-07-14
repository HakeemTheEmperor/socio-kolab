import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { prisma } from "@/lib/prisma";
import { getClubSettings } from "@/lib/club";
import { requireClubAccess } from "@/lib/club-context";
import type { Prisma } from "@/generated/prisma/client";
import { Users } from "lucide-react";

import { ListSkeleton } from "@/components/page-skeleton";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Avatar } from "@/components/date-block";
import { Badge } from "@/components/ui/badge";
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
  // An empty directory reads differently depending on why: "no matches" is the
  // filters' fault, "no members yet" is the club's.
  const hasFilters = Boolean(q || statusFilter || department || committee);

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
      <p className="text-[13px] text-muted-foreground">
        {members.length} member{members.length === 1 ? "" : "s"}
        {isExec ? ` · dues period ${settings.currentPeriod}` : ""}
      </p>

      {/* Applications waiting on an exec: a warning left edge, so the page opens on
          the thing that needs doing (§C2). */}
      {isExec && pending.length > 0 ? (
        <section className="overflow-hidden rounded-xl rounded-l-none border border-l-4 border-border border-l-warning bg-surface">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-[15px] font-medium">
              Pending approvals ({pending.length})
            </h2>
          </div>
          <div className="divide-y divide-border">
            {pending.map((m) => (
              <div
                key={m.id}
                className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={m.user.name} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.user.name}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {m.user.email}
                      {m.department ? ` · ${m.department}` : ""}
                      {m.level ? ` · ${m.level}` : ""}
                    </p>
                  </div>
                </div>
                <ApprovalButtons membershipId={m.id} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <MembersFilters
        departments={settings.departments}
        committees={settings.committees}
      />

      {members.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={Users}
            message={
              hasFilters
                ? "No members match your filters."
                : "No members yet. They'll appear here once people join."
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
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
                      <TableHead>Phone</TableHead>
                      <TableHead>Dues</TableHead>
                    </>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id} className="relative hover:bg-surface-hover">
                    <TableCell>
                      {/* The whole row navigates: the link stretches over it, and
                          the cells after it sit above via `relative`. */}
                      <div className="flex items-center gap-3">
                        <Avatar name={m.user.name} />
                        <div className="min-w-0">
                          <Link
                            href={`/${clubSlug}/members/${m.id}`}
                            className="font-medium after:absolute after:inset-0 hover:underline"
                          >
                            {m.user.name}
                          </Link>
                          {isExec ? (
                            <p className="truncate text-[13px] text-muted-foreground">
                              {m.user.email}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{m.department ?? "—"}</TableCell>
                    <TableCell>{m.level ?? "—"}</TableCell>
                    <TableCell>{m.committee ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={m.status} />
                    </TableCell>
                    {isExec ? (
                      <>
                        <TableCell>{m.phone ?? "—"}</TableCell>
                        <TableCell>
                          {paidSet.has(m.id) ? (
                            <Badge variant="success">Paid</Badge>
                          ) : (
                            <Badge variant="danger">Unpaid</Badge>
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
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 active:bg-surface-hover"
              >
                <Avatar name={m.user.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.user.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {m.department ?? "No department"}
                    {m.level ? ` · Level ${m.level}` : ""}
                    {isExec ? (paidSet.has(m.id) ? " · Paid" : " · Unpaid") : ""}
                  </p>
                </div>
                <StatusBadge status={m.status} />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireClubAccess } from "@/lib/club-context";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Handshake } from "lucide-react";

import { ListSkeleton } from "@/components/page-skeleton";
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
import { TopbarActions } from "@/components/app-shell/topbar-actions";
import { PartnerDialog } from "./partner-dialog";

export const metadata: Metadata = { title: "Partners — Club Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * In-page Suspense rather than a route-level `loading.tsx`, which would also
 * wrap `partners/[id]` and flush the shell before that segment could 404 a
 * cross-club or unauthorized partner id. See `partners/[id]/layout.tsx`.
 */
export default async function PartnersPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ clubSlug: string }>;
  searchParams: SearchParams;
}) {
  const { clubSlug } = await routeParams;
  return (
    <Suspense fallback={<ListSkeleton />}>
      <PartnersList clubSlug={clubSlug} searchParams={searchParams} />
    </Suspense>
  );
}

/** "Liaison" cell/line: name, or the warning that is this module's point. */
function LiaisonCell({
  liaison,
  isExec,
}: {
  liaison: { status: string; user: { name: string } } | null;
  isExec: boolean;
}) {
  if (!liaison) {
    return isExec ? (
      <Badge variant="warning">Unassigned</Badge>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {liaison.user.name}
      {isExec && liaison.status !== "ACTIVE" ? (
        <Badge variant="warning">Inactive — reassign</Badge>
      ) : null}
    </span>
  );
}

async function PartnersList({
  clubSlug,
  searchParams,
}: {
  clubSlug: string;
  searchParams: SearchParams;
}) {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  const isExec = can(me, "partner:view");
  const params = await searchParams;
  const showArchived = isExec && params.archived === "1";

  // Execs see the whole registry; a non-exec sees exactly the partners they
  // liaise for — filtered in the query, not in the UI (PARTNERS.md §6.1).
  const partners = await prisma.partner.findMany({
    where: {
      clubId: club.id,
      ...(isExec ? {} : { liaisonId: me.id }),
      ...(showArchived ? {} : { archivedAt: null }),
    },
    include: {
      liaison: { include: { user: true } },
      notes: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
    orderBy: { name: "asc" },
  });

  // A member with nothing to liaise for has no business here (and no nav item).
  if (!isExec && partners.length === 0) {
    redirect(`/${clubSlug}/dashboard`);
  }

  return (
    <div className="space-y-6">
      {isExec ? (
        <TopbarActions>
          <PartnerDialog members={await liaisonOptions(club.id)} />
        </TopbarActions>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-muted-foreground">
          {partners.length} partner{partners.length === 1 ? "" : "s"}
          {isExec ? "" : " you liaise for"}
        </p>
        {isExec ? (
          <Link
            href={`/${clubSlug}/partners${showArchived ? "" : "?archived=1"}`}
            className="text-[13px] text-muted-foreground underline-offset-4 hover:underline"
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Link>
        ) : null}
      </div>

      {partners.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={Handshake}
            message="No partners yet. Add the organizations your club works with so the relationships outlive any one member."
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
                  <TableHead>Contact person</TableHead>
                  <TableHead>Liaison officer</TableHead>
                  <TableHead>Last contact</TableHead>
                  {showArchived ? <TableHead>Status</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((p) => (
                  <TableRow key={p.id} className="relative hover:bg-surface-hover">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={p.name} />
                        <div className="min-w-0">
                          <Link
                            href={`/${clubSlug}/partners/${p.id}`}
                            className="font-medium after:absolute after:inset-0 hover:underline"
                          >
                            {p.name}
                          </Link>
                          <p className="truncate text-[13px] text-muted-foreground">
                            {p.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{p.contactPerson ?? "—"}</TableCell>
                    <TableCell>
                      <LiaisonCell liaison={p.liaison} isExec={isExec} />
                    </TableCell>
                    <TableCell>
                      {p.notes[0] ? (
                        formatDate(p.notes[0].createdAt)
                      ) : (
                        <span className="text-muted-foreground">No log yet</span>
                      )}
                    </TableCell>
                    {showArchived ? (
                      <TableCell>
                        {p.archivedAt ? (
                          <Badge variant="neutral">Archived</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {partners.map((p) => (
              <Link
                key={p.id}
                href={`/${clubSlug}/partners/${p.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 active:bg-surface-hover"
              >
                <Avatar name={p.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {p.liaison
                      ? `Liaison: ${p.liaison.user.name}`
                      : "No liaison assigned"}
                    {p.notes[0]
                      ? ` · Last contact ${formatDate(p.notes[0].createdAt)}`
                      : ""}
                  </p>
                </div>
                {p.archivedAt ? (
                  <Badge variant="neutral">Archived</Badge>
                ) : isExec && (!p.liaison || p.liaison.status !== "ACTIVE") ? (
                  <Badge variant="warning">Reassign</Badge>
                ) : null}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** ACTIVE members of this club, for the dialog's liaison picker. */
async function liaisonOptions(clubId: string) {
  const members = await prisma.membership.findMany({
    where: { clubId, status: "ACTIVE" },
    include: { user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return members.map((m) => ({ id: m.id, name: m.user.name, role: m.role }));
}

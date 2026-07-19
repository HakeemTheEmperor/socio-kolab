import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Vote } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireClubAccess } from "@/lib/club-context";
import { can } from "@/lib/permissions";
import { getElectionPhase } from "@/lib/elections";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/page-skeleton";
import { TopbarActions } from "@/components/app-shell/topbar-actions";
import { ElectionFormDialog } from "./election-form-dialog";
import { PhaseBadge } from "./phase-badge";

export const metadata: Metadata = { title: "Elections — Club Portal" };

export default async function ElectionsPage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ElectionsList clubSlug={clubSlug} />
    </Suspense>
  );
}

async function ElectionsList({ clubSlug }: { clubSlug: string }) {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  const canManage = can(me, "election:manage");
  const now = new Date();

  const elections = await prisma.election.findMany({
    where: {
      clubId: club.id,
      // Drafts are only visible to the president who can manage them.
      ...(canManage ? {} : { status: { not: "DRAFT" } }),
    },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { positions: true } } },
  });

  return (
    <div className="space-y-6">
      {canManage ? (
        <TopbarActions>
          <ElectionFormDialog />
        </TopbarActions>
      ) : null}

      {elections.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={Vote}
            message="No elections yet."
            action={canManage ? <ElectionFormDialog /> : undefined}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {elections.map((election) => {
            const phase = getElectionPhase(election, now);
            return (
              <Link
                key={election.id}
                href={`/${clubSlug}/elections/${election.id}`}
                className="block rounded-xl border border-border bg-surface p-6 transition-colors hover:border-ring"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-medium">{election.title}</h2>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {election._count.positions} position
                      {election._count.positions === 1 ? "" : "s"} · Voting{" "}
                      {formatDateTime(election.votingStartAt)} –{" "}
                      {formatDateTime(election.votingEndAt)}
                    </p>
                  </div>
                  <PhaseBadge phase={phase} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

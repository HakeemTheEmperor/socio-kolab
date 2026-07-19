import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireClubAccess } from "@/lib/club-context";
import { can } from "@/lib/permissions";
import { getElectionPhase } from "@/lib/elections";
import { formatDateTime, toDateTimeLocal } from "@/lib/format";
import { Avatar } from "@/components/date-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ElectionFormDialog } from "../election-form-dialog";
import { LifecycleControls } from "../lifecycle-controls";
import { PhaseBadge } from "../phase-badge";
import { ApplyDialog } from "../apply-dialog";
import { WithdrawButton } from "../withdraw-button";
import { ReviewButtons } from "../review-buttons";
import { Ballot, type BallotPosition } from "../ballot";
import { LiveResults } from "../live-results";
import { ResultsView } from "../results-view";
import { getElectionTallies } from "../tally-data";

export const metadata: Metadata = { title: "Election — Club Portal" };

const CANDIDACY_BADGE: Record<string, "success" | "danger" | "neutral" | "warning"> = {
  APPROVED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
  PENDING: "warning",
};

export default async function ElectionDetailPage({
  params,
}: {
  params: Promise<{ clubSlug: string; id: string }>;
}) {
  const { clubSlug, id } = await params;
  const { club, membership: me } = await requireClubAccess(clubSlug);
  const canManage = can(me, "election:manage");

  // Compound id + clubId: another club's election id must not resolve here.
  const election = await prisma.election.findFirst({
    where: { id, clubId: club.id },
    include: {
      positions: {
        orderBy: { order: "asc" },
        include: {
          candidacies: {
            orderBy: { createdAt: "asc" },
            include: { membership: { include: { user: true } } },
          },
        },
      },
    },
  });
  if (!election) notFound();

  const now = new Date();
  const phase = getElectionPhase(election, now);
  // Drafts exist only for the president preparing them.
  if (phase === "draft" && !canManage) notFound();

  return (
    <div className="space-y-6">
      <Link
        href={`/${clubSlug}/elections`}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" /> All elections
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">{election.title}</h1>
            {election.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{election.description}</p>
            ) : null}
          </div>
          <PhaseBadge phase={phase} />
        </div>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-[13px] text-muted-foreground sm:grid-cols-2">
          <div className="flex justify-between gap-3 sm:block">
            <dt>Applications</dt>
            <dd className="text-foreground">
              {formatDateTime(election.applicationsStartAt)} –{" "}
              {formatDateTime(election.applicationsEndAt)}
            </dd>
          </div>
          <div className="flex justify-between gap-3 sm:block">
            <dt>Voting</dt>
            <dd className="text-foreground">
              {formatDateTime(election.votingStartAt)} –{" "}
              {formatDateTime(election.votingEndAt)}
            </dd>
          </div>
        </dl>

        {canManage ? <ManagerControls election={election} phase={phase} /> : null}
      </header>

      <ElectionBody
        clubSlug={clubSlug}
        clubId={club.id}
        election={election}
        phase={phase}
        canManage={canManage}
        meId={me.id}
      />
    </div>
  );
}

function ManagerControls({
  election,
  phase,
}: {
  election: { id: string; title: string; description: string | null; applicationsStartAt: Date; applicationsEndAt: Date; votingStartAt: Date; votingEndAt: Date; positions: { title: string }[] };
  phase: string;
}) {
  if (phase === "draft") {
    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <ElectionFormDialog
          election={{
            id: election.id,
            title: election.title,
            description: election.description,
            positions: election.positions.map((p) => p.title),
            applicationsStartLocal: toDateTimeLocal(election.applicationsStartAt),
            applicationsEndLocal: toDateTimeLocal(election.applicationsEndAt),
            votingStartLocal: toDateTimeLocal(election.votingStartAt),
            votingEndLocal: toDateTimeLocal(election.votingEndAt),
          }}
        />
        <LifecycleControls electionId={election.id} actions={["publish", "delete"]} />
      </div>
    );
  }
  if (phase === "scheduled" || phase === "applications" || phase === "review") {
    return (
      <div className="border-t border-border pt-3">
        <LifecycleControls electionId={election.id} actions={["cancel"]} />
      </div>
    );
  }
  if (phase === "voting") {
    return (
      <div className="border-t border-border pt-3">
        <LifecycleControls electionId={election.id} actions={["close"]} />
      </div>
    );
  }
  return null;
}

type ElectionWithPositions = {
  id: string;
  positions: {
    id: string;
    title: string;
    candidacies: {
      id: string;
      statement: string;
      status: string;
      membershipId: string;
      membership: { user: { name: string } };
    }[];
  }[];
};

async function ElectionBody({
  clubSlug,
  clubId,
  election,
  phase,
  canManage,
  meId,
}: {
  clubSlug: string;
  clubId: string;
  election: ElectionWithPositions;
  phase: string;
  canManage: boolean;
  meId: string;
}) {
  if (phase === "cancelled") {
    return (
      <div className="rounded-xl border border-danger-tint bg-danger-tint/40 p-6 text-sm text-danger-tint-fg">
        This election was cancelled. No results will be published.
      </div>
    );
  }

  if (phase === "scheduled" || phase === "draft") {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Positions</h2>
        <ul className="rounded-xl border border-border bg-surface divide-y divide-border">
          {election.positions.map((p) => (
            <li key={p.id} className="px-6 py-3 text-sm">
              {p.title}
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-muted-foreground">
          {phase === "draft"
            ? "Publish to open applications on schedule."
            : "Applications haven't opened yet."}
        </p>
      </section>
    );
  }

  if (phase === "applications" || phase === "review") {
    return (
      <div className="space-y-6">
        {election.positions.map((position) => {
          const approved = position.candidacies.filter((c) => c.status === "APPROVED");
          const mine = position.candidacies.find((c) => c.membershipId === meId);

          return (
            <section key={position.id} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-medium">{position.title}</h2>
                {!canManage && !mine && phase === "applications" ? (
                  <ApplyDialog
                    electionId={election.id}
                    positionId={position.id}
                    positionTitle={position.title}
                  />
                ) : null}
              </div>

              {/* The applicant's own application row with self-service controls. */}
              {!canManage && mine ? (
                <div className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm">
                      Your application ·{" "}
                      <Badge variant={CANDIDACY_BADGE[mine.status]}>{mine.status}</Badge>
                    </span>
                    <div className="flex items-center gap-2">
                      {mine.status === "WITHDRAWN" && phase === "applications" ? (
                        <ApplyDialog
                          electionId={election.id}
                          positionId={position.id}
                          positionTitle={position.title}
                          existingStatement={mine.statement}
                          reapply
                        />
                      ) : null}
                      {mine.status !== "WITHDRAWN" ? (
                        <WithdrawButton electionId={election.id} candidacyId={mine.id} />
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-[13px] whitespace-pre-line text-muted-foreground">
                    {mine.statement}
                  </p>
                </div>
              ) : null}

              {/* President review queue: every application, with decisions. */}
              {canManage ? (
                <ul className="space-y-2">
                  {position.candidacies.length === 0 ? (
                    <li className="text-[13px] text-muted-foreground">
                      No applications yet.
                    </li>
                  ) : (
                    position.candidacies.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-xl border border-border bg-surface p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <Avatar name={c.membership.user.name} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {c.membership.user.name}
                                </span>
                                <Badge variant={CANDIDACY_BADGE[c.status]}>
                                  {c.status}
                                </Badge>
                              </div>
                              <p className="mt-1 text-[13px] whitespace-pre-line text-muted-foreground">
                                {c.statement}
                              </p>
                            </div>
                          </div>
                          {c.status === "PENDING" ? (
                            <ReviewButtons electionId={election.id} candidacyId={c.id} />
                          ) : null}
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              ) : (
                /* Members see the slate of approved candidates forming. */
                <ul className="space-y-2">
                  {approved.length === 0 ? (
                    <li className="text-[13px] text-muted-foreground">
                      No approved candidates yet.
                    </li>
                  ) : (
                    approved.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4"
                      >
                        <Avatar name={c.membership.user.name} />
                        <div className="min-w-0">
                          <span className="text-sm font-medium">
                            {c.membership.user.name}
                          </span>
                          <p className="mt-1 text-[13px] whitespace-pre-line text-muted-foreground">
                            {c.statement}
                          </p>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  if (phase === "voting") {
    const receipts = await prisma.voteReceipt.findMany({
      where: { electionId: election.id, membershipId: meId },
      select: { positionId: true },
    });
    const votedPositionIds = new Set(receipts.map((r) => r.positionId));

    const ballotPositions: BallotPosition[] = election.positions.map((position) => ({
      positionId: position.id,
      title: position.title,
      voted: votedPositionIds.has(position.id),
      candidates: position.candidacies
        .filter((c) => c.status === "APPROVED")
        .map((c) => ({
          candidacyId: c.id,
          name: c.membership.user.name,
          statement: c.statement,
        })),
    }));

    const initial = await getElectionTallies(clubId, election.id);

    return (
      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Your ballot</h2>
          <Ballot electionId={election.id} positions={ballotPositions} />
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Live results</h2>
          <LiveResults
            electionId={election.id}
            initial={{ phase, turnout: initial.turnout, tallies: initial.tallies }}
          />
        </section>
      </div>
    );
  }

  // closed
  const { tallies, turnout } = await getElectionTallies(clubId, election.id);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Final results</h2>
        <Button
          size="sm"
          variant="outline"
          render={<a href={`/${clubSlug}/elections/${election.id}/results`} />}
        >
          <Download aria-hidden className="size-4" /> Export CSV
        </Button>
      </div>
      <ResultsView tallies={tallies} turnout={turnout} />
    </div>
  );
}

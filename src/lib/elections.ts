import type { ElectionStatus } from "@/generated/prisma/client";

import { toCsv } from "./event-responses";

/**
 * Election domain helpers (ELECTIONS.md). All pure and unit-tested — the phase
 * machine, tally aggregation, and results CSV rows live here so pages, actions,
 * and the tallies route agree on one derivation.
 */

/**
 * The user-facing phase of an election. `status` (president-controlled) wins
 * over the clock for DRAFT/CLOSED/CANCELLED; PUBLISHED elections derive their
 * phase from the four window datetimes:
 *
 *   scheduled → applications → review → voting → closed
 *
 * "review" is the gap between the applications window closing and voting
 * opening. Boundaries are start-inclusive, end-exclusive.
 */
export type ElectionPhase =
  | "draft"
  | "scheduled"
  | "applications"
  | "review"
  | "voting"
  | "closed"
  | "cancelled";

export type ElectionWindows = {
  status: ElectionStatus;
  applicationsStartAt: Date;
  applicationsEndAt: Date;
  votingStartAt: Date;
  votingEndAt: Date;
};

export function getElectionPhase(election: ElectionWindows, now: Date): ElectionPhase {
  switch (election.status) {
    case "DRAFT":
      return "draft";
    case "CANCELLED":
      return "cancelled";
    case "CLOSED":
      return "closed";
    case "PUBLISHED":
      break;
  }

  const t = now.getTime();
  if (t < election.applicationsStartAt.getTime()) return "scheduled";
  if (t < election.applicationsEndAt.getTime()) return "applications";
  if (t < election.votingStartAt.getTime()) return "review";
  if (t < election.votingEndAt.getTime()) return "voting";
  return "closed";
}

/** True when members may cast ballots right now. */
export function isVotingOpen(election: ElectionWindows, now: Date): boolean {
  return getElectionPhase(election, now) === "voting";
}

/** True when members may submit or withdraw applications right now. */
export function isApplicationsOpen(election: ElectionWindows, now: Date): boolean {
  return getElectionPhase(election, now) === "applications";
}

// --- Tallies ---------------------------------------------------------------

export type TallyPosition = { id: string; title: string };
export type TallyCandidate = { id: string; positionId: string; name: string };

/** One row of `prisma.vote.groupBy({ by: ["positionId", "candidacyId"] })`. */
export type VoteGroupRow = {
  positionId: string;
  candidacyId: string;
  _count: { _all: number };
};

export type CandidateTally = {
  candidacyId: string;
  name: string;
  votes: number;
  /** Share of this position's votes, 0–100, rounded to 1dp. */
  share: number;
  /** True for the (possibly tied) highest vote count when any vote exists. */
  leading: boolean;
};

export type PositionTally = {
  positionId: string;
  title: string;
  totalVotes: number;
  candidates: CandidateTally[];
};

/**
 * Fold raw grouped counts into per-position tallies, zero-filling candidates
 * with no votes and ordering each position's candidates by votes descending.
 * Ties for the lead all get `leading: true`; a position with zero votes has no
 * leader.
 */
export function buildTallies(
  positions: TallyPosition[],
  candidates: TallyCandidate[],
  groupRows: VoteGroupRow[],
): PositionTally[] {
  const counts = new Map<string, number>();
  for (const row of groupRows) counts.set(row.candidacyId, row._count._all);

  return positions.map((position) => {
    const own = candidates.filter((c) => c.positionId === position.id);
    const tallied = own.map((c) => ({
      candidacyId: c.id,
      name: c.name,
      votes: counts.get(c.id) ?? 0,
    }));
    const totalVotes = tallied.reduce((sum, c) => sum + c.votes, 0);
    const topVotes = tallied.reduce((max, c) => Math.max(max, c.votes), 0);

    const candidateTallies: CandidateTally[] = tallied
      .map((c) => ({
        ...c,
        share: totalVotes === 0 ? 0 : Math.round((c.votes / totalVotes) * 1000) / 10,
        leading: topVotes > 0 && c.votes === topVotes,
      }))
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

    return { positionId: position.id, title: position.title, totalVotes, candidates: candidateTallies };
  });
}

// --- Results CSV -----------------------------------------------------------

export type ResultsTurnout = {
  eligibleVoters: number;
  /** Distinct members who cast at least one ballot. */
  ballotsCast: number;
};

/**
 * Build the results spreadsheet rows: a turnout summary block, then one row per
 * candidate grouped by position. Feed the result to `toCsv` (which handles
 * formula-injection escaping and RFC-4180 quoting).
 */
export function buildResultsCsvRows(
  tallies: PositionTally[],
  turnout: ResultsTurnout,
): string[][] {
  const rows: string[][] = [];
  const turnoutPct =
    turnout.eligibleVoters === 0
      ? "0%"
      : `${Math.round((turnout.ballotsCast / turnout.eligibleVoters) * 1000) / 10}%`;

  rows.push(["Eligible voters", String(turnout.eligibleVoters)]);
  rows.push(["Members who voted", String(turnout.ballotsCast)]);
  rows.push(["Turnout", turnoutPct]);
  rows.push([]);
  rows.push(["Position", "Candidate", "Votes", "Share", "Outcome"]);

  for (const position of tallies) {
    if (position.candidates.length === 0) {
      rows.push([position.title, "(no candidates)", "0", "0%", ""]);
      continue;
    }
    for (const candidate of position.candidates) {
      rows.push([
        position.title,
        candidate.name,
        String(candidate.votes),
        `${candidate.share}%`,
        candidate.leading ? "Leading" : "",
      ]);
    }
  }

  return rows;
}

/** Convenience: results rows serialised to CSV text (no BOM — the route adds it). */
export function resultsCsv(tallies: PositionTally[], turnout: ResultsTurnout): string {
  return toCsv(buildResultsCsvRows(tallies, turnout));
}

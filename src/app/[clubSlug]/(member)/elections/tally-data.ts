import { prisma } from "@/lib/prisma";
import {
  buildTallies,
  type PositionTally,
  type ResultsTurnout,
} from "@/lib/elections";

/**
 * Aggregate an election's votes into per-position tallies plus turnout. Shared
 * by the closed-results page, the live-results initial props, and the polled
 * tallies route so all three agree on one derivation. Only APPROVED candidacies
 * appear (they are the only ones that could receive a vote).
 */
export async function getElectionTallies(
  clubId: string,
  electionId: string,
): Promise<{ tallies: PositionTally[]; turnout: ResultsTurnout }> {
  const [positions, candidacies, groupRows, ballotVoters, eligibleVoters] =
    await Promise.all([
      prisma.position.findMany({
        where: { electionId },
        orderBy: { order: "asc" },
        select: { id: true, title: true },
      }),
      prisma.candidacy.findMany({
        where: { position: { electionId }, status: "APPROVED" },
        select: {
          id: true,
          positionId: true,
          membership: { select: { user: { select: { name: true } } } },
        },
      }),
      prisma.vote.groupBy({
        by: ["positionId", "candidacyId"],
        where: { clubId, position: { electionId } },
        _count: { _all: true },
      }),
      // Distinct members who cast at least one ballot in this election.
      prisma.voteReceipt.findMany({
        where: { electionId },
        distinct: ["membershipId"],
        select: { membershipId: true },
      }),
      prisma.membership.count({ where: { clubId, status: "ACTIVE" } }),
    ]);

  const tallies = buildTallies(
    positions,
    candidacies.map((c) => ({
      id: c.id,
      positionId: c.positionId,
      name: c.membership.user.name,
    })),
    groupRows,
  );

  return {
    tallies,
    turnout: { eligibleVoters, ballotsCast: ballotVoters.length },
  };
}

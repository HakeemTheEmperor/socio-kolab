"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireClubAccess, findElectionInClub } from "@/lib/club-context";
import { can } from "@/lib/permissions";
import { getElectionPhase } from "@/lib/elections";
import {
  electionSchema,
  applicationSchema,
  reviewDecisionSchema,
  type ElectionInput,
  type ApplicationInput,
} from "@/lib/validations/elections";
import { Prisma } from "@/generated/prisma/client";

export type ActionResult = { ok: boolean; error?: string };
export type CreateResult = ActionResult & { id?: string };

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// --- Management (president only) -------------------------------------------

export async function createElection(
  clubSlug: string,
  input: ElectionInput,
): Promise<CreateResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "election:manage")) return { ok: false, error: "Not authorized." };

  const parsed = electionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const election = await prisma.election.create({
    data: {
      clubId: club.id,
      title: parsed.data.title,
      description: parsed.data.description,
      applicationsStartAt: parsed.data.applicationsStartAt,
      applicationsEndAt: parsed.data.applicationsEndAt,
      votingStartAt: parsed.data.votingStartAt,
      votingEndAt: parsed.data.votingEndAt,
      createdById: me.id,
      positions: {
        create: parsed.data.positions.map((p, i) => ({ title: p.title, order: i })),
      },
    },
  });
  revalidatePath(`/${clubSlug}/elections`);
  return { ok: true, id: election.id };
}

export async function updateElection(
  clubSlug: string,
  electionId: string,
  input: ElectionInput,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "election:manage")) return { ok: false, error: "Not authorized." };

  const parsed = electionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const election = await findElectionInClub(club.id, electionId);
  if (!election) return { ok: false, error: "Election not found." };
  // Windows and positions are locked once published — candidacies and votes may
  // already reference them.
  if (election.status !== "DRAFT") {
    return { ok: false, error: "Only draft elections can be edited." };
  }

  // Positions can be freely replaced while DRAFT (no candidacies/votes exist).
  await prisma.$transaction([
    prisma.position.deleteMany({ where: { electionId } }),
    prisma.election.update({
      where: { id: electionId, clubId: club.id },
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        applicationsStartAt: parsed.data.applicationsStartAt,
        applicationsEndAt: parsed.data.applicationsEndAt,
        votingStartAt: parsed.data.votingStartAt,
        votingEndAt: parsed.data.votingEndAt,
        positions: {
          create: parsed.data.positions.map((p, i) => ({ title: p.title, order: i })),
        },
      },
    }),
  ]);
  revalidatePath(`/${clubSlug}/elections`);
  revalidatePath(`/${clubSlug}/elections/${electionId}`);
  return { ok: true };
}

export async function deleteElection(
  clubSlug: string,
  electionId: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "election:manage")) return { ok: false, error: "Not authorized." };

  const election = await findElectionInClub(club.id, electionId);
  if (!election) return { ok: false, error: "Election not found." };
  if (election.status !== "DRAFT") {
    return { ok: false, error: "Only draft elections can be deleted. Cancel it instead." };
  }

  // No DB cascade: clear children before the election (DRAFT has no votes, but
  // positions and any stray candidacies must go first).
  await prisma.$transaction([
    prisma.candidacy.deleteMany({ where: { position: { electionId } } }),
    prisma.position.deleteMany({ where: { electionId } }),
    prisma.election.delete({ where: { id: electionId, clubId: club.id } }),
  ]);
  revalidatePath(`/${clubSlug}/elections`);
  return { ok: true };
}

export async function publishElection(
  clubSlug: string,
  electionId: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "election:manage")) return { ok: false, error: "Not authorized." };

  const election = await findElectionInClub(club.id, electionId);
  if (!election) return { ok: false, error: "Election not found." };
  if (election.status !== "DRAFT") {
    return { ok: false, error: "This election is already published." };
  }
  if (election.votingEndAt.getTime() < Date.now()) {
    return { ok: false, error: "Voting has already ended — update the dates first." };
  }

  await prisma.election.update({
    where: { id: electionId, clubId: club.id },
    data: { status: "PUBLISHED" },
  });
  revalidatePath(`/${clubSlug}/elections`);
  revalidatePath(`/${clubSlug}/elections/${electionId}`);
  return { ok: true };
}

export async function closeElection(
  clubSlug: string,
  electionId: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "election:manage")) return { ok: false, error: "Not authorized." };

  const election = await findElectionInClub(club.id, electionId);
  if (!election) return { ok: false, error: "Election not found." };
  if (election.status !== "PUBLISHED") {
    return { ok: false, error: "Only a published election can be closed." };
  }

  await prisma.election.update({
    where: { id: electionId, clubId: club.id },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  revalidatePath(`/${clubSlug}/elections`);
  revalidatePath(`/${clubSlug}/elections/${electionId}`);
  return { ok: true };
}

export async function cancelElection(
  clubSlug: string,
  electionId: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "election:manage")) return { ok: false, error: "Not authorized." };

  const election = await findElectionInClub(club.id, electionId);
  if (!election) return { ok: false, error: "Election not found." };
  if (election.status === "CLOSED" || election.status === "CANCELLED") {
    return { ok: false, error: "This election is already finished." };
  }

  await prisma.election.update({
    where: { id: electionId, clubId: club.id },
    data: { status: "CANCELLED" },
  });
  revalidatePath(`/${clubSlug}/elections`);
  revalidatePath(`/${clubSlug}/elections/${electionId}`);
  return { ok: true };
}

// --- Applications ----------------------------------------------------------

export async function applyForPosition(
  clubSlug: string,
  electionId: string,
  positionId: string,
  input: ApplicationInput,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "election:apply")) return { ok: false, error: "Not authorized." };

  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const election = await findElectionInClub(club.id, electionId);
  if (!election) return { ok: false, error: "Election not found." };
  if (getElectionPhase(election, new Date()) !== "applications") {
    return { ok: false, error: "Applications are not open." };
  }

  // Confirm the position belongs to this election (and thus this club).
  const position = await prisma.position.findFirst({
    where: { id: positionId, electionId },
  });
  if (!position) return { ok: false, error: "Position not found." };

  // A previously withdrawn application is re-opened rather than blocked by the
  // unique constraint.
  const existing = await prisma.candidacy.findUnique({
    where: { positionId_membershipId: { positionId, membershipId: me.id } },
  });
  if (existing) {
    if (existing.status === "WITHDRAWN") {
      await prisma.candidacy.update({
        where: { id: existing.id },
        data: { statement: parsed.data.statement, status: "PENDING", reviewedById: null, reviewedAt: null },
      });
      revalidatePath(`/${clubSlug}/elections/${electionId}`);
      return { ok: true };
    }
    return { ok: false, error: "You've already applied for this position." };
  }

  try {
    await prisma.candidacy.create({
      data: { positionId, membershipId: me.id, statement: parsed.data.statement },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "You've already applied for this position." };
    }
    throw error;
  }
  revalidatePath(`/${clubSlug}/elections/${electionId}`);
  return { ok: true };
}

export async function withdrawApplication(
  clubSlug: string,
  electionId: string,
  candidacyId: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "election:apply")) return { ok: false, error: "Not authorized." };

  const election = await findElectionInClub(club.id, electionId);
  if (!election) return { ok: false, error: "Election not found." };
  // Once voting opens the ballot is fixed.
  if (Date.now() >= election.votingStartAt.getTime()) {
    return { ok: false, error: "Voting has started — applications are locked." };
  }

  // Own row only, and scoped to this election via the position relation.
  const result = await prisma.candidacy.updateMany({
    where: { id: candidacyId, membershipId: me.id, position: { electionId } },
    data: { status: "WITHDRAWN" },
  });
  if (result.count === 0) return { ok: false, error: "Application not found." };

  revalidatePath(`/${clubSlug}/elections/${electionId}`);
  return { ok: true };
}

export async function reviewApplication(
  clubSlug: string,
  electionId: string,
  candidacyId: string,
  decision: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "election:manage")) return { ok: false, error: "Not authorized." };

  const parsed = reviewDecisionSchema.safeParse(decision);
  if (!parsed.success) return { ok: false, error: "Invalid decision." };

  const election = await findElectionInClub(club.id, electionId);
  if (!election) return { ok: false, error: "Election not found." };
  const phase = getElectionPhase(election, new Date());
  if (phase !== "applications" && phase !== "review") {
    return { ok: false, error: "Applications can only be reviewed before voting opens." };
  }

  const result = await prisma.candidacy.updateMany({
    where: { id: candidacyId, position: { electionId } },
    data: { status: parsed.data, reviewedById: me.id, reviewedAt: new Date() },
  });
  if (result.count === 0) return { ok: false, error: "Application not found." };

  revalidatePath(`/${clubSlug}/elections/${electionId}`);
  return { ok: true };
}

// --- Voting ----------------------------------------------------------------

export async function castVote(
  clubSlug: string,
  electionId: string,
  positionId: string,
  candidacyId: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "election:vote")) return { ok: false, error: "Not authorized." };

  const election = await findElectionInClub(club.id, electionId);
  if (!election) return { ok: false, error: "Election not found." };
  if (getElectionPhase(election, new Date()) !== "voting") {
    return { ok: false, error: "Voting is not open." };
  }

  // Validate the candidacy is an APPROVED candidate for this position, scoped to
  // this election and club — one query, no trust in the client-supplied ids.
  const candidacy = await prisma.candidacy.findFirst({
    where: {
      id: candidacyId,
      positionId,
      status: "APPROVED",
      position: { electionId, election: { clubId: club.id } },
    },
  });
  if (!candidacy) return { ok: false, error: "That candidate is not on the ballot." };

  try {
    // The receipt's unique constraint is the authoritative one-vote guard: two
    // concurrent casts both pass the checks above, and only the index arbitrates.
    await prisma.$transaction([
      prisma.vote.create({ data: { clubId: club.id, positionId, candidacyId } }),
      prisma.voteReceipt.create({ data: { electionId, positionId, membershipId: me.id } }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "You have already voted for this position." };
    }
    throw error;
  }
  revalidatePath(`/${clubSlug}/elections/${electionId}`);
  return { ok: true };
}

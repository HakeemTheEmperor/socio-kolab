import { prisma } from "@/lib/prisma";
import { requireClubAccess } from "@/lib/club-context";
import { can } from "@/lib/permissions";
import { getElectionPhase } from "@/lib/elections";
import { getElectionTallies } from "../../tally-data";

/**
 * Live tally feed for an election (ELECTIONS.md §9). A GET route handler polled
 * by the client every 7s, rather than `router.refresh()` re-rendering the whole
 * RSC tree for a changing number.
 *
 * Route handlers bypass the `(member)` layout guard, so it re-runs the checks:
 * `requireClubAccess` (redirects a non-member) and a compound `{ id, clubId }`
 * fetch (another club's election id must not resolve). Tallies are exposed only
 * once voting is open or the election has closed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clubSlug: string; id: string }> },
) {
  const { clubSlug, id } = await params;
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "election:vote")) {
    return new Response("Forbidden", { status: 403 });
  }

  const election = await prisma.election.findFirst({
    where: { id, clubId: club.id },
  });
  if (!election) return new Response("Not found", { status: 404 });

  const phase = getElectionPhase(election, new Date());
  if (phase !== "voting" && phase !== "closed") {
    return new Response("Results not available", { status: 409 });
  }

  const { tallies, turnout } = await getElectionTallies(club.id, election.id);
  return Response.json(
    { phase, turnout, tallies },
    { headers: { "Cache-Control": "no-store" } },
  );
}

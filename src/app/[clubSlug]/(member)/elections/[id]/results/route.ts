import { prisma } from "@/lib/prisma";
import { requireClubAccess } from "@/lib/club-context";
import { can } from "@/lib/permissions";
import { getElectionPhase, resultsCsv } from "@/lib/elections";
import { slugify } from "@/lib/slug";
import { getElectionTallies } from "../../tally-data";

/**
 * CSV export of an election's final results (ELECTIONS.md §10). A route handler
 * so the browser downloads natively via Content-Disposition; mirrors the event
 * responses export. Results are visible to any member, so the gate is
 * `election:vote` (any ACTIVE member), and only a CLOSED election is exportable.
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

  if (getElectionPhase(election, new Date()) !== "closed") {
    return new Response("Results are not final yet", { status: 409 });
  }

  const { tallies, turnout } = await getElectionTallies(club.id, election.id);

  // Leading BOM (U+FEFF) so Excel opens it as UTF-8.
  const BOM = String.fromCharCode(0xfeff);
  const csv = BOM + resultsCsv(tallies, turnout);
  const filename = `${slugify(election.title) || "election"}-results.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

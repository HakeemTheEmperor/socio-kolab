import { cache } from "react";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";

/**
 * Club resolution and access guards (MULTI-CLUB.md §2.1).
 *
 * Authorization — not the obscurity of an id — is the security boundary. Every
 * request resolves the club from the `[clubSlug]` URL segment and verifies the
 * session user's membership in *that* club, server-side. Both helpers are
 * `cache()`d, so the layout, the page, and any server action in one request
 * share a single lookup.
 */

/**
 * Resolve an ACTIVE club by slug, or 404.
 *
 * PENDING, REJECTED, and SUSPENDED clubs are deliberately indistinguishable
 * from a slug that was never registered: the public must not be able to probe
 * which club names exist.
 */
export const getClubBySlug = cache(async (slug: string) => {
  const club = await prisma.club.findFirst({
    where: { slug, status: "ACTIVE" },
  });
  if (!club) notFound();
  return club;
});

/** Look up the session user's membership in a club. Null when logged out. */
const findMembership = cache(async (clubId: string) => {
  const session = await auth();
  if (!session?.user?.id) return null;

  return prisma.membership.findUnique({
    where: { clubId_userId: { clubId, userId: session.user.id } },
    include: { user: true },
  });
});

export type ClubMembership = NonNullable<
  Awaited<ReturnType<typeof findMembership>>
>;

const ROLE_RANK: Record<Role, number> = { MEMBER: 0, EXEC: 1, PRESIDENT: 2 };

/**
 * Require an ACTIVE membership in `clubId`. Replaces the old global auth check.
 *
 * - Logged out          → /login
 * - No membership, or a membership that is PENDING / INACTIVE / ALUMNI → /clubs,
 *   which explains why (an awaiting-approval card, say) rather than leaking
 *   whether the club has this user on its books.
 * - Role below `minRole` → 404.
 *
 * `minRole` is a hard gate. The user-facing role checks stay with `can()`
 * (`lib/permissions.ts`), which lets a page redirect or a form show a message
 * instead of dead-ending on a 404.
 */
export async function requireMembership(
  clubId: string,
  minRole?: Role,
): Promise<ClubMembership> {
  const membership = await findMembership(clubId);
  if (!membership) {
    const session = await auth();
    redirect(session?.user?.id ? "/clubs?error=no-membership" : "/login");
  }
  if (membership.status !== "ACTIVE") {
    redirect("/clubs?error=inactive-membership");
  }
  if (minRole && ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    notFound();
  }
  return membership;
}

/**
 * The workhorse for club-scoped pages and server actions: resolve the club from
 * its slug and the caller's membership in it, in one call.
 */
export async function requireClubAccess(slug: string, minRole?: Role) {
  const club = await getClubBySlug(slug);
  const membership = await requireMembership(club.id, minRole);
  return { club, membership };
}

/* --------------------------------------------------------------------------
 * Cross-club resource guards (MULTI-CLUB.md §2.2)
 *
 * A cuid is not a capability. Every sub-resource fetched by id filters on the
 * id AND the club in the SAME query — never `findUnique({ id })` followed by a
 * `clubId` comparison, which is one forgotten `if` away from a leak. A valid
 * event id from club A, requested under club B's slug, must simply not resolve.
 *
 * `find*` returns null (server actions turn that into an error message);
 * `require*` 404s (pages and layouts).
 * ---------------------------------------------------------------------------*/

export const findEventInClub = cache(async (clubId: string, eventId: string) =>
  prisma.event.findFirst({ where: { id: eventId, clubId } }),
);

export const findMemberInClub = cache(async (clubId: string, membershipId: string) =>
  prisma.membership.findFirst({ where: { id: membershipId, clubId } }),
);

export async function requireEventInClub(clubId: string, eventId: string) {
  const event = await findEventInClub(clubId, eventId);
  if (!event) notFound();
  return event;
}

export async function requireMemberInClub(clubId: string, membershipId: string) {
  const member = await findMemberInClub(clubId, membershipId);
  if (!member) notFound();
  return member;
}

export const findElectionInClub = cache(async (clubId: string, electionId: string) =>
  prisma.election.findFirst({ where: { id: electionId, clubId } }),
);

export async function requireElectionInClub(clubId: string, electionId: string) {
  const election = await findElectionInClub(clubId, electionId);
  if (!election) notFound();
  return election;
}

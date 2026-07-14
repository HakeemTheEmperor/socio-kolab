import { requireClubAccess, requireMemberInClub } from "@/lib/club-context";

/**
 * Resolves the membership *above* the page's Suspense boundary (`loading.tsx`),
 * so a membership id belonging to another club 404s the response itself rather
 * than rendering a 200 shell and correcting it on the client. See the sibling
 * comment in `events/[id]/layout.tsx`.
 */
export default async function MemberLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clubSlug: string; id: string }>;
}) {
  const { clubSlug, id } = await params;
  const { club } = await requireClubAccess(clubSlug);
  await requireMemberInClub(club.id, id);
  return children;
}

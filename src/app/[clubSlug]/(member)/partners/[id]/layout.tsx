import { notFound } from "next/navigation";

import { requireClubAccess, requirePartnerInClub } from "@/lib/club-context";
import { canSeePartner } from "@/lib/permissions";

/**
 * Resolves the partner *above* the page's Suspense boundary (`loading.tsx`), so
 * a cross-club id 404s the response itself — see `members/[id]/layout.tsx`.
 * Unauthorized members get the same 404: a member who doesn't liaise for a
 * partner should not learn it exists (PARTNERS.md §6.2).
 */
export default async function PartnerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clubSlug: string; id: string }>;
}) {
  const { clubSlug, id } = await params;
  const { club, membership } = await requireClubAccess(clubSlug);
  const partner = await requirePartnerInClub(club.id, id);
  if (!canSeePartner(membership, partner)) notFound();
  return children;
}

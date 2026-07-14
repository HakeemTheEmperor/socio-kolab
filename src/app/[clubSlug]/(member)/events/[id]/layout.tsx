import { requireClubAccess, requireEventInClub } from "@/lib/club-context";

/**
 * Resolves the event before anything below it renders.
 *
 * The guard has to live in a layout, not the page: a page's `notFound()` runs
 * *inside* the nearest Suspense boundary, by which point the shell has flushed
 * and the response is already committed as 200 — the 404 would only happen on
 * the client. MULTI-CLUB §8 requires the *response* to be 404 when a club A
 * event id is requested under club B's slug, so the lookup happens here. (For
 * the same reason `events/` has no route-level `loading.tsx`: it would wrap
 * this segment too.) The lookup is cached, so the page's own compound-scoped
 * query is free.
 */
export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clubSlug: string; id: string }>;
}) {
  const { clubSlug, id } = await params;
  const { club } = await requireClubAccess(clubSlug);
  await requireEventInClub(club.id, id);
  return children;
}

import { getClubTheme } from "@/lib/club";
import { getClubBySlug } from "@/lib/club-context";
import { ThemeStyle } from "@/components/theme-style";

/**
 * Themes everything under `/{clubSlug}/` (UI-REFACTOR.md §A4).
 *
 * It sits above `(member)`, so the public register page is themed too — a club's
 * front door should look like the club. `getClubBySlug` is `cache()`d and is
 * already called by the guard below, so this costs no extra query; it 404s an
 * unknown or unapproved slug before any child renders.
 */
export default async function ClubThemeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  const club = await getClubBySlug(clubSlug);

  return (
    <>
      <ThemeStyle colors={getClubTheme(club.settings)} />
      {children}
    </>
  );
}

import { signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireClubAccess } from "@/lib/club-context";
import { can } from "@/lib/permissions";
import { AppShell } from "@/components/app-shell/app-shell";

export default async function ClubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  // 404s an unknown or unapproved club; sends non-members — and members who
  // aren't ACTIVE (awaiting approval, alumni, …) — to /clubs, which explains why.
  const { club, membership } = await requireClubAccess(clubSlug);

  // The switcher lists the user's other live memberships (§B2); the Members badge
  // counts applications waiting on an exec (§B2). Only execs can act on those, so
  // only execs pay for the count.
  const [otherMemberships, pendingCount, liaisonPartnerCount] = await Promise.all([
    prisma.membership.findMany({
      where: {
        userId: membership.userId,
        status: "ACTIVE",
        clubId: { not: club.id },
        club: { status: "ACTIVE" },
      },
      select: { club: { select: { slug: true, name: true, logoUrl: true } } },
      orderBy: { club: { name: "asc" } },
    }),
    can(membership, "member:approve")
      ? prisma.membership.count({ where: { clubId: club.id, status: "PENDING" } })
      : Promise.resolve(0),
    // Execs see the Partners nav unconditionally, so only non-execs pay for
    // the liaison count (PARTNERS.md §6.3).
    can(membership, "partner:view")
      ? Promise.resolve(0)
      : prisma.partner.count({
          where: { clubId: club.id, liaisonId: membership.id, archivedAt: null },
        }),
  ]);

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AppShell
      club={{ slug: club.slug, name: club.name, logoUrl: club.logoUrl }}
      user={{
        name: membership.user.name,
        role: membership.role,
        status: membership.status,
      }}
      otherClubs={otherMemberships.map((m) => m.club)}
      pendingCount={pendingCount}
      liaisonPartnerCount={liaisonPartnerCount}
      signOut={doSignOut}
      mustChangePassword={membership.user.mustChangePassword}
    >
      {children}
    </AppShell>
  );
}

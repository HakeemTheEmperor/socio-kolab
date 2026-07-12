import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentClub } from "@/lib/club";

/**
 * Resolve the current user's membership in the current club, fresh from the DB.
 * Returns null when logged out or when the user has no membership in the club.
 * Includes the related `user` for name/email.
 */
export const getCurrentMembership = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const club = await getCurrentClub();
  const membership = await prisma.membership.findUnique({
    where: {
      clubId_userId: { clubId: club.id, userId: session.user.id },
    },
    include: { user: true },
  });
  return membership;
});

export type CurrentMembership = NonNullable<
  Awaited<ReturnType<typeof getCurrentMembership>>
>;

/**
 * Guard for server actions / server components: returns the membership or
 * redirects to /login. Use at the top of every authenticated server action.
 */
export async function requireMembership(): Promise<CurrentMembership> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/login");
  return membership;
}
